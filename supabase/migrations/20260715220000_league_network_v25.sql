begin;

alter table public.discord_users
  add column if not exists is_banned boolean not null default false,
  add column if not exists banned_at timestamptz,
  add column if not exists banned_by text,
  add column if not exists banned_reason text;

alter table public.league_channels
  add column if not exists image_url text;

create table if not exists public.league_channel_permissions (
  channel_id uuid not null references public.league_channels(id) on delete cascade,
  discord_user_id text not null,
  can_view boolean,
  can_post boolean,
  can_manage boolean,
  muted_until timestamptz,
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key(channel_id,discord_user_id)
);

create index if not exists league_presence_last_seen_idx
  on public.league_presence(last_seen_at desc);

create or replace function public.league_network_current_user_id()
returns text language sql stable security definer set search_path=public as $$
  select id::text from public.discord_users
  where auth_user_id=auth.uid()
    and is_active is not false
    and is_banned is not true
  limit 1
$$;

create or replace function public.league_network_is_commissioner()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.discord_users
    where auth_user_id=auth.uid()
      and is_active is not false
      and is_banned is not true
      and is_commissioner is true
  )
$$;

create or replace function public.link_my_discord_user()
returns public.discord_users
language plpgsql security definer set search_path=public,auth as $$
declare
  v_uid uuid := auth.uid();
  v_claims jsonb := auth.jwt();
  v_meta jsonb := coalesce(v_claims->'user_metadata','{}'::jsonb);
  v_discord_id text;
  v_name text;
  v_avatar text;
  v_row public.discord_users;
begin
  if v_uid is null then raise exception 'Discord sign-in required'; end if;
  select coalesce(identity_data->>'sub',identity_data->>'id') into v_discord_id
    from auth.identities where user_id=v_uid and provider='discord' order by created_at limit 1;
  v_discord_id := coalesce(v_discord_id,v_meta->>'provider_id');
  v_name := coalesce(v_meta->>'user_name',v_meta->>'preferred_username',v_meta->>'name',v_meta->>'full_name');
  v_name := regexp_replace(trim(v_name),'#0$','','i');
  v_avatar := v_meta->>'avatar_url';
  if nullif(trim(v_name),'') is null then raise exception 'Discord username was not returned'; end if;

  select * into v_row from public.discord_users
   where auth_user_id=v_uid
      or (v_discord_id is not null and discord_id=v_discord_id)
      or regexp_replace(lower(trim(discord_username)),'#0$','','i')=lower(v_name)
   order by case when auth_user_id=v_uid then 0 when discord_id=v_discord_id then 1 else 2 end
   limit 1;

  if v_row.id is null then
    insert into public.discord_users(discord_username,discord_id,auth_user_id,discord_avatar_url,is_active,is_banned)
    values(v_name,v_discord_id,v_uid,v_avatar,true,false) returning * into v_row;
  else
    if v_row.is_banned is true then
      raise exception 'League access suspended: %',coalesce(nullif(v_row.banned_reason,''),'Contact a commissioner for details');
    end if;
    update public.discord_users set
      discord_username=coalesce(nullif(trim(discord_username),''),v_name),
      discord_id=coalesce(v_discord_id,discord_id),
      auth_user_id=v_uid,
      discord_avatar_url=coalesce(v_avatar,discord_avatar_url)
    where id=v_row.id returning * into v_row;
  end if;
  return v_row;
end;
$$;

create or replace function public.league_network_can_view_channel(p_channel_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select case
    when public.league_network_is_commissioner() then true
    when public.league_network_current_user_id() is null then false
    else exists(
      select 1 from public.league_channels c
      left join public.league_channel_permissions cp
        on cp.channel_id=c.id and cp.discord_user_id=public.league_network_current_user_id()
      where c.id=p_channel_id and c.is_archived=false and coalesce(cp.can_view,true)
    )
  end
$$;

create or replace function public.league_network_can_manage_channel(p_channel_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.league_network_is_commissioner() or exists(
    select 1 from public.league_channel_permissions cp
    where cp.channel_id=p_channel_id
      and cp.discord_user_id=public.league_network_current_user_id()
      and cp.can_manage is true
  )
$$;

create or replace function public.league_network_can_post_channel(p_channel_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select case
    when public.league_network_can_manage_channel(p_channel_id) then true
    when not public.league_network_can_view_channel(p_channel_id) then false
    else exists(
      select 1 from public.league_channels c
      left join public.league_channel_permissions cp
        on cp.channel_id=c.id and cp.discord_user_id=public.league_network_current_user_id()
      where c.id=p_channel_id
        and c.is_archived=false
        and c.is_locked=false
        and c.channel_type<>'announcements'
        and coalesce(cp.can_post,true)
        and (cp.muted_until is null or cp.muted_until<=now())
    )
  end
$$;

create or replace function public.touch_league_presence(p_active_tab text default null,p_status text default 'online')
returns public.league_presence language plpgsql security definer set search_path=public as $$
declare v_member public.discord_users; v_presence public.league_presence;
begin
  select * into v_member from public.discord_users where auth_user_id=auth.uid() limit 1;
  if v_member.id is null then raise exception 'Active league membership required'; end if;
  if v_member.is_banned is true then
    raise exception 'League access suspended: %',coalesce(nullif(v_member.banned_reason,''),'Contact a commissioner for details');
  end if;
  if v_member.is_active is false then raise exception 'League membership is inactive'; end if;
  insert into public.league_presence(auth_user_id,discord_user_id,status,active_tab,last_seen_at)
  values(auth.uid(),v_member.id::text,case when p_status in ('online','away','busy','offline') then p_status else 'online' end,left(p_active_tab,80),now())
  on conflict(auth_user_id) do update set discord_user_id=excluded.discord_user_id,status=excluded.status,active_tab=excluded.active_tab,last_seen_at=excluded.last_seen_at
  returning * into v_presence;
  return v_presence;
end;
$$;

create or replace function public.manage_league_channel(
  p_channel_id uuid,
  p_name text,
  p_slug text,
  p_description text default '',
  p_icon text default '#',
  p_image_url text default null,
  p_channel_type text default 'public',
  p_sort_order integer default 100,
  p_is_locked boolean default false
)
returns public.league_channels language plpgsql security definer set search_path=public as $$
declare v_channel public.league_channels; v_slug text;
begin
  if not public.league_network_is_commissioner() then raise exception 'Commissioner access required'; end if;
  if char_length(trim(coalesce(p_name,''))) not between 2 and 60 then raise exception 'Channel name must be 2 to 60 characters'; end if;
  v_slug:=regexp_replace(lower(trim(coalesce(p_slug,p_name))),'[^a-z0-9]+','-','g');
  v_slug:=trim(both '-' from v_slug);
  if char_length(v_slug) not between 2 and 60 then raise exception 'Enter a valid channel slug'; end if;
  if p_channel_type not in ('public','announcements','game','sportsbook','streams') then raise exception 'Invalid channel type'; end if;
  if p_channel_id is null then
    insert into public.league_channels(slug,name,description,icon,image_url,channel_type,sort_order,is_locked,is_archived,created_by)
    values(v_slug,trim(p_name),left(coalesce(p_description,''),240),left(coalesce(nullif(trim(p_icon),''),'#'),20),nullif(trim(p_image_url),''),p_channel_type,coalesce(p_sort_order,100),coalesce(p_is_locked,false),false,public.league_network_current_user_id())
    returning * into v_channel;
  else
    update public.league_channels set slug=v_slug,name=trim(p_name),description=left(coalesce(p_description,''),240),icon=left(coalesce(nullif(trim(p_icon),''),'#'),20),image_url=nullif(trim(p_image_url),''),channel_type=p_channel_type,sort_order=coalesce(p_sort_order,sort_order),is_locked=coalesce(p_is_locked,false),updated_at=now()
    where id=p_channel_id returning * into v_channel;
    if v_channel.id is null then raise exception 'Channel not found'; end if;
  end if;
  return v_channel;
end;
$$;

create or replace function public.archive_league_channel(p_channel_id uuid,p_archived boolean default true)
returns void language plpgsql security definer set search_path=public as $$
declare v_slug text;
begin
  if not public.league_network_is_commissioner() then raise exception 'Commissioner access required'; end if;
  select slug into v_slug from public.league_channels where id=p_channel_id;
  if v_slug in ('announcements','general') and p_archived then raise exception 'Core league channels cannot be deleted'; end if;
  update public.league_channels set is_archived=p_archived,updated_at=now() where id=p_channel_id;
end;
$$;

create or replace function public.set_league_channel_permission(
  p_channel_id uuid,
  p_discord_user_id text,
  p_can_view boolean default null,
  p_can_post boolean default null,
  p_can_manage boolean default null,
  p_muted_until timestamptz default null
)
returns public.league_channel_permissions language plpgsql security definer set search_path=public as $$
declare v_permission public.league_channel_permissions;
begin
  if not public.league_network_is_commissioner() then raise exception 'Commissioner access required'; end if;
  if not exists(select 1 from public.discord_users where id::text=p_discord_user_id) then raise exception 'League member not found'; end if;
  insert into public.league_channel_permissions(channel_id,discord_user_id,can_view,can_post,can_manage,muted_until,updated_by,updated_at)
  values(p_channel_id,p_discord_user_id,p_can_view,p_can_post,p_can_manage,p_muted_until,public.league_network_current_user_id(),now())
  on conflict(channel_id,discord_user_id) do update set can_view=excluded.can_view,can_post=excluded.can_post,can_manage=excluded.can_manage,muted_until=excluded.muted_until,updated_by=excluded.updated_by,updated_at=now()
  returning * into v_permission;
  return v_permission;
end;
$$;

create or replace function public.send_league_channel_message(p_channel_id uuid,p_body text,p_reply_to_id uuid default null)
returns public.league_channel_messages language plpgsql security definer set search_path=public as $$
declare v_user_id text; v_channel public.league_channels; v_message public.league_channel_messages;
begin
  v_user_id:=public.ensure_league_network_profile();
  select * into v_channel from public.league_channels where id=p_channel_id and is_archived=false;
  if v_channel.id is null then raise exception 'Channel not found'; end if;
  if not public.league_network_can_post_channel(p_channel_id) then raise exception 'You do not have permission to post in this channel'; end if;
  if p_reply_to_id is not null and not exists(select 1 from public.league_channel_messages where id=p_reply_to_id and channel_id=p_channel_id and deleted_at is null) then raise exception 'Reply target not found'; end if;
  if char_length(trim(coalesce(p_body,''))) not between 1 and 4000 then raise exception 'Message must be between 1 and 4000 characters'; end if;
  if exists(select 1 from public.league_channel_messages where author_discord_user_id=v_user_id and created_at>now()-interval '1 second') then raise exception 'Please wait a moment before sending another message'; end if;
  insert into public.league_channel_messages(channel_id,author_discord_user_id,body,reply_to_id,message_type)
  values(p_channel_id,v_user_id,trim(p_body),p_reply_to_id,case when v_channel.channel_type='announcements' then 'announcement' else 'message' end)
  returning * into v_message;
  return v_message;
end;
$$;

create or replace function public.edit_league_channel_message(p_message_id uuid,p_body text)
returns public.league_channel_messages language plpgsql security definer set search_path=public as $$
declare v_message public.league_channel_messages; v_user text;
begin
  v_user:=public.league_network_current_user_id();
  select * into v_message from public.league_channel_messages where id=p_message_id and deleted_at is null;
  if v_message.id is null then raise exception 'Message not found'; end if;
  if v_message.author_discord_user_id<>v_user and not public.league_network_can_manage_channel(v_message.channel_id) then raise exception 'You cannot edit this message'; end if;
  if char_length(trim(coalesce(p_body,''))) not between 1 and 4000 then raise exception 'Message must be between 1 and 4000 characters'; end if;
  update public.league_channel_messages set body=trim(p_body),edited_at=now() where id=p_message_id returning * into v_message;
  return v_message;
end;
$$;

create or replace function public.delete_league_channel_message(p_message_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_message public.league_channel_messages; v_user text;
begin
  v_user:=public.league_network_current_user_id();
  select * into v_message from public.league_channel_messages where id=p_message_id and deleted_at is null;
  if v_message.id is null then return; end if;
  if v_message.author_discord_user_id<>v_user and not public.league_network_can_manage_channel(v_message.channel_id) then raise exception 'You cannot delete this message'; end if;
  update public.league_channel_messages set deleted_at=now() where id=p_message_id;
end;
$$;

create or replace function public.toggle_league_message_reaction(p_message_id uuid,p_reaction text)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_user text; v_exists boolean;
begin
  v_user:=public.league_network_current_user_id();
  if v_user is null then raise exception 'Active league membership required'; end if;
  if char_length(p_reaction) not between 1 and 20 then raise exception 'Invalid reaction'; end if;
  if not exists(select 1 from public.league_channel_messages m where m.id=p_message_id and m.deleted_at is null and public.league_network_can_view_channel(m.channel_id)) then raise exception 'Message not found'; end if;
  select exists(select 1 from public.league_message_reactions where message_id=p_message_id and discord_user_id=v_user and reaction=p_reaction) into v_exists;
  if v_exists then
    delete from public.league_message_reactions where message_id=p_message_id and discord_user_id=v_user and reaction=p_reaction;
    return false;
  end if;
  insert into public.league_message_reactions(message_id,discord_user_id,reaction) values(p_message_id,v_user,p_reaction) on conflict do nothing;
  return true;
end;
$$;

create or replace function public.notify_league_channel_message()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_channel public.league_channels; v_reply_author text;
begin
  select * into v_channel from public.league_channels where id=new.channel_id;
  if new.message_type='announcement' then
    insert into public.app_notifications(auth_user_id,discord_user_id,notification_type,title,body,target_tab,target_id,actor_discord_user_id)
    select du.auth_user_id,du.id::text,'announcement',v_channel.name,left(new.body,180),'leagueHub',new.channel_id::text,new.author_discord_user_id
    from public.discord_users du left join public.notification_preferences np on np.auth_user_id=du.auth_user_id
    where du.is_active is not false and du.is_banned is not true and du.auth_user_id is not null and du.id::text<>new.author_discord_user_id and coalesce(np.announcements,true);
  end if;
  insert into public.app_notifications(auth_user_id,discord_user_id,notification_type,title,body,target_tab,target_id,actor_discord_user_id)
  select du.auth_user_id,du.id::text,'mention','You were mentioned in #'||v_channel.slug,left(new.body,180),'leagueHub',new.channel_id::text,new.author_discord_user_id
  from public.discord_users du left join public.notification_preferences np on np.auth_user_id=du.auth_user_id
  where du.is_active is not false and du.is_banned is not true and du.auth_user_id is not null and du.id::text<>new.author_discord_user_id and coalesce(np.mentions,true)
    and position('@'||lower(du.discord_username) in lower(new.body))>0;
  if new.reply_to_id is not null then
    select author_discord_user_id into v_reply_author from public.league_channel_messages where id=new.reply_to_id;
    insert into public.app_notifications(auth_user_id,discord_user_id,notification_type,title,body,target_tab,target_id,actor_discord_user_id)
    select du.auth_user_id,du.id::text,'reply','New reply in #'||v_channel.slug,left(new.body,180),'leagueHub',new.channel_id::text,new.author_discord_user_id
    from public.discord_users du left join public.notification_preferences np on np.auth_user_id=du.auth_user_id
    where du.id::text=v_reply_author and du.id::text<>new.author_discord_user_id and du.auth_user_id is not null and du.is_banned is not true and coalesce(np.mentions,true)
      and not exists(select 1 from public.app_notifications n where n.auth_user_id=du.auth_user_id and n.notification_type='mention' and n.target_id=new.channel_id::text and n.actor_discord_user_id=new.author_discord_user_id and n.created_at>now()-interval '2 seconds');
  end if;
  return new;
end;
$$;

create or replace function public.set_league_member_ban(p_discord_user_id text,p_banned boolean,p_reason text default null)
returns public.discord_users language plpgsql security definer set search_path=public as $$
declare v_target public.discord_users; v_me text; v_commissioners integer;
begin
  if not public.league_network_is_commissioner() then raise exception 'Commissioner access required'; end if;
  v_me:=public.league_network_current_user_id();
  select * into v_target from public.discord_users where id::text=p_discord_user_id;
  if v_target.id is null then raise exception 'League member not found'; end if;
  if p_banned and v_target.id::text=v_me then raise exception 'You cannot ban your own commissioner account'; end if;
  if p_banned and v_target.is_commissioner then
    select count(*) into v_commissioners from public.discord_users where is_commissioner and is_active is not false and is_banned is not true;
    if v_commissioners<=1 then raise exception 'The final active commissioner cannot be banned'; end if;
  end if;
  update public.discord_users set
    is_banned=p_banned,
    is_active=case when p_banned then false else true end,
    banned_at=case when p_banned then now() else null end,
    banned_by=case when p_banned then v_me else null end,
    banned_reason=case when p_banned then left(coalesce(nullif(trim(p_reason),''),'Removed by a commissioner'),500) else null end,
    is_commissioner=case when p_banned then false else is_commissioner end
  where id=v_target.id returning * into v_target;
  update public.league_presence set status='offline',last_seen_at=now()-interval '1 day' where discord_user_id=p_discord_user_id;
  return v_target;
end;
$$;

alter table public.league_channel_permissions enable row level security;
drop policy if exists network_permission_read on public.league_channel_permissions;
create policy network_permission_read on public.league_channel_permissions for select to authenticated
  using (public.league_network_is_commissioner() or discord_user_id=public.league_network_current_user_id() or public.league_network_can_manage_channel(channel_id));

drop policy if exists network_read on public.league_channels;
create policy network_read on public.league_channels for select to authenticated
  using (public.league_network_can_view_channel(id));
drop policy if exists network_read on public.league_channel_messages;
create policy network_read on public.league_channel_messages for select to authenticated
  using (public.league_network_can_view_channel(channel_id));
drop policy if exists network_read on public.league_message_reactions;
create policy network_read on public.league_message_reactions for select to authenticated
  using (exists(select 1 from public.league_channel_messages m where m.id=message_id and public.league_network_can_view_channel(m.channel_id)));
drop policy if exists network_presence_read on public.league_presence;
create policy network_presence_read on public.league_presence for select to authenticated
  using (public.league_network_current_user_id() is not null);

revoke all on public.league_channel_permissions from anon;
grant select on public.league_channel_permissions to authenticated;
grant select on public.league_presence to authenticated;
grant execute on function public.touch_league_presence(text,text) to authenticated;
grant execute on function public.manage_league_channel(uuid,text,text,text,text,text,text,integer,boolean) to authenticated;
grant execute on function public.archive_league_channel(uuid,boolean) to authenticated;
grant execute on function public.set_league_channel_permission(uuid,text,boolean,boolean,boolean,timestamptz) to authenticated;
grant execute on function public.edit_league_channel_message(uuid,text) to authenticated;
grant execute on function public.delete_league_channel_message(uuid) to authenticated;
grant execute on function public.toggle_league_message_reaction(uuid,text) to authenticated;
grant execute on function public.set_league_member_ban(text,boolean,text) to authenticated;

create or replace view public.league_member_directory with (security_invoker=true) as
select id::text as id,discord_username,is_active,is_commissioner,discord_avatar_url
from public.discord_users where is_active is not false and is_banned is not true;
revoke all on public.league_member_directory from anon;
grant select on public.league_member_directory to authenticated;
grant select(id,discord_username,is_active,is_commissioner,discord_avatar_url,sportsbook_seed,sportsbook_notes,is_banned,banned_at,banned_by,banned_reason) on public.discord_users to authenticated;
grant update(discord_username,is_active,is_commissioner,sportsbook_seed,sportsbook_notes,is_banned,banned_at,banned_by,banned_reason) on public.discord_users to authenticated;

do $$ begin
  begin alter publication supabase_realtime add table public.league_presence; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.league_channel_permissions; exception when duplicate_object then null; end;
end $$;

commit;

select 'League Network v25: moderation, permissions, presence, replies and reactions ready' as status;
