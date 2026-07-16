begin;

create extension if not exists pgcrypto;

create or replace function public.league_network_current_user_id()
returns text language sql stable security definer set search_path=public as $$
  select id::text from public.discord_users
  where auth_user_id=auth.uid() and is_active is not false
  limit 1
$$;

create or replace function public.league_network_is_commissioner()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.discord_users
    where auth_user_id=auth.uid() and is_active is not false and is_commissioner is true
  )
$$;

create table if not exists public.league_channels (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  description text not null default '',
  icon text not null default '#',
  channel_type text not null default 'public' check (channel_type in ('public','announcements','game','sportsbook','streams')),
  sort_order integer not null default 100,
  is_locked boolean not null default false,
  is_archived boolean not null default false,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.league_channel_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.league_channels(id) on delete cascade,
  author_discord_user_id text not null,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  reply_to_id uuid references public.league_channel_messages(id) on delete set null,
  message_type text not null default 'message' check (message_type in ('message','announcement','system','game_update','stream_live')),
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists league_channel_messages_channel_created_idx
  on public.league_channel_messages(channel_id,created_at desc);

create table if not exists public.league_message_reactions (
  message_id uuid not null references public.league_channel_messages(id) on delete cascade,
  discord_user_id text not null,
  reaction text not null check (char_length(reaction) between 1 and 20),
  created_at timestamptz not null default now(),
  primary key(message_id,discord_user_id,reaction)
);

create table if not exists public.direct_conversations (
  id uuid primary key default gen_random_uuid(),
  conversation_key text not null unique,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table if not exists public.direct_conversation_members (
  conversation_id uuid not null references public.direct_conversations(id) on delete cascade,
  discord_user_id text not null,
  last_read_at timestamptz,
  muted boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key(conversation_id,discord_user_id)
);

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.direct_conversations(id) on delete cascade,
  author_discord_user_id text not null,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  reply_to_id uuid references public.direct_messages(id) on delete set null,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists direct_messages_conversation_created_idx
  on public.direct_messages(conversation_id,created_at desc);

create table if not exists public.stream_profiles (
  id uuid primary key default gen_random_uuid(),
  discord_user_id text not null,
  platform text not null check (platform in ('twitch','youtube','kick')),
  channel_key text not null,
  channel_url text not null,
  display_name text not null default '',
  embed_url text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(discord_user_id,platform)
);

create table if not exists public.live_stream_status (
  profile_id uuid primary key references public.stream_profiles(id) on delete cascade,
  is_live boolean not null default false,
  stream_title text,
  category_name text,
  thumbnail_url text,
  viewer_count integer not null default 0,
  live_video_id text,
  started_at timestamptz,
  checked_at timestamptz not null default now(),
  last_error text
);

create table if not exists public.notification_preferences (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  discord_user_id text not null,
  in_app_enabled boolean not null default true,
  push_enabled boolean not null default false,
  sound_enabled boolean not null default true,
  menu_sounds boolean not null default false,
  team_sounds boolean not null default false,
  announcements boolean not null default true,
  direct_messages boolean not null default true,
  mentions boolean not null default true,
  streams_live boolean not null default true,
  game_results boolean not null default true,
  advancement boolean not null default true,
  elite_books boolean not null default true,
  quiet_hours_start time,
  quiet_hours_end time,
  updated_at timestamptz not null default now()
);

create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  discord_user_id text not null,
  notification_type text not null,
  title text not null,
  body text not null default '',
  target_tab text,
  target_id text,
  actor_discord_user_id text,
  read_at timestamptz,
  push_sent_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.app_notifications add column if not exists push_sent_at timestamptz;

create index if not exists app_notifications_user_created_idx
  on public.app_notifications(auth_user_id,created_at desc);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_secret text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);

create table if not exists public.league_presence (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  discord_user_id text not null,
  status text not null default 'online' check (status in ('online','away','busy','offline')),
  active_tab text,
  last_seen_at timestamptz not null default now()
);

create table if not exists public.moderation_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_auth_user_id uuid not null references auth.users(id) on delete cascade,
  reporter_discord_user_id text not null,
  content_type text not null check (content_type in ('channel_message','direct_message','profile')),
  content_id text not null,
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  status text not null default 'open' check (status in ('open','reviewed','resolved','dismissed')),
  reviewed_by text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists public.commissioner_audit_log (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid,
  discord_user_id text,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

insert into public.league_channels(slug,name,description,icon,channel_type,sort_order,is_locked) values
  ('announcements','Announcements','Official league news, deadlines and commissioner updates.','!','announcements',10,true),
  ('general','General','The main CFB Elite league conversation.','#','public',20,false),
  ('game-day','Game Day','Live reactions, scores and matchup conversation.','G','game',30,false),
  ('elite-books','Elite Books','Lines, tickets, results and sportsbook talk.','$','sportsbook',40,false),
  ('recruiting','Recruiting','Classes, battles, prospects and program building.','R','public',50,false),
  ('streams','RedZone Live','Automatic live-stream alerts and watch parties.','LIVE','streams',60,false)
on conflict(slug) do update set name=excluded.name,description=excluded.description,icon=excluded.icon,channel_type=excluded.channel_type,sort_order=excluded.sort_order;

create or replace function public.league_network_is_conversation_member(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.direct_conversation_members
    where conversation_id=p_conversation_id and discord_user_id=public.league_network_current_user_id()
  )
$$;

create or replace function public.ensure_league_network_profile()
returns text language plpgsql security definer set search_path=public as $$
declare v_user_id text;
begin
  v_user_id:=public.league_network_current_user_id();
  if v_user_id is null then raise exception 'An active linked Discord account is required'; end if;
  insert into public.notification_preferences(auth_user_id,discord_user_id)
  values(auth.uid(),v_user_id) on conflict(auth_user_id) do update set discord_user_id=excluded.discord_user_id;
  insert into public.league_presence(auth_user_id,discord_user_id,status,last_seen_at)
  values(auth.uid(),v_user_id,'online',now()) on conflict(auth_user_id) do update set discord_user_id=excluded.discord_user_id,status='online',last_seen_at=now();
  return v_user_id;
end;
$$;

create or replace function public.send_league_channel_message(p_channel_id uuid,p_body text,p_reply_to_id uuid default null)
returns public.league_channel_messages language plpgsql security definer set search_path=public as $$
declare v_user_id text; v_channel public.league_channels; v_message public.league_channel_messages;
begin
  v_user_id:=public.ensure_league_network_profile();
  select * into v_channel from public.league_channels where id=p_channel_id and is_archived=false;
  if v_channel.id is null then raise exception 'Channel not found'; end if;
  if (v_channel.is_locked or v_channel.channel_type='announcements') and not public.league_network_is_commissioner() then raise exception 'Only commissioners can post in this channel'; end if;
  if char_length(trim(coalesce(p_body,''))) not between 1 and 4000 then raise exception 'Message must be between 1 and 4000 characters'; end if;
  if exists(select 1 from public.league_channel_messages where author_discord_user_id=v_user_id and created_at>now()-interval '2 seconds') then raise exception 'Please wait a moment before sending another message'; end if;
  insert into public.league_channel_messages(channel_id,author_discord_user_id,body,reply_to_id,message_type)
  values(p_channel_id,v_user_id,trim(p_body),p_reply_to_id,case when v_channel.channel_type='announcements' then 'announcement' else 'message' end)
  returning * into v_message;
  return v_message;
end;
$$;

create or replace function public.start_direct_conversation(p_other_discord_user_id text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_me text; v_key text; v_id uuid;
begin
  v_me:=public.ensure_league_network_profile();
  if p_other_discord_user_id is null or p_other_discord_user_id=v_me then raise exception 'Choose another active league member'; end if;
  if not exists(select 1 from public.discord_users where id::text=p_other_discord_user_id and is_active is not false) then raise exception 'League member not found'; end if;
  v_key:=case when v_me<p_other_discord_user_id then v_me||':'||p_other_discord_user_id else p_other_discord_user_id||':'||v_me end;
  insert into public.direct_conversations(conversation_key) values(v_key)
  on conflict(conversation_key) do update set conversation_key=excluded.conversation_key returning id into v_id;
  insert into public.direct_conversation_members(conversation_id,discord_user_id) values(v_id,v_me),(v_id,p_other_discord_user_id)
  on conflict do nothing;
  return v_id;
end;
$$;

create or replace function public.send_direct_message(p_conversation_id uuid,p_body text,p_reply_to_id uuid default null)
returns public.direct_messages language plpgsql security definer set search_path=public as $$
declare v_me text; v_message public.direct_messages;
begin
  v_me:=public.ensure_league_network_profile();
  if not public.league_network_is_conversation_member(p_conversation_id) then raise exception 'You are not a member of this conversation'; end if;
  if char_length(trim(coalesce(p_body,''))) not between 1 and 4000 then raise exception 'Message must be between 1 and 4000 characters'; end if;
  if exists(select 1 from public.direct_messages where author_discord_user_id=v_me and created_at>now()-interval '2 seconds') then raise exception 'Please wait a moment before sending another message'; end if;
  insert into public.direct_messages(conversation_id,author_discord_user_id,body,reply_to_id)
  values(p_conversation_id,v_me,trim(p_body),p_reply_to_id) returning * into v_message;
  update public.direct_conversations set last_message_at=now() where id=p_conversation_id;
  return v_message;
end;
$$;

create or replace function public.mark_direct_conversation_read(p_conversation_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.direct_conversation_members set last_read_at=now()
  where conversation_id=p_conversation_id and discord_user_id=public.league_network_current_user_id();
end;
$$;

create or replace function public.mark_app_notification_read(p_notification_id uuid default null)
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.app_notifications set read_at=coalesce(read_at,now())
  where auth_user_id=auth.uid() and (p_notification_id is null or id=p_notification_id);
end;
$$;

create or replace function public.capture_commissioner_audit()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_row jsonb; v_user text;
begin
  if not public.league_network_is_commissioner() then if tg_op='DELETE' then return old; else return new; end if; end if;
  v_row:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_user:=public.league_network_current_user_id();
  insert into public.commissioner_audit_log(auth_user_id,discord_user_id,action,entity_type,entity_id,details)
  values(auth.uid(),v_user,lower(tg_op),tg_table_name,coalesce(v_row->>'id',v_row->>'team_id'),jsonb_build_object('before',case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,'after',case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end));
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;

create or replace function public.notify_league_channel_message()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_channel public.league_channels;
begin
  select * into v_channel from public.league_channels where id=new.channel_id;
  if new.message_type='announcement' then
    insert into public.app_notifications(auth_user_id,discord_user_id,notification_type,title,body,target_tab,target_id,actor_discord_user_id)
    select du.auth_user_id,du.id::text,'announcement',v_channel.name,left(new.body,180),'leagueHub',new.channel_id::text,new.author_discord_user_id
    from public.discord_users du left join public.notification_preferences np on np.auth_user_id=du.auth_user_id
    where du.is_active is not false and du.auth_user_id is not null and du.id::text<>new.author_discord_user_id and coalesce(np.announcements,true);
  end if;
  insert into public.app_notifications(auth_user_id,discord_user_id,notification_type,title,body,target_tab,target_id,actor_discord_user_id)
  select du.auth_user_id,du.id::text,'mention','You were mentioned in #'||v_channel.slug,left(new.body,180),'leagueHub',new.channel_id::text,new.author_discord_user_id
  from public.discord_users du left join public.notification_preferences np on np.auth_user_id=du.auth_user_id
  where du.is_active is not false and du.auth_user_id is not null and du.id::text<>new.author_discord_user_id and coalesce(np.mentions,true)
    and position('@'||lower(du.discord_username) in lower(new.body))>0;
  return new;
end;
$$;

create or replace function public.notify_direct_message()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.app_notifications(auth_user_id,discord_user_id,notification_type,title,body,target_tab,target_id,actor_discord_user_id)
  select du.auth_user_id,du.id::text,'direct_message','New direct message',left(new.body,180),'leagueHub',new.conversation_id::text,new.author_discord_user_id
  from public.direct_conversation_members dcm join public.discord_users du on du.id::text=dcm.discord_user_id
  left join public.notification_preferences np on np.auth_user_id=du.auth_user_id
  where dcm.conversation_id=new.conversation_id and dcm.discord_user_id<>new.author_discord_user_id and du.auth_user_id is not null and coalesce(np.direct_messages,true);
  return new;
end;
$$;

create or replace function public.notify_game_result()
returns trigger language plpgsql security definer set search_path=public as $$
declare t1 text; t2 text;
begin
  select name into t1 from public.teams where id::text=new.team_1_id::text;
  select name into t2 from public.teams where id::text=new.team_2_id::text;
  insert into public.app_notifications(auth_user_id,discord_user_id,notification_type,title,body,target_tab,target_id)
  select du.auth_user_id,du.id::text,'game_result','Final: '||coalesce(t1,'Team 1')||' '||new.team_1_score||' – '||new.team_2_score||' '||coalesce(t2,'Team 2'),new.week||' result is official.','schedule',new.id::text
  from public.discord_users du left join public.notification_preferences np on np.auth_user_id=du.auth_user_id
  where du.is_active is not false and du.auth_user_id is not null and coalesce(np.game_results,true);
  return new;
end;
$$;

create or replace function public.notify_week_advancement()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.current_week is distinct from new.current_week or old.current_year is distinct from new.current_year then
    insert into public.app_notifications(auth_user_id,discord_user_id,notification_type,title,body,target_tab)
    select du.auth_user_id,du.id::text,'advancement',new.current_week||' is live','The dynasty has advanced to '||new.current_year||' '||new.current_week||'.','dashboard'
    from public.discord_users du left join public.notification_preferences np on np.auth_user_id=du.auth_user_id
    where du.is_active is not false and du.auth_user_id is not null and coalesce(np.advancement,true);
  end if;
  return new;
end;
$$;

create or replace function public.notify_elite_books_board()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status='open' and (tg_op='INSERT' or old.status is distinct from new.status) then
    insert into public.app_notifications(auth_user_id,discord_user_id,notification_type,title,body,target_tab,target_id)
    select du.auth_user_id,du.id::text,'elite_books','Elite Books board is open',new.week||' lines are ready. Build your card before matchups lock.','eliteBooks',new.id::text
    from public.discord_users du left join public.notification_preferences np on np.auth_user_id=du.auth_user_id
    where du.is_active is not false and du.auth_user_id is not null and coalesce(np.elite_books,true);
  end if;
  return new;
end;
$$;

drop trigger if exists league_channel_message_notification on public.league_channel_messages;
create trigger league_channel_message_notification after insert on public.league_channel_messages
for each row execute function public.notify_league_channel_message();
drop trigger if exists league_direct_message_notification on public.direct_messages;
create trigger league_direct_message_notification after insert on public.direct_messages
for each row execute function public.notify_direct_message();
drop trigger if exists league_game_result_notification on public.game_results;
create trigger league_game_result_notification after insert on public.game_results
for each row execute function public.notify_game_result();
drop trigger if exists league_week_advancement_notification on public.league_settings;
create trigger league_week_advancement_notification after update of current_year,current_week on public.league_settings
for each row execute function public.notify_week_advancement();
drop trigger if exists league_elite_books_board_notification on public.sportsbook_boards;
create trigger league_elite_books_board_notification after insert or update of status on public.sportsbook_boards
for each row execute function public.notify_elite_books_board();

alter table public.league_channels enable row level security;
alter table public.league_channel_messages enable row level security;
alter table public.league_message_reactions enable row level security;
alter table public.direct_conversations enable row level security;
alter table public.direct_conversation_members enable row level security;
alter table public.direct_messages enable row level security;
alter table public.stream_profiles enable row level security;
alter table public.live_stream_status enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.app_notifications enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.league_presence enable row level security;
alter table public.moderation_reports enable row level security;
alter table public.commissioner_audit_log enable row level security;

do $$ declare t text; begin
  foreach t in array array['league_channels','league_channel_messages','league_message_reactions','direct_conversations','direct_conversation_members','direct_messages','stream_profiles','live_stream_status','notification_preferences','app_notifications','push_subscriptions','league_presence','moderation_reports','commissioner_audit_log']
  loop execute format('drop policy if exists network_read on public.%I',t); execute format('drop policy if exists network_own on public.%I',t); end loop;
end $$;

do $$ declare t text; begin
  foreach t in array array['league_settings','team_assignments','commissioner_rankings','game_results','weekly_matchups','all_americans','awards','heisman_winners','national_champions','recruiting_classes','season_player_stats','team_season_stats','team_history_records','conference_assets']
  loop
    if to_regclass('public.'||t) is not null then
      execute format('drop trigger if exists commissioner_audit on public.%I',t);
      execute format('create trigger commissioner_audit after insert or update or delete on public.%I for each row execute function public.capture_commissioner_audit()',t);
    end if;
  end loop;
end $$;

create policy network_read on public.league_channels for select to authenticated using (public.league_network_current_user_id() is not null);
create policy network_read on public.league_channel_messages for select to authenticated using (public.league_network_current_user_id() is not null);
create policy network_read on public.league_message_reactions for select to authenticated using (public.league_network_current_user_id() is not null);
create policy network_own on public.league_message_reactions for all to authenticated using (discord_user_id=public.league_network_current_user_id()) with check (discord_user_id=public.league_network_current_user_id());
create policy network_read on public.direct_conversations for select to authenticated using (public.league_network_is_conversation_member(id));
create policy network_read on public.direct_conversation_members for select to authenticated using (public.league_network_is_conversation_member(conversation_id));
create policy network_read on public.direct_messages for select to authenticated using (public.league_network_is_conversation_member(conversation_id));
create policy network_read on public.stream_profiles for select to authenticated using (public.league_network_current_user_id() is not null);
create policy network_own on public.stream_profiles for all to authenticated using (discord_user_id=public.league_network_current_user_id()) with check (discord_user_id=public.league_network_current_user_id());
create policy network_read on public.live_stream_status for select to authenticated using (public.league_network_current_user_id() is not null);
create policy network_own on public.notification_preferences for all to authenticated using (auth_user_id=auth.uid()) with check (auth_user_id=auth.uid() and discord_user_id=public.league_network_current_user_id());
create policy network_own on public.app_notifications for select to authenticated using (auth_user_id=auth.uid());
create policy network_own on public.push_subscriptions for all to authenticated using (auth_user_id=auth.uid()) with check (auth_user_id=auth.uid());
create policy network_own on public.league_presence for all to authenticated using (auth_user_id=auth.uid()) with check (auth_user_id=auth.uid() and discord_user_id=public.league_network_current_user_id());
create policy network_own on public.moderation_reports for insert to authenticated with check (reporter_auth_user_id=auth.uid() and reporter_discord_user_id=public.league_network_current_user_id());
create policy network_read on public.moderation_reports for select to authenticated using (reporter_auth_user_id=auth.uid() or public.league_network_is_commissioner());
create policy network_read on public.commissioner_audit_log for select to authenticated using (public.league_network_is_commissioner());

revoke all on public.league_channels,public.league_channel_messages,public.league_message_reactions,public.direct_conversations,public.direct_conversation_members,public.direct_messages,public.stream_profiles,public.live_stream_status,public.notification_preferences,public.app_notifications,public.push_subscriptions,public.league_presence,public.moderation_reports,public.commissioner_audit_log from anon;
grant select on public.league_channels,public.league_channel_messages,public.league_message_reactions,public.direct_conversations,public.direct_conversation_members,public.direct_messages,public.live_stream_status,public.app_notifications to authenticated;
grant select,insert,update,delete on public.stream_profiles,public.notification_preferences,public.push_subscriptions,public.league_presence to authenticated;
grant select,insert,delete on public.league_message_reactions to authenticated;
grant select,insert on public.moderation_reports to authenticated;
grant select on public.commissioner_audit_log to authenticated;
grant execute on function public.ensure_league_network_profile() to authenticated;
grant execute on function public.send_league_channel_message(uuid,text,uuid) to authenticated;
grant execute on function public.start_direct_conversation(text) to authenticated;
grant execute on function public.send_direct_message(uuid,text,uuid) to authenticated;
grant execute on function public.mark_direct_conversation_read(uuid) to authenticated;
grant execute on function public.mark_app_notification_read(uuid) to authenticated;

-- Existing league data is authenticated-read and commissioner-write only.
do $$
declare t text; p record;
begin
  foreach t in array array['teams','league_settings','dashboard_tab_order','team_assignments','commissioner_rankings','game_results','weekly_matchups','cfb27_draft_picks','cfb27_draft_settings','all_americans','awards','heisman_winners','national_champions','draft_order_27','playoff_games','recruiting_classes','season_player_stats','team_season_stats','team_history_records','conference_assets','ranking_snapshots']
  loop
    if to_regclass('public.'||t) is not null then
      execute format('alter table public.%I enable row level security',t);
      for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
        execute format('drop policy if exists %I on public.%I',p.policyname,t);
      end loop;
      execute format('create policy league_authenticated_read on public.%I for select to authenticated using (public.league_network_current_user_id() is not null)',t);
      execute format('create policy league_commissioner_insert on public.%I for insert to authenticated with check (public.league_network_is_commissioner())',t);
      execute format('create policy league_commissioner_update on public.%I for update to authenticated using (public.league_network_is_commissioner()) with check (public.league_network_is_commissioner())',t);
      execute format('create policy league_commissioner_delete on public.%I for delete to authenticated using (public.league_network_is_commissioner())',t);
      execute format('revoke all on public.%I from anon',t);
      execute format('grant select,insert,update,delete on public.%I to authenticated',t);
    end if;
  end loop;
end $$;

-- Secure the standings view through its underlying table policies.
alter view public.team_standings set (security_invoker=true);
revoke all on public.team_standings from anon;
grant select on public.team_standings to authenticated;
alter table public.discord_users enable row level security;
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='discord_users' loop
    execute format('drop policy if exists %I on public.discord_users',p.policyname);
  end loop;
end $$;
create policy league_authenticated_read on public.discord_users for select to authenticated using (public.league_network_current_user_id() is not null);
create policy league_commissioner_insert on public.discord_users for insert to authenticated with check (public.league_network_is_commissioner());
create policy league_commissioner_update on public.discord_users for update to authenticated using (public.league_network_is_commissioner()) with check (public.league_network_is_commissioner());
create policy league_commissioner_delete on public.discord_users for delete to authenticated using (public.league_network_is_commissioner());

do $$ declare t text; begin
  foreach t in array array['sportsbook_boards','sportsbook_lines','sportsbook_future_markets','sportsbook_future_options','sportsbook_badges','sportsbook_badge_awards','sportsbook_season_champions']
  loop
    if to_regclass('public.'||t) is not null then
      execute format('drop policy if exists elite_books_public_read on public.%I',t);
      execute format('drop policy if exists elite_books_member_read on public.%I',t);
      execute format('create policy elite_books_member_read on public.%I for select to authenticated using (public.league_network_current_user_id() is not null)',t);
      execute format('revoke all on public.%I from anon',t);
      execute format('grant select on public.%I to authenticated',t);
    end if;
  end loop;
end $$;
revoke all on public.elite_books_standings,public.elite_books_all_time_standings from anon;
grant select on public.elite_books_standings,public.elite_books_all_time_standings to authenticated;

create or replace view public.sportsbook_pick_directory as
select p.id,p.discord_user_id,p.board_id,p.line_id,p.pick_type,p.pick_slot,p.selected_team_id,p.selected_total_side,p.locked_odds,p.locked_spread,p.locked_total,p.possible_points,p.status,p.points_awarded,p.created_at,p.settled_at
from public.sportsbook_picks p join public.sportsbook_boards b on b.id=p.board_id
where p.auth_user_id=auth.uid() or b.status in ('locked','settled') or public.league_network_is_commissioner();
create or replace view public.sportsbook_future_pick_directory as
select p.id,p.discord_user_id,p.market_id,p.option_id,p.locked_odds,p.possible_points,p.status,p.points_awarded,p.created_at,p.settled_at
from public.sportsbook_future_picks p join public.sportsbook_future_markets m on m.id=p.market_id
where p.auth_user_id=auth.uid() or m.status in ('locked','settled','void') or public.league_network_is_commissioner();
revoke all on public.sportsbook_picks,public.sportsbook_future_picks from anon,authenticated;
revoke all on public.sportsbook_pick_directory,public.sportsbook_future_pick_directory from anon;
grant select on public.sportsbook_pick_directory,public.sportsbook_future_pick_directory to authenticated;

-- The member directory intentionally omits Discord IDs, auth UUIDs and private notes.
create or replace view public.league_member_directory as
select id::text as id,discord_username,is_active,is_commissioner,discord_avatar_url
from public.discord_users where is_active is not false;
revoke all on public.discord_users from anon;
revoke all on public.league_member_directory from anon;
grant select on public.league_member_directory to authenticated;
grant select(id,discord_username,is_active,is_commissioner,discord_avatar_url,sportsbook_seed,sportsbook_notes) on public.discord_users to authenticated;
grant insert(discord_username,is_active) on public.discord_users to authenticated;
grant update(discord_username,is_active,is_commissioner,sportsbook_seed,sportsbook_notes) on public.discord_users to authenticated;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='league_channel_messages') then alter publication supabase_realtime add table public.league_channel_messages; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='direct_messages') then alter publication supabase_realtime add table public.direct_messages; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='app_notifications') then alter publication supabase_realtime add table public.app_notifications; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='live_stream_status') then alter publication supabase_realtime add table public.live_stream_status; end if;
end $$;

commit;

select 'CFB Elite 27 League Network v24 installed' as status;
