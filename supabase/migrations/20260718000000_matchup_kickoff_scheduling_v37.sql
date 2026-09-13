begin;

-- Coach-to-coach kickoff scheduling for weekly matchups. Confirming a time
-- writes to the same weekly_matchups.scheduled_at column Elite Books'
-- auto-lock and the kickoff-approaching push already read from, so nothing
-- downstream has to change to pick up user-scheduled games.
alter table public.weekly_matchups
  add column if not exists kickoff_status text not null default 'unscheduled',
  add column if not exists kickoff_proposed_at timestamptz,
  add column if not exists kickoff_proposed_by text;

alter table public.weekly_matchups drop constraint if exists weekly_matchups_kickoff_status_check;
alter table public.weekly_matchups add constraint weekly_matchups_kickoff_status_check
  check (kickoff_status in ('unscheduled','proposed','confirmed'));

create or replace function public.propose_matchup_kickoff(p_matchup_id text, p_kickoff_at timestamptz)
returns public.weekly_matchups language plpgsql security definer set search_path=public as $$
declare
  v_user text := public.league_network_current_user_id();
  v_row public.weekly_matchups;
begin
  if v_user is null then raise exception 'Sign in required'; end if;
  if p_kickoff_at is null or p_kickoff_at <= now() then raise exception 'Pick a kickoff time in the future'; end if;

  select * into v_row from public.weekly_matchups where id::text = p_matchup_id;
  if v_row.id is null then raise exception 'Matchup not found'; end if;
  if not public.league_network_is_commissioner()
     and v_user <> coalesce(v_row.team_1_user_id::text,'')
     and v_user <> coalesce(v_row.team_2_user_id::text,'') then
    raise exception 'Only the two coaches in this matchup can schedule it';
  end if;

  update public.weekly_matchups
     set kickoff_status='proposed', kickoff_proposed_at=p_kickoff_at, kickoff_proposed_by=v_user
   where id=v_row.id
   returning * into v_row;

  insert into public.app_notifications(auth_user_id,discord_user_id,notification_type,title,body,target_tab,target_id,actor_discord_user_id)
  select du.auth_user_id, du.id::text, 'kickoff_proposed', 'Kickoff time proposed',
         'A kickoff time was proposed for your matchup: '||to_char(p_kickoff_at,'Dy FMHH12:MI AM'),
         'leagueHub', v_row.id::text, v_user
    from public.discord_users du
   where du.id::text in (coalesce(v_row.team_1_user_id::text,''),coalesce(v_row.team_2_user_id::text,''))
     and du.id::text<>v_user and du.auth_user_id is not null and du.is_banned is not true;

  return v_row;
end;
$$;

create or replace function public.confirm_matchup_kickoff(p_matchup_id text)
returns public.weekly_matchups language plpgsql security definer set search_path=public as $$
declare
  v_user text := public.league_network_current_user_id();
  v_row public.weekly_matchups;
begin
  if v_user is null then raise exception 'Sign in required'; end if;

  select * into v_row from public.weekly_matchups where id::text = p_matchup_id;
  if v_row.id is null then raise exception 'Matchup not found'; end if;
  if not public.league_network_is_commissioner()
     and v_user <> coalesce(v_row.team_1_user_id::text,'')
     and v_user <> coalesce(v_row.team_2_user_id::text,'') then
    raise exception 'Only the two coaches in this matchup can confirm it';
  end if;
  if v_row.kickoff_status <> 'proposed' or v_row.kickoff_proposed_at is null then
    raise exception 'No kickoff proposal is waiting on this matchup';
  end if;
  if v_row.kickoff_proposed_by = v_user and not public.league_network_is_commissioner() then
    raise exception 'Ask the other coach to confirm the time you proposed';
  end if;

  update public.weekly_matchups
     set kickoff_status='confirmed', scheduled_at=v_row.kickoff_proposed_at
   where id=v_row.id
   returning * into v_row;

  insert into public.app_notifications(auth_user_id,discord_user_id,notification_type,title,body,target_tab,target_id,actor_discord_user_id)
  select du.auth_user_id, du.id::text, 'kickoff_confirmed', 'Kickoff locked in',
         'Your matchup kicks off '||to_char(v_row.scheduled_at,'Dy FMHH12:MI AM')||'. Betting closes automatically at kickoff.',
         'leagueHub', v_row.id::text, v_user
    from public.discord_users du
   where du.id::text in (coalesce(v_row.team_1_user_id::text,''),coalesce(v_row.team_2_user_id::text,''))
     and du.auth_user_id is not null and du.is_banned is not true;

  return v_row;
end;
$$;

revoke all on function public.propose_matchup_kickoff(text,timestamptz) from public;
revoke all on function public.confirm_matchup_kickoff(text) from public;
grant execute on function public.propose_matchup_kickoff(text,timestamptz) to authenticated;
grant execute on function public.confirm_matchup_kickoff(text) to authenticated;

commit;
