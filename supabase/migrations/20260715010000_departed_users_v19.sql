-- CFBElite 27 • Departed Users Cleanup v19
-- Completely removes ISellPerkyss and TheGodSquadd from dashboard user data.
-- James Madison and Delaware remain in Team Assets as unassigned CPU teams.
-- All GameCenter schedules/results involving those teams are removed because
-- they are no longer user-vs-user games.

begin;

create extension if not exists pgcrypto;

create table if not exists public.departed_discord_users (
  normalized_username text primary key,
  discord_id text,
  auth_user_id uuid,
  removed_at timestamptz not null default now(),
  removal_reason text not null default 'No longer an active CFBElite member'
);

create unique index if not exists departed_discord_users_discord_id_uidx
  on public.departed_discord_users(discord_id)
  where discord_id is not null;
create unique index if not exists departed_discord_users_auth_user_id_uidx
  on public.departed_discord_users(auth_user_id)
  where auth_user_id is not null;

create temporary table _cfbelite_departed_users on commit drop as
select
  id::text as id_text,
  regexp_replace(lower(trim(discord_username)), '[^a-z0-9]', '', 'g') as normalized_username,
  discord_id,
  auth_user_id
from public.discord_users
where regexp_replace(lower(trim(discord_username)), '[^a-z0-9]', '', 'g')
      in ('isellperkyss', 'thegodsquadd');

insert into public.departed_discord_users(normalized_username,discord_id,auth_user_id)
select normalized_username,discord_id,auth_user_id
from _cfbelite_departed_users
on conflict(normalized_username) do update set
  discord_id=coalesce(excluded.discord_id,departed_discord_users.discord_id),
  auth_user_id=coalesce(excluded.auth_user_id,departed_discord_users.auth_user_id),
  removed_at=now();

insert into public.departed_discord_users(normalized_username)
values ('isellperkyss'),('thegodsquadd')
on conflict(normalized_username) do nothing;

create temporary table _cfbelite_departed_teams on commit drop as
select id::text as id_text,name
from public.teams
where regexp_replace(lower(trim(name)), '[^a-z0-9]', '', 'g') in (
  'jamesmadisondukes','jmudukes','delawarebluehens',
  'delawarefightinbluehens','delawarefightinbluehens'
);

do $$
declare v_missing text;
begin
  with required(normalized_name,display_name) as (
    values ('jamesmadisondukes','James Madison Dukes'),
           ('delawarebluehens','Delaware Blue Hens')
  )
  select string_agg(required.display_name,', ' order by required.display_name)
    into v_missing
  from required
  where not exists (
    select 1 from _cfbelite_departed_teams t
    where (required.normalized_name='jamesmadisondukes' and regexp_replace(lower(t.name),'[^a-z0-9]','','g') in ('jamesmadisondukes','jmudukes'))
       or (required.normalized_name='delawarebluehens' and regexp_replace(lower(t.name),'[^a-z0-9]','','g') in ('delawarebluehens','delawarefightinbluehens'))
  );
  if v_missing is not null then
    raise exception 'Departed-user cleanup stopped. Team Assets not found: %',v_missing;
  end if;
end
$$;

-- Remove every GameCenter result and scheduled matchup involving either
-- departed coach or either formerly controlled team.
delete from public.game_results gr
where gr.team_1_id::text in (select id_text from _cfbelite_departed_teams)
   or gr.team_2_id::text in (select id_text from _cfbelite_departed_teams)
   or gr.team_1_user_id::text in (select id_text from _cfbelite_departed_users)
   or gr.team_2_user_id::text in (select id_text from _cfbelite_departed_users);

-- Delete sportsbook lines first so frozen lines and all attached picks are
-- removed even when the normal schedule-sync trigger would preserve them.
delete from public.sportsbook_lines sl
where sl.team_1_id::text in (select id_text from _cfbelite_departed_teams)
   or sl.team_2_id::text in (select id_text from _cfbelite_departed_teams);

delete from public.weekly_matchups wm
where wm.team_1_id::text in (select id_text from _cfbelite_departed_teams)
   or wm.team_2_id::text in (select id_text from _cfbelite_departed_teams)
   or wm.team_1_user_id::text in (select id_text from _cfbelite_departed_users)
   or wm.team_2_user_id::text in (select id_text from _cfbelite_departed_users);

-- Guarantee both schools are unassigned even if an assignment row was
-- corrected or duplicated under a different user identity.
delete from public.team_assignments ta
where ta.team_id::text in (select id_text from _cfbelite_departed_teams)
   or ta.discord_user_id::text in (select id_text from _cfbelite_departed_users);

-- Remove team futures for JMU and Delaware. The option foreign key cascades
-- any picks other members placed on teams that are no longer user-controlled.
delete from public.sportsbook_future_options sfo
where sfo.team_id::text in (select id_text from _cfbelite_departed_teams);

-- Delete rows from every public base table that directly carries a
-- discord_user_id. This covers assignments, sportsbook history, badges,
-- futures, champions, draft records, player/team stats, and future additions.
do $$
declare r record;
begin
  for r in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema=c.table_schema and t.table_name=c.table_name
    where c.table_schema='public'
      and c.column_name='discord_user_id'
      and t.table_type='BASE TABLE'
      and c.table_name not in ('discord_users','departed_discord_users')
    order by c.table_name
  loop
    execute format(
      'delete from public.%I where discord_user_id::text in (select id_text from _cfbelite_departed_users)',
      r.table_name
    );
  end loop;
end
$$;

-- Remove the public identities last, after all dependent rows are gone.
delete from public.discord_users du
where du.id::text in (select id_text from _cfbelite_departed_users)
   or regexp_replace(lower(trim(du.discord_username)), '[^a-z0-9]', '', 'g')
      in ('isellperkyss','thegodsquadd');

-- Prevent a future Discord OAuth login from silently recreating either user.
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
  v_normalized_name text;
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
  v_normalized_name:=regexp_replace(lower(trim(v_name)),'[^a-z0-9]','','g');

  if exists(
    select 1 from public.departed_discord_users d
    where d.normalized_username=v_normalized_name
       or (v_discord_id is not null and d.discord_id=v_discord_id)
       or d.auth_user_id=v_uid
  ) then
    raise exception 'This Discord account is not an active CFBElite league member';
  end if;

  select * into v_row from public.discord_users
   where auth_user_id=v_uid
      or (v_discord_id is not null and discord_id=v_discord_id)
      or regexp_replace(lower(trim(discord_username)),'#0$','','i')=lower(v_name)
   order by case when auth_user_id=v_uid then 0 when discord_id=v_discord_id then 1 else 2 end
   limit 1;

  if v_row.id is null then
    insert into public.discord_users(discord_username,discord_id,auth_user_id,discord_avatar_url,is_active)
    values(v_name,v_discord_id,v_uid,v_avatar,true) returning * into v_row;
  else
    update public.discord_users set discord_username=coalesce(nullif(trim(discord_username),''),v_name), discord_id=coalesce(v_discord_id,discord_id),
      auth_user_id=v_uid, discord_avatar_url=coalesce(v_avatar,discord_avatar_url)
    where id=v_row.id returning * into v_row;
  end if;
  return v_row;
end;
$$;

grant execute on function public.link_my_discord_user() to authenticated;

-- Reprice still-open futures for the reduced active field. This never
-- recreates departed options because neither team has an Active assignment.
select public.seed_elite_books_futures(current_year,advance_at)
from public.league_settings where id=1;

commit;

select
  (select count(*) from public.discord_users
    where regexp_replace(lower(trim(discord_username)),'[^a-z0-9]','','g') in ('isellperkyss','thegodsquadd')) as departed_users_remaining,
  (select count(*) from public.team_assignments
    where status='Active' and team_id::text in (
      select id::text from public.teams
      where regexp_replace(lower(trim(name)),'[^a-z0-9]','','g') in ('jamesmadisondukes','jmudukes','delawarebluehens','delawarefightinbluehens')
    )) as active_assignments_remaining,
  (select count(*) from public.weekly_matchups
    where team_1_id::text in (
      select id::text from public.teams
      where regexp_replace(lower(trim(name)),'[^a-z0-9]','','g') in ('jamesmadisondukes','jmudukes','delawarebluehens','delawarefightinbluehens')
    ) or team_2_id::text in (
      select id::text from public.teams
      where regexp_replace(lower(trim(name)),'[^a-z0-9]','','g') in ('jamesmadisondukes','jmudukes','delawarebluehens','delawarefightinbluehens')
    )) as gamecenter_rows_remaining;
