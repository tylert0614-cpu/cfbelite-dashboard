-- Elite Books v36: auto-lock betting at kickoff.
--
-- Today the only thing that stops a pick after a game has started is the
-- commissioner manually clicking "Lock Betting" on that exact matchup in
-- Elite Books Manager. weekly_matchups.scheduled_at already exists and is
-- already shown on the pick screen, so this closes the gap server-side:
-- once a matchup's scheduled kickoff has passed, submit_elite_books_pick
-- rejects new/changed picks on it even if nobody clicked lock. Manual lock
-- and void still work exactly as before for a commissioner who needs to
-- close a game early (weather delay, corrected kickoff, etc.).
--
-- Pricing/grading logic is untouched - this only adds one more rejection
-- condition to the existing pick-submission guard clauses.

begin;

create or replace function public.submit_elite_books_pick(p_line_id uuid,p_pick_type text,p_team_id text)
returns public.sportsbook_picks language plpgsql security definer set search_path=public as $$
declare
  v_user public.discord_users;
  v_line public.sportsbook_lines;
  v_board public.sportsbook_boards;
  v_pick public.sportsbook_picks;
  v_odds integer;
  v_spread numeric;
  v_total numeric;
  v_team_id text;
  v_total_side text;
  v_pick_slot text;
  v_points integer;
  v_kickoff timestamptz;
begin
  select * into v_user from public.discord_users where auth_user_id=auth.uid() and is_active is not false;
  if v_user.id is null then raise exception 'Link an active Discord account first'; end if;
  select * into v_line from public.sportsbook_lines where id=p_line_id;
  select * into v_board from public.sportsbook_boards where id=v_line.board_id;
  if v_board.id is null or v_board.status<>'open' then raise exception 'This board is locked'; end if;
  if v_line.is_betting_locked then raise exception 'Betting is locked for this matchup'; end if;

  select wm.scheduled_at into v_kickoff from public.weekly_matchups wm where wm.id=v_line.matchup_id;
  if v_kickoff is not null and v_kickoff<=now() then
    raise exception 'Betting closed at kickoff for this matchup';
  end if;

  if not exists(select 1 from public.league_settings ls where ls.id=1 and ls.current_year=v_board.season_year and ls.current_week=v_board.week) then raise exception 'Only the current week is open for picks'; end if;
  if v_board.week_index < 3 and p_pick_type='total' then raise exception 'Over/under betting begins in Week 3'; end if;
  v_pick_slot:=case
    when v_board.week_index < 3 then p_pick_type
    when p_pick_type='total' then 'total'
    else 'side'
  end;

  if p_pick_type='moneyline' then
    if p_team_id not in (v_line.team_1_id,v_line.team_2_id) then raise exception 'Invalid moneyline selection'; end if;
    v_team_id:=p_team_id;
    v_odds:=case when p_team_id=v_line.team_1_id then v_line.team_1_moneyline else v_line.team_2_moneyline end;
    v_points:=public.elite_books_moneyline_points(v_odds);
  elsif p_pick_type='spread' then
    if p_team_id not in (v_line.team_1_id,v_line.team_2_id) then raise exception 'Invalid spread selection'; end if;
    v_team_id:=p_team_id;
    v_spread:=case when p_team_id=v_line.team_1_id then v_line.team_1_spread else v_line.team_2_spread end;
    v_points:=public.elite_books_spread_points(v_spread);
  elsif p_pick_type='total' then
    v_total_side:=lower(trim(p_team_id));
    if v_total_side not in ('over','under') then raise exception 'Total selection must be over or under'; end if;
    v_total:=v_line.total_line;
    v_odds:=case when v_total_side='over' then v_line.over_moneyline else v_line.under_moneyline end;
    v_points:=public.elite_books_total_points(v_odds);
  else
    raise exception 'Pick type must be moneyline, spread, or total';
  end if;

  insert into public.sportsbook_picks(
    auth_user_id,discord_user_id,board_id,line_id,pick_type,pick_slot,selected_team_id,selected_total_side,
    locked_odds,locked_spread,locked_total,possible_points,status,points_awarded,settled_at
  ) values (
    auth.uid(),v_user.id::text,v_board.id,v_line.id,p_pick_type,v_pick_slot,v_team_id,v_total_side,
    v_odds,v_spread,v_total,v_points,'pending',0,null
  )
  on conflict(auth_user_id,line_id,pick_slot) do update set
    pick_type=excluded.pick_type,
    selected_team_id=excluded.selected_team_id,
    selected_total_side=excluded.selected_total_side,
    locked_odds=excluded.locked_odds,
    locked_spread=excluded.locked_spread,
    locked_total=excluded.locked_total,
    possible_points=excluded.possible_points,
    created_at=now()
  where sportsbook_picks.status='pending'
  returning * into v_pick;

  if v_pick.id is null then raise exception 'A settled pick cannot be changed'; end if;
  update public.sportsbook_lines set is_frozen=true where id=v_line.id;
  return v_pick;
end;
$$;

grant execute on function public.submit_elite_books_pick(uuid,text,text) to authenticated;

commit;

select 'Elite Books v36 migration complete' as status;
