begin;

create table if not exists public.league_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(trim(name)) between 2 and 32),
  color text not null default '#94a3b8' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  position integer not null default 100,
  is_default boolean not null default false,
  is_managed boolean not null default false,
  can_manage_channels boolean not null default false,
  can_manage_messages boolean not null default false,
  can_manage_members boolean not null default false,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.league_role_members (
  role_id uuid not null references public.league_roles(id) on delete cascade,
  discord_user_id text not null,
  assigned_by text,
  assigned_at timestamptz not null default now(),
  primary key(role_id,discord_user_id)
);

create index if not exists league_role_members_user_idx on public.league_role_members(discord_user_id);

insert into public.league_roles(name,color,position,is_default,is_managed)
values('League Member','#94a3b8',10,true,true)
on conflict(name) do update set is_default=true,is_managed=true;

insert into public.league_roles(name,color,position,is_managed,can_manage_channels,can_manage_messages,can_manage_members)
values('Commissioner','#facc15',1000,true,true,true,true)
on conflict(name) do update set is_managed=true,can_manage_channels=true,can_manage_messages=true,can_manage_members=true;

insert into public.league_role_members(role_id,discord_user_id)
select r.id,du.id::text from public.league_roles r cross join public.discord_users du
where r.name='League Member' and du.is_active is not false and du.is_banned is not true
on conflict do nothing;

create or replace function public.sync_managed_league_roles()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_member uuid; v_commissioner uuid;
begin
  select id into v_member from public.league_roles where name='League Member';
  select id into v_commissioner from public.league_roles where name='Commissioner';
  if new.is_active is not false and new.is_banned is not true then
    insert into public.league_role_members(role_id,discord_user_id) values(v_member,new.id::text) on conflict do nothing;
    if new.is_commissioner is true then insert into public.league_role_members(role_id,discord_user_id) values(v_commissioner,new.id::text) on conflict do nothing;
    else delete from public.league_role_members where role_id=v_commissioner and discord_user_id=new.id::text; end if;
  else
    delete from public.league_role_members where discord_user_id=new.id::text and role_id in (v_member,v_commissioner);
  end if;
  return new;
end;
$$;

drop trigger if exists sync_managed_roles_on_member on public.discord_users;
create trigger sync_managed_roles_on_member after insert or update of is_active,is_banned,is_commissioner on public.discord_users
for each row execute function public.sync_managed_league_roles();

insert into public.league_role_members(role_id,discord_user_id)
select r.id,du.id::text from public.league_roles r cross join public.discord_users du
where r.name='Commissioner' and du.is_commissioner is true and du.is_active is not false and du.is_banned is not true
on conflict do nothing;

create or replace function public.league_network_has_role_permission(p_permission text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.league_role_members rm
    join public.league_roles r on r.id=rm.role_id
    where rm.discord_user_id=public.league_network_current_user_id()
      and case p_permission
        when 'manage_channels' then r.can_manage_channels
        when 'manage_messages' then r.can_manage_messages
        when 'manage_members' then r.can_manage_members
        else false
      end
  )
$$;

create or replace function public.manage_league_role(
  p_role_id uuid,
  p_name text,
  p_color text default '#94a3b8',
  p_position integer default 100,
  p_can_manage_channels boolean default false,
  p_can_manage_messages boolean default false,
  p_can_manage_members boolean default false
)
returns public.league_roles language plpgsql security definer set search_path=public as $$
declare v_role public.league_roles;
begin
  if not public.league_network_is_commissioner() then raise exception 'Commissioner access required'; end if;
  if char_length(trim(coalesce(p_name,''))) not between 2 and 32 then raise exception 'Role name must be 2 to 32 characters'; end if;
  if coalesce(p_color,'') !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'Choose a valid role color'; end if;
  if p_role_id is null then
    insert into public.league_roles(name,color,position,can_manage_channels,can_manage_messages,can_manage_members,created_by)
    values(trim(p_name),p_color,coalesce(p_position,100),coalesce(p_can_manage_channels,false),coalesce(p_can_manage_messages,false),coalesce(p_can_manage_members,false),public.league_network_current_user_id())
    returning * into v_role;
  else
    update public.league_roles set name=trim(p_name),color=p_color,position=coalesce(p_position,position),
      can_manage_channels=coalesce(p_can_manage_channels,false),can_manage_messages=coalesce(p_can_manage_messages,false),can_manage_members=coalesce(p_can_manage_members,false),updated_at=now()
    where id=p_role_id and is_managed=false returning * into v_role;
    if v_role.id is null then raise exception 'Managed roles cannot be edited'; end if;
  end if;
  return v_role;
end;
$$;

create or replace function public.set_league_role_member(p_role_id uuid,p_discord_user_id text,p_assigned boolean)
returns void language plpgsql security definer set search_path=public as $$
declare v_role public.league_roles;
begin
  if not (public.league_network_is_commissioner() or public.league_network_has_role_permission('manage_members')) then raise exception 'Member management permission required'; end if;
  select * into v_role from public.league_roles where id=p_role_id;
  if v_role.id is null then raise exception 'Role not found'; end if;
  if v_role.is_managed then raise exception 'Managed role membership is automatic'; end if;
  if p_assigned then
    insert into public.league_role_members(role_id,discord_user_id,assigned_by)
    values(p_role_id,p_discord_user_id,public.league_network_current_user_id()) on conflict do nothing;
  else
    delete from public.league_role_members where role_id=p_role_id and discord_user_id=p_discord_user_id;
  end if;
end;
$$;

create or replace function public.delete_league_role(p_role_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.league_network_is_commissioner() then raise exception 'Commissioner access required'; end if;
  delete from public.league_roles where id=p_role_id and is_managed=false;
  if not found then raise exception 'Managed roles cannot be deleted'; end if;
end;
$$;

create or replace function public.league_network_can_manage_channel(p_channel_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.league_network_is_commissioner()
    or public.league_network_has_role_permission('manage_channels')
    or public.league_network_has_role_permission('manage_messages')
    or exists(
      select 1 from public.league_channel_permissions cp
      where cp.channel_id=p_channel_id and cp.discord_user_id=public.league_network_current_user_id() and cp.can_manage is true
    )
$$;

create or replace function public.manage_league_channel(
  p_channel_id uuid,p_name text,p_slug text,p_description text default '',p_icon text default '#',p_image_url text default null,
  p_channel_type text default 'public',p_sort_order integer default 100,p_is_locked boolean default false
)
returns public.league_channels language plpgsql security definer set search_path=public as $$
declare v_channel public.league_channels; v_slug text;
begin
  if not (public.league_network_is_commissioner() or public.league_network_has_role_permission('manage_channels')) then raise exception 'Channel management permission required'; end if;
  if char_length(trim(coalesce(p_name,''))) not between 2 and 60 then raise exception 'Channel name must be 2 to 60 characters'; end if;
  v_slug:=trim(both '-' from regexp_replace(lower(trim(coalesce(p_slug,p_name))),'[^a-z0-9]+','-','g'));
  if char_length(v_slug) not between 2 and 60 then raise exception 'Enter a valid channel slug'; end if;
  if p_channel_type not in ('public','announcements','game','sportsbook','streams') then raise exception 'Invalid channel type'; end if;
  if p_channel_id is null then
    insert into public.league_channels(slug,name,description,icon,image_url,channel_type,sort_order,is_locked,is_archived,created_by)
    values(v_slug,trim(p_name),left(coalesce(p_description,''),240),left(coalesce(nullif(trim(p_icon),''),'#'),20),nullif(trim(p_image_url),''),p_channel_type,coalesce(p_sort_order,100),coalesce(p_is_locked,false),false,public.league_network_current_user_id()) returning * into v_channel;
  else
    update public.league_channels set slug=v_slug,name=trim(p_name),description=left(coalesce(p_description,''),240),icon=left(coalesce(nullif(trim(p_icon),''),'#'),20),image_url=nullif(trim(p_image_url),''),channel_type=p_channel_type,sort_order=coalesce(p_sort_order,sort_order),is_locked=coalesce(p_is_locked,false),updated_at=now()
    where id=p_channel_id and is_auto_matchup=false returning * into v_channel;
    if v_channel.id is null then raise exception 'Automatic matchup rooms cannot be edited'; end if;
  end if;
  return v_channel;
end;
$$;

create or replace function public.archive_league_channel(p_channel_id uuid,p_archived boolean default true)
returns void language plpgsql security definer set search_path=public as $$
declare v_slug text; v_auto boolean;
begin
  if not (public.league_network_is_commissioner() or public.league_network_has_role_permission('manage_channels')) then raise exception 'Channel management permission required'; end if;
  select slug,is_auto_matchup into v_slug,v_auto from public.league_channels where id=p_channel_id;
  if v_auto then raise exception 'Automatic matchup rooms are managed by week advancement'; end if;
  if v_slug in ('announcements','general') and p_archived then raise exception 'Core league channels cannot be deleted'; end if;
  update public.league_channels set is_archived=p_archived,updated_at=now() where id=p_channel_id;
end;
$$;

create or replace function public.set_league_channel_permission(
  p_channel_id uuid,p_discord_user_id text,p_can_view boolean default null,p_can_post boolean default null,
  p_can_manage boolean default null,p_muted_until timestamptz default null
)
returns public.league_channel_permissions language plpgsql security definer set search_path=public as $$
declare v_permission public.league_channel_permissions;
begin
  if not (public.league_network_is_commissioner() or public.league_network_has_role_permission('manage_channels')) then raise exception 'Channel management permission required'; end if;
  if not exists(select 1 from public.discord_users where id::text=p_discord_user_id) then raise exception 'League member not found'; end if;
  insert into public.league_channel_permissions(channel_id,discord_user_id,can_view,can_post,can_manage,muted_until,updated_by,updated_at)
  values(p_channel_id,p_discord_user_id,p_can_view,p_can_post,p_can_manage,p_muted_until,public.league_network_current_user_id(),now())
  on conflict(channel_id,discord_user_id) do update set can_view=excluded.can_view,can_post=excluded.can_post,can_manage=excluded.can_manage,muted_until=excluded.muted_until,updated_by=excluded.updated_by,updated_at=now()
  returning * into v_permission;
  return v_permission;
end;
$$;

alter table public.league_roles enable row level security;
alter table public.league_role_members enable row level security;
drop policy if exists league_roles_read on public.league_roles;
create policy league_roles_read on public.league_roles for select to authenticated using(public.league_network_current_user_id() is not null);
drop policy if exists league_roles_write on public.league_roles;
create policy league_roles_write on public.league_roles for all to authenticated using(public.league_network_is_commissioner()) with check(public.league_network_is_commissioner());
drop policy if exists league_role_members_read on public.league_role_members;
create policy league_role_members_read on public.league_role_members for select to authenticated using(public.league_network_current_user_id() is not null);
drop policy if exists league_role_members_write on public.league_role_members;
create policy league_role_members_write on public.league_role_members for all to authenticated using(public.league_network_is_commissioner() or public.league_network_has_role_permission('manage_members')) with check(public.league_network_is_commissioner() or public.league_network_has_role_permission('manage_members'));

revoke all on public.league_roles,public.league_role_members from anon;
grant select,insert,update,delete on public.league_roles,public.league_role_members to authenticated;
grant execute on function public.league_network_has_role_permission(text) to authenticated;
grant execute on function public.manage_league_role(uuid,text,text,integer,boolean,boolean,boolean) to authenticated;
grant execute on function public.set_league_role_member(uuid,text,boolean) to authenticated;
grant execute on function public.delete_league_role(uuid) to authenticated;

commit;

select 'CFBElite 27 League Hub roles v29 migration complete' as status;
