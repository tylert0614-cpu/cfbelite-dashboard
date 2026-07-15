-- CFBElite 27 • Elite Books v18
-- Adds FIU / Youngjefe2400, preserves the JR06863 -> Mcluvn11 identity,
-- permits every active-team Automatic Ranking in game results, and upgrades
-- Week 3+ cards use one side pick (moneyline or spread) plus one over/under;
-- Week 2 picks and scoring remain untouched.
-- Safe to run once through `npx supabase db push`.

begin;

-- Automatic Rankings include every active team, not only the Top 25.
alter table if exists public.game_results
  drop constraint if exists game_results_team_1_rank_check;
alter table if exists public.game_results
  drop constraint if exists game_results_team_2_rank_check;
alter table if exists public.game_results
  add constraint game_results_team_1_rank_check
    check (team_1_rank is null or team_1_rank >= 1),
  add constraint game_results_team_2_rank_check
    check (team_2_rank is null or team_2_rank >= 1);

-- Preserve the existing Discord row so assignments, picks, awards, and history
-- continue pointing at the same person.
do $$
declare
  v_renamed_user public.discord_users%rowtype;
  v_new_user public.discord_users%rowtype;
  v_fiu public.teams%rowtype;
  v_year integer;
begin
  update public.discord_users
     set discord_username = 'Mcluvn11'
   where lower(regexp_replace(trim(discord_username), '#0$', '', 'i')) = 'jr06863'
  returning * into v_renamed_user;

  if v_renamed_user.id is not null and to_regclass('public.sportsbook_future_options') is not null then
    update public.sportsbook_future_options
       set selection_label = 'Mcluvn11'
     where discord_user_id::text = v_renamed_user.id::text;
  end if;

  select * into v_new_user
    from public.discord_users
   where lower(regexp_replace(trim(discord_username), '#0$', '', 'i')) = 'youngjefe2400'
   order by created_at nulls last
   limit 1;

  if v_new_user.id is null then
    insert into public.discord_users(discord_username, is_active, sportsbook_seed)
    values ('Youngjefe2400', true, 70)
    returning * into v_new_user;
  else
    update public.discord_users
       set discord_username = 'Youngjefe2400', is_active = true, sportsbook_seed = 70
     where id = v_new_user.id
    returning * into v_new_user;
  end if;

  select * into v_fiu
    from public.teams
   where regexp_replace(lower(trim(name)), '[^a-z0-9]', '', 'g')
         in ('fiupanthers', 'floridainternationalpanthers')
   limit 1;

  if v_fiu.id is null then
    raise exception 'FIU Panthers was not found in team assets';
  end if;

  update public.teams
     set sportsbook_team_seed = 67
   where id = v_fiu.id;

  select coalesce(current_year, 2026) into v_year
    from public.league_settings where id = 1;

  update public.team_assignments
     set status = 'Former', end_year = coalesce(end_year, v_year)
   where status = 'Active'
     and (
       team_id::text = v_fiu.id::text
       or discord_user_id::text = v_new_user.id::text
     );

  execute format(
    'insert into public.team_assignments(team_id, discord_user_id, start_year, status) values (%L, %L, %s, %L)',
    v_fiu.id::text, v_new_user.id::text, v_year, 'Active'
  );
end
$$;

-- FIU's 2026 user schedule. Team 1 is away; Team 2 is home.
create temporary table _cfbelite_fiu_matchups (
  season_year integer not null,
  week text not null,
  team_1_aliases text[] not null,
  team_2_aliases text[] not null
) on commit drop;

insert into _cfbelite_fiu_matchups(season_year, week, team_1_aliases, team_2_aliases)
values
  (2026, 'Week 3',  array['FIU Panthers', 'Florida International Panthers'], array['Florida Atlantic Owls', 'FAU Owls']),
  (2026, 'Week 5',  array['FIU Panthers', 'Florida International Panthers'], array['Jacksonville State Gamecocks', 'Jacksonville St Gamecocks']),
  (2026, 'Week 7',  array['FIU Panthers', 'Florida International Panthers'], array['North Dakota State Bison', 'NDSU Bison']),
  (2026, 'Week 8',  array['Middle Tennessee Blue Raiders', 'Middle Tennessee State Blue Raiders', 'MTSU Blue Raiders'], array['FIU Panthers', 'Florida International Panthers']),
  (2026, 'Week 11', array['Delaware Blue Hens', 'Delaware Fightin Blue Hens', 'Delaware Fightin'' Blue Hens', 'Delaware Fightin’ Blue Hens'], array['FIU Panthers', 'Florida International Panthers']);

create temporary table _cfbelite_fiu_resolved on commit drop as
select
  requested.season_year,
  requested.week,
  requested.team_1_aliases[1] as requested_team_1,
  requested.team_2_aliases[1] as requested_team_2,
  team_1.id as team_1_id,
  team_1.name as resolved_team_1,
  team_2.id as team_2_id,
  team_2.name as resolved_team_2
from _cfbelite_fiu_matchups requested
left join lateral (
  select teams.id, teams.name
    from public.teams
   where regexp_replace(lower(teams.name), '[^a-z0-9]', '', 'g') in (
     select regexp_replace(lower(alias_name), '[^a-z0-9]', '', 'g')
       from unnest(requested.team_1_aliases) as alias_name
   )
   order by teams.name limit 1
) team_1 on true
left join lateral (
  select teams.id, teams.name
    from public.teams
   where regexp_replace(lower(teams.name), '[^a-z0-9]', '', 'g') in (
     select regexp_replace(lower(alias_name), '[^a-z0-9]', '', 'g')
       from unnest(requested.team_2_aliases) as alias_name
   )
   order by teams.name limit 1
) team_2 on true;

do $$
declare v_missing text;
begin
  select string_agg(name, ', ' order by name) into v_missing
    from (
      select distinct requested_team_1 as name from _cfbelite_fiu_resolved where team_1_id is null
      union
      select distinct requested_team_2 as name from _cfbelite_fiu_resolved where team_2_id is null
    ) missing;
  if v_missing is not null then
    raise exception 'FIU GameCenter update stopped. Teams not found: %', v_missing;
  end if;
end
$$;

with active_assignments as (
  select distinct on (team_id::text) team_id, discord_user_id
    from public.team_assignments
   where status='Active' and team_id is not null and discord_user_id is not null
   order by team_id::text, created_at desc
), inserted_matchups as (
  insert into public.weekly_matchups(
    season_year,week,team_1_id,team_2_id,team_1_user_id,team_2_user_id
  )
  select requested.season_year,requested.week,requested.team_1_id,requested.team_2_id,
         team_1_assignment.discord_user_id,team_2_assignment.discord_user_id
    from _cfbelite_fiu_resolved requested
    left join active_assignments team_1_assignment on team_1_assignment.team_id::text=requested.team_1_id::text
    left join active_assignments team_2_assignment on team_2_assignment.team_id::text=requested.team_2_id::text
   where not exists (
     select 1 from public.weekly_matchups existing
      where existing.season_year=requested.season_year and existing.week=requested.week
        and (
          (existing.team_1_id::text=requested.team_1_id::text and existing.team_2_id::text=requested.team_2_id::text)
          or
          (existing.team_1_id::text=requested.team_2_id::text and existing.team_2_id::text=requested.team_1_id::text)
        )
   )
  returning id
)
select count(*) as fiu_matchups_added from inserted_matchups;

-- Add model-generated totals to every sportsbook line.
alter table if exists public.sportsbook_lines
  add column if not exists total_line numeric(5,1),
  add column if not exists over_moneyline integer not null default -110,
  add column if not exists under_moneyline integer not null default -110;

update public.sportsbook_lines
   set total_line = round((48 + least(12, abs(coalesce(projected_margin, 0)) * .25)) * 2) / 2.0
 where total_line is null;

alter table if exists public.sportsbook_lines
  alter column total_line set default 49.5,
  alter column total_line set not null;

-- A total uses over/under rather than a team id.
alter table if exists public.sportsbook_picks
  drop constraint if exists sportsbook_picks_pick_type_check;
alter table if exists public.sportsbook_picks
  alter column selected_team_id drop not null,
  add column if not exists selected_total_side text,
  add column if not exists locked_total numeric(5,1),
  add column if not exists pick_slot text;

update public.sportsbook_picks p
   set pick_slot = case
     when b.week_index < 3 then p.pick_type
     when p.pick_type='total' then 'total'
     else 'side'
   end
  from public.sportsbook_boards b
 where b.id=p.board_id and p.pick_slot is null;

alter table if exists public.sportsbook_picks
  alter column pick_slot set not null;

alter table if exists public.sportsbook_picks
  add constraint sportsbook_picks_pick_type_check
    check (pick_type in ('moneyline', 'spread', 'total'));
alter table if exists public.sportsbook_picks
  add constraint sportsbook_picks_total_side_check
    check (selected_total_side is null or selected_total_side in ('over', 'under'));
alter table if exists public.sportsbook_picks
  add constraint sportsbook_picks_pick_slot_check
    check (
      (pick_slot in ('moneyline','spread') and pick_slot=pick_type)
      or (pick_slot='side' and pick_type in ('moneyline','spread'))
      or (pick_slot='total' and pick_type='total')
    );

-- Week 2 keeps its original moneyline + spread cards. Beginning Week 3,
-- keep only the most recently submitted side while retaining a separate total.
with ranked_existing as (
  select id,
         row_number() over (
           partition by auth_user_id, line_id, pick_slot
           order by created_at desc, id desc
         ) as keep_order
    from public.sportsbook_picks
)
delete from public.sportsbook_picks p
 using ranked_existing r
 where p.id = r.id and r.keep_order > 1;

alter table if exists public.sportsbook_picks
  drop constraint if exists sportsbook_picks_auth_user_id_line_id_pick_type_key;
drop index if exists public.sportsbook_picks_auth_user_id_line_id_pick_type_key;

alter table if exists public.sportsbook_picks
  add constraint sportsbook_picks_one_pick_per_slot_key
    unique (auth_user_id, line_id, pick_slot);

create or replace function public.elite_books_total_points(p_odds integer)
returns integer language sql immutable as $$
  select public.elite_books_moneyline_points(coalesce(p_odds, -110));
$$;

create or replace function public.generate_elite_books_board(p_season integer default null,p_week text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_season integer;
  v_week text;
  v_board uuid;
  v_lock timestamptz;
  m record;
  p1 numeric;
  p2 numeric;
  games1 integer;
  games2 integer;
  history_margin1 numeric;
  history_margin2 numeric;
  history_total1 numeric;
  history_total2 numeric;
  skill1 numeric;
  skill2 numeric;
  overall1 numeric;
  overall2 numeric;
  skill_weight1 numeric;
  skill_weight2 numeric;
  overall_weight1 numeric;
  overall_weight2 numeric;
  margin numeric;
  projected_total numeric;
  probability numeric;
  ml1 integer;
  ml2 integer;
  r1 integer;
  r2 integer;
begin
  if auth.uid() is not null and not public.elite_books_is_commissioner() then
    raise exception 'Commissioner Discord account required';
  end if;
  select coalesce(p_season,current_year),coalesce(p_week,current_week),advance_at
    into v_season,v_week,v_lock from public.league_settings where id=1;
  if v_season is null or v_week is null then raise exception 'League year/week is not configured'; end if;

  insert into public.sportsbook_boards(season_year,week,week_index,status,locks_at)
  values(v_season,v_week,public.elite_books_week_index(v_week),'open',v_lock)
  on conflict(season_year,week) do update set
    status=case when public.sportsbook_boards.status in ('settled','locked') then public.sportsbook_boards.status else 'open' end,
    generated_at=now()
  returning id into v_board;

  for m in select wm.* from public.weekly_matchups wm
    where wm.season_year=v_season and wm.week=v_week
  loop
    select count(*),
           coalesce(avg(case when gr.team_1_id::text=m.team_1_id::text then gr.team_1_score-gr.team_2_score else gr.team_2_score-gr.team_1_score end),0),
           coalesce(avg(gr.team_1_score+gr.team_2_score),49)
      into games1,history_margin1,history_total1
      from public.game_results gr
     where gr.season_year<=v_season
       and (gr.team_1_id::text=m.team_1_id::text or gr.team_2_id::text=m.team_1_id::text);
    select count(*),
           coalesce(avg(case when gr.team_1_id::text=m.team_2_id::text then gr.team_1_score-gr.team_2_score else gr.team_2_score-gr.team_1_score end),0),
           coalesce(avg(gr.team_1_score+gr.team_2_score),49)
      into games2,history_margin2,history_total2
      from public.game_results gr
     where gr.season_year<=v_season
       and (gr.team_1_id::text=m.team_2_id::text or gr.team_2_id::text=m.team_2_id::text);
    select du.sportsbook_seed into skill1 from public.team_assignments ta join public.discord_users du on du.id::text=ta.discord_user_id::text
      where ta.team_id::text=m.team_1_id::text and (ta.status='Active' or ta.status is null) order by ta.created_at desc limit 1;
    select du.sportsbook_seed into skill2 from public.team_assignments ta join public.discord_users du on du.id::text=ta.discord_user_id::text
      where ta.team_id::text=m.team_2_id::text and (ta.status='Active' or ta.status is null) order by ta.created_at desc limit 1;
    select sportsbook_team_seed into overall1 from public.teams where id::text=m.team_1_id::text;
    select sportsbook_team_seed into overall2 from public.teams where id::text=m.team_2_id::text;
    skill1:=coalesce(skill1,50); skill2:=coalesce(skill2,50); overall1:=coalesce(overall1,70); overall2:=coalesce(overall2,70);
    skill_weight1:=0.35*greatest(0.15,1-(least(games1,12)/12.0)); skill_weight2:=0.35*greatest(0.15,1-(least(games2,12)/12.0));
    overall_weight1:=0.80*greatest(0.20,1-(least(games1,10)/10.0)); overall_weight2:=0.80*greatest(0.20,1-(least(games2,10)/10.0));
    p1:=50+(history_margin1*0.55)+((skill1-50)*skill_weight1)+((overall1-70)*overall_weight1);
    p2:=50+(history_margin2*0.55)+((skill2-50)*skill_weight2)+((overall2-70)*overall_weight2);

    margin := round((greatest(-35,least(35,(p1-p2)-2.5))*2))/2.0;
    projected_total := round(greatest(34,least(80,
      ((coalesce(history_total1,49)+coalesce(history_total2,49))/2.0)
      + ((overall1+overall2-140)*0.20)
    ))*2)/2.0;
    probability := greatest(.04,least(.96,1/(1+exp(-margin/7.0))));
    ml1 := case when probability>=.5 then round(-100*probability/(1-probability)) else round(100*(1-probability)/probability) end;
    ml2 := case when probability<=.5 then round(-100*(1-probability)/probability) else round(100*probability/(1-probability)) end;
    select rs.rank into r1 from public.ranking_snapshots rs where rs.season_year=v_season and rs.team_id::text=m.team_1_id::text order by rs.week_index desc limit 1;
    select rs.rank into r2 from public.ranking_snapshots rs where rs.season_year=v_season and rs.team_id::text=m.team_2_id::text order by rs.week_index desc limit 1;

    insert into public.sportsbook_lines(board_id,matchup_id,team_1_id,team_2_id,team_1_rank,team_2_rank,
      team_1_spread,team_2_spread,team_1_moneyline,team_2_moneyline,total_line,over_moneyline,under_moneyline,
      team_1_win_probability,projected_margin,model_snapshot)
    values(v_board,m.id::text,m.team_1_id::text,m.team_2_id::text,r1,r2,-margin,margin,ml1,ml2,projected_total,-110,-110,probability,margin,
      jsonb_build_object('team_1_power',round(p1,2),'team_2_power',round(p2,2),'team_1_games',games1,'team_2_games',games2,
        'team_1_average_total',round(history_total1,2),'team_2_average_total',round(history_total2,2),'projected_total',projected_total,
        'team_1_skill',skill1,'team_2_skill',skill2,'team_1_overall',overall1,'team_2_overall',overall2,
        'team_1_skill_weight',round(skill_weight1,3),'team_2_skill_weight',round(skill_weight2,3),
        'team_1_overall_weight',round(overall_weight1,3),'team_2_overall_weight',round(overall_weight2,3),
        'home_field',2.5,'generated_at',now()))
    on conflict(board_id,matchup_id) do update set
      team_1_rank=case when sportsbook_lines.is_frozen then sportsbook_lines.team_1_rank else excluded.team_1_rank end,
      team_2_rank=case when sportsbook_lines.is_frozen then sportsbook_lines.team_2_rank else excluded.team_2_rank end,
      team_1_spread=case when sportsbook_lines.is_frozen then sportsbook_lines.team_1_spread else excluded.team_1_spread end,
      team_2_spread=case when sportsbook_lines.is_frozen then sportsbook_lines.team_2_spread else excluded.team_2_spread end,
      team_1_moneyline=case when sportsbook_lines.is_frozen then sportsbook_lines.team_1_moneyline else excluded.team_1_moneyline end,
      team_2_moneyline=case when sportsbook_lines.is_frozen then sportsbook_lines.team_2_moneyline else excluded.team_2_moneyline end,
      total_line=case when sportsbook_lines.is_frozen then sportsbook_lines.total_line else excluded.total_line end,
      over_moneyline=case when sportsbook_lines.is_frozen then sportsbook_lines.over_moneyline else excluded.over_moneyline end,
      under_moneyline=case when sportsbook_lines.is_frozen then sportsbook_lines.under_moneyline else excluded.under_moneyline end,
      team_1_win_probability=case when sportsbook_lines.is_frozen then sportsbook_lines.team_1_win_probability else excluded.team_1_win_probability end,
      projected_margin=case when sportsbook_lines.is_frozen then sportsbook_lines.projected_margin else excluded.projected_margin end,
      model_snapshot=case when sportsbook_lines.is_frozen then sportsbook_lines.model_snapshot else excluded.model_snapshot end;
  end loop;
  return v_board;
end;
$$;

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
begin
  select * into v_user from public.discord_users where auth_user_id=auth.uid() and is_active is not false;
  if v_user.id is null then raise exception 'Link an active Discord account first'; end if;
  select * into v_line from public.sportsbook_lines where id=p_line_id;
  select * into v_board from public.sportsbook_boards where id=v_line.board_id;
  if v_board.id is null or v_board.status<>'open' then raise exception 'This board is locked'; end if;
  if v_line.is_betting_locked then raise exception 'Betting is locked for this matchup'; end if;
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

create or replace function public.settle_elite_books_result()
returns trigger language plpgsql security definer set search_path=public as $$
declare l public.sportsbook_lines; p record; win boolean; push boolean; final_total integer;
begin
  for l in select sl.* from public.sportsbook_lines sl join public.sportsbook_boards sb on sb.id=sl.board_id
    where sb.season_year=new.season_year and sb.week=new.week
      and ((sl.team_1_id=new.team_1_id::text and sl.team_2_id=new.team_2_id::text) or (sl.team_1_id=new.team_2_id::text and sl.team_2_id=new.team_1_id::text))
  loop
    if l.team_1_id=new.team_1_id::text then
      update public.sportsbook_lines set result_id=new.id::text,team_1_score=new.team_1_score,team_2_score=new.team_2_score,winner_team_id=case when new.team_1_score>new.team_2_score then l.team_1_id else l.team_2_id end,settled_at=now(),is_betting_locked=true,betting_locked_at=coalesce(betting_locked_at,now()),betting_lock_reason=coalesce(betting_lock_reason,'Final entered') where id=l.id;
    else
      update public.sportsbook_lines set result_id=new.id::text,team_1_score=new.team_2_score,team_2_score=new.team_1_score,winner_team_id=case when new.team_2_score>new.team_1_score then l.team_1_id else l.team_2_id end,settled_at=now(),is_betting_locked=true,betting_locked_at=coalesce(betting_locked_at,now()),betting_lock_reason=coalesce(betting_lock_reason,'Final entered') where id=l.id;
    end if;
    select * into l from public.sportsbook_lines where id=l.id;
    final_total:=l.team_1_score+l.team_2_score;
    for p in select * from public.sportsbook_picks where line_id=l.id and status='pending' loop
      push:=false;
      if p.pick_type='moneyline' then
        win:=p.selected_team_id=l.winner_team_id;
      elsif p.pick_type='spread' and p.selected_team_id=l.team_1_id then
        push:=(l.team_1_score+p.locked_spread=l.team_2_score); win:=(l.team_1_score+p.locked_spread>l.team_2_score);
      elsif p.pick_type='spread' then
        push:=(l.team_2_score+p.locked_spread=l.team_1_score); win:=(l.team_2_score+p.locked_spread>l.team_1_score);
      elsif p.pick_type='total' then
        push:=(final_total=p.locked_total);
        win:=case when p.selected_total_side='over' then final_total>p.locked_total else final_total<p.locked_total end;
      else
        win:=false;
      end if;
      update public.sportsbook_picks set status=case when push then 'push' when win then 'won' else 'lost' end,
        points_awarded=case when win and not push then possible_points else 0 end,settled_at=now() where id=p.id;
    end loop;
  end loop;
  update public.sportsbook_boards sb set status='settled',settled_at=now() where sb.season_year=new.season_year and sb.week=new.week
    and exists(select 1 from public.sportsbook_lines sl where sl.board_id=sb.id)
    and not exists(select 1 from public.sportsbook_lines sl where sl.board_id=sb.id and sl.settled_at is null);
  for l in select sl.* from public.sportsbook_lines sl join public.sportsbook_boards sb on sb.id=sl.board_id
    where sb.season_year=new.season_year and sb.week=new.week and sb.status='settled' limit 1
  loop perform public.award_elite_books_badges(l.board_id); end loop;
  return new;
end;
$$;

grant execute on function public.submit_elite_books_pick(uuid,text,text) to authenticated;
grant execute on function public.generate_elite_books_board(integer,text) to authenticated;

-- Refresh open futures and the current weekly model after the roster update.
select public.seed_elite_books_futures(current_year, advance_at)
  from public.league_settings where id=1;
select public.generate_elite_books_board(null, null);

commit;

select 'Elite Books v18 migration complete' as status;
