-- CFBElite 27 v22: blend a real ELO rating (built from full game history) into
-- the Elite Books power rating, and recency-weight the 12-game form window
-- so a team's last game counts more than its eighth-most-recent game.
--
-- This is additive on top of v21, not a replacement: the outer shrinkage
-- formula (recent form weighted by reliability, preseason edge weighted by
-- inverse reliability) is untouched. The only two changes are (1) what goes
-- into the "preseason edge" term -- now a 60/40 blend of the existing
-- skill/overall seed and a persisted ELO rating instead of skill/overall
-- alone, and (2) the 12-game recent-form averages are now weighted so game 1
-- (most recent) counts 12x and game 12 (oldest in the window) counts 1x,
-- instead of a plain average. Caps, rounding, moneyline hold, home-field
-- edge, and frozen-line handling are all unchanged from v21.
--
-- No parlays. Not part of this or any prior model version.

begin;

-- ELO needs state that persists across weeks -- unlike the rest of this
-- model, which recomputes everything fresh from game_results on every call.
create table if not exists public.team_elo_ratings (
  team_id text primary key,
  rating numeric not null default 1500,
  games_played integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.team_elo_ratings enable row level security;
drop policy if exists team_elo_ratings_read on public.team_elo_ratings;
create policy team_elo_ratings_read on public.team_elo_ratings for select to authenticated using (true);
revoke all on public.team_elo_ratings from anon;
grant select on public.team_elo_ratings to authenticated;

-- Full replay from game_results, in chronological order, rather than an
-- incremental per-game update. A score correction or a deleted result is
-- common in this app (Results Manager allows editing settled scores), and a
-- full replay is the only way to stay correct when that happens -- an
-- incremental update would double-count or never unwind a corrected game.
-- League size here (dozens of teams, low hundreds of games) makes a full
-- replay on every game_results change cheap.
create or replace function public.recompute_team_elo_ratings()
returns void language plpgsql security definer set search_path=public as $$
declare
  g record;
  r1 numeric;
  r2 numeric;
  exp1 numeric;
  actual1 numeric;
  k constant numeric := 24;
begin
  create temporary table if not exists tmp_elo_ratings(team_id text primary key, rating numeric, games_played integer) on commit drop;
  delete from tmp_elo_ratings;

  for g in
    select gr.team_1_id::text as team_1_id, gr.team_2_id::text as team_2_id,
           gr.team_1_score, gr.team_2_score
      from public.game_results gr
     where gr.team_1_score is not null and gr.team_2_score is not null
     order by gr.season_year asc, public.elite_books_week_index(gr.week) asc, gr.created_at asc
  loop
    insert into tmp_elo_ratings(team_id,rating,games_played) values (g.team_1_id,1500,0) on conflict(team_id) do nothing;
    insert into tmp_elo_ratings(team_id,rating,games_played) values (g.team_2_id,1500,0) on conflict(team_id) do nothing;

    select rating into r1 from tmp_elo_ratings where team_id=g.team_1_id;
    select rating into r2 from tmp_elo_ratings where team_id=g.team_2_id;

    exp1:=1/(1+power(10,(r2-r1)/400.0));
    actual1:=case when g.team_1_score>g.team_2_score then 1 when g.team_1_score<g.team_2_score then 0 else 0.5 end;

    update tmp_elo_ratings set rating=r1+k*(actual1-exp1), games_played=games_played+1 where team_id=g.team_1_id;
    update tmp_elo_ratings set rating=r2+k*((1-actual1)-(1-exp1)), games_played=games_played+1 where team_id=g.team_2_id;
  end loop;

  delete from public.team_elo_ratings;
  insert into public.team_elo_ratings(team_id,rating,games_played,updated_at)
  select team_id,rating,games_played,now() from tmp_elo_ratings;
end;
$$;

revoke all on function public.recompute_team_elo_ratings() from public;
grant execute on function public.recompute_team_elo_ratings() to authenticated;

create or replace function public.trigger_recompute_team_elo_ratings()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.recompute_team_elo_ratings();
  return null;
end;
$$;

drop trigger if exists recompute_elo_on_result_change on public.game_results;
create trigger recompute_elo_on_result_change
after insert or update or delete on public.game_results
for each statement execute function public.trigger_recompute_team_elo_ratings();

-- Backfill immediately from whatever game_results already exist.
select public.recompute_team_elo_ratings();

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
  history_pf1 numeric;
  history_pf2 numeric;
  history_pa1 numeric;
  history_pa2 numeric;
  history_total1 numeric;
  history_total2 numeric;
  skill1 numeric;
  skill2 numeric;
  overall1 numeric;
  overall2 numeric;
  elo1 numeric;
  elo2 numeric;
  elo_edge1 numeric;
  elo_edge2 numeric;
  seed_edge1 numeric;
  seed_edge2 numeric;
  reliability1 numeric;
  reliability2 numeric;
  total_reliability numeric;
  seed_total numeric;
  form_total numeric;
  margin numeric;
  projected_total numeric;
  probability numeric;
  priced_probability1 numeric;
  priced_probability2 numeric;
  ml1 integer;
  ml2 integer;
  r1 integer;
  r2 integer;
begin
  if auth.uid() is not null and not public.elite_books_is_commissioner() then
    raise exception 'Commissioner Discord account required';
  end if;

  select coalesce(p_season,current_year),coalesce(p_week,current_week),advance_at
    into v_season,v_week,v_lock
    from public.league_settings
   where id=1;

  if v_season is null or v_week is null then
    raise exception 'League year/week is not configured';
  end if;

  insert into public.sportsbook_boards(season_year,week,week_index,status,locks_at)
  values(v_season,v_week,public.elite_books_week_index(v_week),'open',v_lock)
  on conflict(season_year,week) do update set
    status=case when public.sportsbook_boards.status in ('settled','locked') then public.sportsbook_boards.status else 'open' end,
    generated_at=now()
  returning id into v_board;

  for m in
    select wm.*
      from public.weekly_matchups wm
     where wm.season_year=v_season and wm.week=v_week
  loop
    -- Twelve most recent completed games before the board's week, weighted so
    -- the most recent counts 12x and the oldest of the twelve counts 1x. The
    -- window function's ORDER BY matches the outer ORDER BY exactly, so
    -- row_number() ranks 1..N over the same order the LIMIT then truncates to
    -- the top 12 -- rn is always 1 (most recent) through 12 (oldest kept).
    select count(*),
           coalesce(sum(x.margin*x.wt)/nullif(sum(x.wt),0),0),
           coalesce(sum(x.points_for*x.wt)/nullif(sum(x.wt),0),24.75),
           coalesce(sum(x.points_against*x.wt)/nullif(sum(x.wt),0),24.75),
           coalesce(sum(x.game_total*x.wt)/nullif(sum(x.wt),0),49.5)
      into games1,history_margin1,history_pf1,history_pa1,history_total1
      from (
        select case when gr.team_1_id::text=m.team_1_id::text then gr.team_1_score-gr.team_2_score else gr.team_2_score-gr.team_1_score end::numeric as margin,
               case when gr.team_1_id::text=m.team_1_id::text then gr.team_1_score else gr.team_2_score end::numeric as points_for,
               case when gr.team_1_id::text=m.team_1_id::text then gr.team_2_score else gr.team_1_score end::numeric as points_against,
               (gr.team_1_score+gr.team_2_score)::numeric as game_total,
               13-row_number() over (order by gr.season_year desc,public.elite_books_week_index(gr.week) desc,gr.created_at desc) as wt
          from public.game_results gr
         where (gr.team_1_id::text=m.team_1_id::text or gr.team_2_id::text=m.team_1_id::text)
           and (gr.season_year<v_season or (gr.season_year=v_season and public.elite_books_week_index(gr.week)<public.elite_books_week_index(v_week)))
         order by gr.season_year desc,public.elite_books_week_index(gr.week) desc,gr.created_at desc
         limit 12
      ) x;

    select count(*),
           coalesce(sum(x.margin*x.wt)/nullif(sum(x.wt),0),0),
           coalesce(sum(x.points_for*x.wt)/nullif(sum(x.wt),0),24.75),
           coalesce(sum(x.points_against*x.wt)/nullif(sum(x.wt),0),24.75),
           coalesce(sum(x.game_total*x.wt)/nullif(sum(x.wt),0),49.5)
      into games2,history_margin2,history_pf2,history_pa2,history_total2
      from (
        select case when gr.team_1_id::text=m.team_2_id::text then gr.team_1_score-gr.team_2_score else gr.team_2_score-gr.team_1_score end::numeric as margin,
               case when gr.team_1_id::text=m.team_2_id::text then gr.team_1_score else gr.team_2_score end::numeric as points_for,
               case when gr.team_1_id::text=m.team_2_id::text then gr.team_2_score else gr.team_1_score end::numeric as points_against,
               (gr.team_1_score+gr.team_2_score)::numeric as game_total,
               13-row_number() over (order by gr.season_year desc,public.elite_books_week_index(gr.week) desc,gr.created_at desc) as wt
          from public.game_results gr
         where (gr.team_1_id::text=m.team_2_id::text or gr.team_2_id::text=m.team_2_id::text)
           and (gr.season_year<v_season or (gr.season_year=v_season and public.elite_books_week_index(gr.week)<public.elite_books_week_index(v_week)))
         order by gr.season_year desc,public.elite_books_week_index(gr.week) desc,gr.created_at desc
         limit 12
      ) x;

    select du.sportsbook_seed into skill1
      from public.team_assignments ta
      join public.discord_users du on du.id::text=ta.discord_user_id::text
     where ta.team_id::text=m.team_1_id::text and (ta.status='Active' or ta.status is null)
     order by ta.created_at desc limit 1;

    select du.sportsbook_seed into skill2
      from public.team_assignments ta
      join public.discord_users du on du.id::text=ta.discord_user_id::text
     where ta.team_id::text=m.team_2_id::text and (ta.status='Active' or ta.status is null)
     order by ta.created_at desc limit 1;

    select sportsbook_team_seed into overall1 from public.teams where id::text=m.team_1_id::text;
    select sportsbook_team_seed into overall2 from public.teams where id::text=m.team_2_id::text;

    select rating into elo1 from public.team_elo_ratings where team_id=m.team_1_id::text;
    select rating into elo2 from public.team_elo_ratings where team_id=m.team_2_id::text;

    skill1:=coalesce(skill1,50);
    skill2:=coalesce(skill2,50);
    overall1:=coalesce(overall1,70);
    overall2:=coalesce(overall2,70);
    elo1:=coalesce(elo1,1500);
    elo2:=coalesce(elo2,1500);

    reliability1:=least(1,games1/8.0);
    reliability2:=least(1,games2/8.0);

    -- ELO points run roughly +/-400 for a competitive-but-not-extreme spread
    -- across a 32-team league; /25 puts that on the same rough scale as the
    -- existing skill/overall edge below (roughly +/-16 points at the extreme).
    elo_edge1:=(elo1-1500)/25.0;
    elo_edge2:=(elo2-1500)/25.0;

    -- 60% preseason talent projection (coach skill + team overall), 40% ELO
    -- built from actual results -- a blend, not a replacement. This whole
    -- term still only matters at the margin the outer shrinkage formula
    -- below assigns it, same as v21's seed_edge did.
    seed_edge1:=(((skill1-50)*0.18)+((overall1-70)*0.42))*0.6+(elo_edge1*0.4);
    seed_edge2:=(((skill2-50)*0.18)+((overall2-70)*0.42))*0.6+(elo_edge2*0.4);

    p1:=50+(history_margin1*0.60*reliability1)+(seed_edge1*(1-(reliability1*0.80)));
    p2:=50+(history_margin2*0.60*reliability2)+(seed_edge2*(1-(reliability2*0.80)));

    -- team_1 is away and team_2 is home in GameCenter.
    margin:=round(greatest(-35,least(35,(p1-p2)-2.5))*2)/2.0;

    total_reliability:=least(1,(games1+games2)/12.0);
    seed_total:=49.5+((overall1+overall2-140)*0.18);
    form_total:=(history_pf1+history_pa1+history_pf2+history_pa2)/2.0;
    projected_total:=round(greatest(30,least(85,(form_total*total_reliability)+(seed_total*(1-total_reliability))))*2)/2.0;

    probability:=greatest(.06,least(.94,1/(1+exp(-margin/9.0))));

    -- A 4.5% symmetric hold produces familiar -110 pricing at a true 50/50
    -- matchup while team_1_win_probability remains the fair model probability.
    priced_probability1:=greatest(.02,least(.98,probability*1.045));
    priced_probability2:=greatest(.02,least(.98,(1-probability)*1.045));
    ml1:=(round((case when priced_probability1>=.5 then -100*priced_probability1/(1-priced_probability1) else 100*(1-priced_probability1)/priced_probability1 end)/5.0)*5)::integer;
    ml2:=(round((case when priced_probability2>=.5 then -100*priced_probability2/(1-priced_probability2) else 100*(1-priced_probability2)/priced_probability2 end)/5.0)*5)::integer;

    select rs.rank into r1 from public.ranking_snapshots rs where rs.season_year=v_season and rs.team_id::text=m.team_1_id::text order by rs.week_index desc limit 1;
    select rs.rank into r2 from public.ranking_snapshots rs where rs.season_year=v_season and rs.team_id::text=m.team_2_id::text order by rs.week_index desc limit 1;

    insert into public.sportsbook_lines(
      board_id,matchup_id,team_1_id,team_2_id,team_1_rank,team_2_rank,
      team_1_spread,team_2_spread,team_1_moneyline,team_2_moneyline,
      total_line,over_moneyline,under_moneyline,team_1_win_probability,
      projected_margin,model_snapshot
    ) values (
      v_board,m.id::text,m.team_1_id::text,m.team_2_id::text,r1,r2,
      -margin,margin,ml1,ml2,projected_total,-110,-110,probability,margin,
      jsonb_build_object(
        'model_version','v22-elo-recency','team_1_power',round(p1,2),'team_2_power',round(p2,2),
        'team_1_games',games1,'team_2_games',games2,
        'team_1_reliability',round(reliability1,3),'team_2_reliability',round(reliability2,3),
        'team_1_average_margin',round(history_margin1,2),'team_2_average_margin',round(history_margin2,2),
        'team_1_points_for',round(history_pf1,2),'team_1_points_against',round(history_pa1,2),
        'team_2_points_for',round(history_pf2,2),'team_2_points_against',round(history_pa2,2),
        'team_1_average_total',round(history_total1,2),'team_2_average_total',round(history_total2,2),
        'projected_total',projected_total,'fair_team_1_probability',round(probability,4),
        'moneyline_hold',0.045,'team_1_skill',skill1,'team_2_skill',skill2,
        'team_1_overall',overall1,'team_2_overall',overall2,
        'team_1_elo',round(elo1,1),'team_2_elo',round(elo2,1),
        'team_1_elo_edge',round(elo_edge1,2),'team_2_elo_edge',round(elo_edge2,2),
        'home_field',2.5,'generated_at',now()
      )
    )
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

comment on function public.generate_elite_books_board(integer,text) is
  'v22: v21 recent form + preseason seed, now blended 60/40 with a persisted ELO rating and recency-weighted within the 12-game form window. Same caps, hold, and frozen-line handling as v21. No parlays.';

commit;
