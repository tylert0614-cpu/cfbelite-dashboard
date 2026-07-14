-- CFBElite 27 • Elite Books
-- Discord identity, current-week sportsbook, automated lines/settlement,
-- season and all-time records, futures, badges, and commissioner controls.
-- Safe to run more than once in the Supabase SQL editor.

begin;

create extension if not exists pgcrypto;

alter table if exists public.discord_users
  add column if not exists discord_id text,
  add column if not exists auth_user_id uuid,
  add column if not exists discord_avatar_url text,
  add column if not exists sportsbook_seed numeric(6,2) not null default 50,
  add column if not exists sportsbook_notes text,
  add column if not exists is_commissioner boolean not null default false;

alter table if exists public.teams
  add column if not exists sportsbook_team_seed numeric(6,2) not null default 70;

create temporary table _elite_books_first_year_ratings (
  team_name text not null,
  discord_username text not null,
  skill_rating numeric(6,2) not null,
  team_overall numeric(6,2) not null,
  notes text
) on commit drop;

insert into _elite_books_first_year_ratings(team_name,discord_username,skill_rating,team_overall,notes) values
  ('Appalachian State Mountaineers','BDK09_18751',78,71,'Good user but turnover prone and sometimes disappears'),
  ('Arkansas State Red Wolves','Yoyoyo9598',90,70,'Best user in the league right now'),
  ('Bowling Green Falcons','Iamtoso',80,67,'Solid user but has one or two games it just doesn''t click'),
  ('Colorado State Rams','Tyler_Robinson11',85,69,'Great passer, but frustration can ruin his own game.'),
  ('Delaware Fightin'' Blue Hens','TheGodSquadd',70,66,'Unknown, haven''t seen them play yet.'),
  ('East Carolina Pirates','Dellnado54',70,69,'One of the bottom feeders, not gonna beat many users'),
  ('Florida Atlantic Owls','HowdyDG',85,71,'Great user, always a tough one to beat. Very methodical.'),
  ('Fresno State Bulldogs','Chezburger5555',60,72,'One of the bottom feeders, not gonna beat many users'),
  ('Georgia Southern Eagles','Tamers7484',78,71,'Good user but can be predictable at times'),
  ('Hawaii Rainbow Warriors','Fossy81',78,69,'Good user but not a good passer which makes him one dimensional at times.'),
  ('Jacksonville State Gamecocks','TG0877_41079',80,70,'Good user, very smart. But sometimes too run heavy.'),
  ('James Madison Dukes','ISellPerkyss',70,70,'Unknown, haven''t seen them play yet.'),
  ('Marshall Thundering Herd','Flakey4618',76,67,'Good user but can turn it over too much.'),
  ('Miami (OH) RedHawks','SDub4004',76,70,'Moderate user, nothing flashy but counts on others to make more mistakes.'),
  ('Middle Tennessee Blue Raiders','Rush864',70,67,'Unknown, haven''t seen them play yet.'),
  ('New Mexico Lobos','.Shadow34',70,66,'One of the bottom feeders, feeds on other bottom feeders and beats no one elite'),
  ('North Dakota State Bison','Jacobshuagis',70,67,'Unknown, haven''t seen them play yet.'),
  ('Ohio Bobcats','CEOofItaly.',82,67,'One of the up and comers, had a rough CFB26 experience until the end. But he is getting back to elite.'),
  ('Rice Owls','Presidentdead5616',75,66,'Run heavy user, just too predictable. Smart players beat him.'),
  ('Sacramento State Hornets','Sulluv',70,71,'Unknown, haven''t seen them play yet.'),
  ('San Jose State Spartans','Vmm5a',78,69,'Moderate user, seems to go through the motions sometimes which catches up to him'),
  ('Temple Owls','GetMurk3d',82,72,'Good user, but needs more innovation on play calling'),
  ('Texas State Bobcats','JR06863',82,69,'Good user, turnovers hurt him when he makes them'),
  ('Toledo Rockets','Absolutefury',83,69,'Good user, sometimes can''t muster up enough offense vs the best users.'),
  ('Tulsa Golden Hurricane','Haybails19',75,71,'Okay user, turnover prone sometimes. Beats bottom feeders, doesn''t beat best of the best.'),
  ('UAB Blazers','DylanLink1234232',70,69,'Unknown, haven''t seen them play yet.'),
  ('Utah State Aggies','Satorix10',60,72,'One of the bottom feeders, not gonna beat many users'),
  ('UTSA Roadrunners','Dward1515',80,72,'Good user, sometimes turns it over and causes his losses.'),
  ('Washington State Cougars','3li3962',85,72,'Great user, tough to beat. Beats mid table and bottom feeders. Probably goes .500 vs elite users.'),
  ('Western Kentucky Hilltoppers','Daze__1',82,67,'Good user, sometimes gets too pass happy and turns it over.'),
  ('Wyoming Cowboys','Geauxtigahs6',77,67,'Good user, has great defense. But sometimes he can''t score enough to win.');

update public.discord_users du set
  sportsbook_seed=r.skill_rating,
  sportsbook_notes=r.notes
from _elite_books_first_year_ratings r
where regexp_replace(lower(trim(du.discord_username)),'[^a-z0-9]','','g') =
      regexp_replace(lower(trim(r.discord_username)),'[^a-z0-9]','','g');

update public.teams t set sportsbook_team_seed=r.team_overall
from _elite_books_first_year_ratings r
where regexp_replace(lower(trim(t.name)),'[^a-z0-9]','','g') = regexp_replace(lower(trim(r.team_name)),'[^a-z0-9]','','g')
   or (regexp_replace(lower(trim(r.team_name)),'[^a-z0-9]','','g')='hawaiirainbowwarriors' and regexp_replace(lower(trim(t.name)),'[^a-z0-9]','','g')='hawaiiwarriors')
   or (regexp_replace(lower(trim(r.team_name)),'[^a-z0-9]','','g')='tulsagoldenhurricane' and regexp_replace(lower(trim(t.name)),'[^a-z0-9]','','g')='tulsagoldenhurricanes')
   or (regexp_replace(lower(trim(r.team_name)),'[^a-z0-9]','','g')='delawarefightinbluehens' and regexp_replace(lower(trim(t.name)),'[^a-z0-9]','','g')='delawarebluehens');

create unique index if not exists discord_users_discord_id_uidx
  on public.discord_users (discord_id) where discord_id is not null;
create unique index if not exists discord_users_auth_user_id_uidx
  on public.discord_users (auth_user_id) where auth_user_id is not null;

create table if not exists public.sportsbook_boards (
  id uuid primary key default gen_random_uuid(),
  season_year integer not null,
  week text not null,
  week_index integer not null,
  status text not null default 'open' check (status in ('draft','open','locked','settled')),
  opens_at timestamptz not null default now(),
  locks_at timestamptz,
  generated_at timestamptz not null default now(),
  settled_at timestamptz,
  unique (season_year, week)
);

create table if not exists public.sportsbook_lines (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.sportsbook_boards(id) on delete cascade,
  matchup_id text not null,
  team_1_id text not null,
  team_2_id text not null,
  team_1_rank integer,
  team_2_rank integer,
  team_1_spread numeric(5,1) not null,
  team_2_spread numeric(5,1) not null,
  team_1_moneyline integer not null,
  team_2_moneyline integer not null,
  team_1_win_probability numeric(6,5) not null,
  projected_margin numeric(6,2) not null,
  model_snapshot jsonb not null default '{}'::jsonb,
  is_frozen boolean not null default false,
  result_id text,
  team_1_score integer,
  team_2_score integer,
  winner_team_id text,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (board_id, matchup_id)
);

alter table if exists public.sportsbook_lines
  add column if not exists is_betting_locked boolean not null default false,
  add column if not exists betting_locked_at timestamptz,
  add column if not exists betting_lock_reason text;

create table if not exists public.sportsbook_picks (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null,
  discord_user_id text not null,
  board_id uuid not null references public.sportsbook_boards(id) on delete cascade,
  line_id uuid not null references public.sportsbook_lines(id) on delete cascade,
  pick_type text not null check (pick_type in ('moneyline','spread')),
  selected_team_id text not null,
  locked_odds integer,
  locked_spread numeric(5,1),
  possible_points integer not null default 1,
  status text not null default 'pending' check (status in ('pending','won','lost','push','void')),
  points_awarded integer not null default 0,
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  unique (auth_user_id, line_id, pick_type)
);

create table if not exists public.sportsbook_future_markets (
  id uuid primary key default gen_random_uuid(),
  season_year integer not null,
  market_type text not null check (market_type in ('national_champion','conference_champion','heath_hurley_coty','most_improved_team')),
  conference_name text not null default '',
  title text not null,
  status text not null default 'open' check (status in ('draft','open','locked','settled','void')),
  lock_at timestamptz,
  settled_option_id uuid,
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  unique (season_year, market_type, conference_name)
);

create table if not exists public.sportsbook_future_options (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.sportsbook_future_markets(id) on delete cascade,
  selection_type text not null check (selection_type in ('team','coach')),
  team_id text,
  discord_user_id text,
  selection_label text not null,
  american_odds integer not null,
  bonus_points integer not null,
  model_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (market_id, selection_label)
);

create table if not exists public.sportsbook_future_picks (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null,
  discord_user_id text not null,
  market_id uuid not null references public.sportsbook_future_markets(id) on delete cascade,
  option_id uuid not null references public.sportsbook_future_options(id) on delete cascade,
  locked_odds integer not null,
  possible_points integer not null,
  status text not null default 'pending' check (status in ('pending','won','lost','void')),
  points_awarded integer not null default 0,
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  unique (auth_user_id, market_id)
);

create table if not exists public.sportsbook_badges (
  code text primary key,
  title text not null,
  description text not null,
  icon text not null,
  tone text not null default 'gold'
);

create table if not exists public.sportsbook_badge_awards (
  id uuid primary key default gen_random_uuid(),
  discord_user_id text not null,
  badge_code text not null references public.sportsbook_badges(code) on delete cascade,
  season_year integer not null,
  week text not null default '',
  awarded_at timestamptz not null default now(),
  unique (discord_user_id, badge_code, season_year, week)
);

create table if not exists public.sportsbook_season_champions (
  season_year integer primary key,
  discord_user_id text not null,
  total_points integer not null,
  correct_picks integer not null,
  total_picks integer not null,
  crowned_at timestamptz not null default now()
);

insert into public.sportsbook_badges(code,title,description,icon,tone) values
  ('sharp','The Sharp','Best weekly card with at least three graded picks.','S','green'),
  ('heater','On a Heater','Won five graded picks in a season.','HOT','orange'),
  ('dog_whisperer','Dog Whisperer','Hit three underdog moneylines in one season.','DOG','purple'),
  ('perfect_card','Perfect Card','Finished a week unbeaten with at least three picks.','P','gold'),
  ('bookie_breaker','Bookie Breaker','Scored ten or more points in a single week.','10+','red'),
  ('cold_ticket','Cold Ticket','A rough 0-for-3-or-more weekly card.','ICE','blue'),
  ('chalk_eater','Chalk Eater','Made five favorite moneyline picks in a season.','CH','slate'),
  ('season_champ','Elite Books Champion','Finished first in the season standings.','C','gold')
on conflict (code) do update set
  title=excluded.title, description=excluded.description, icon=excluded.icon, tone=excluded.tone;

create or replace function public.elite_books_week_index(p_week text)
returns integer language sql immutable as $$
  select case
    when p_week ~* '^Week [0-9]+$' then substring(p_week from '[0-9]+')::integer
    when p_week ilike 'Conference Championship%' then 50
    when p_week ~* '^Bowl Week [0-9]+$' then 60 + substring(p_week from '[0-9]+')::integer
    when p_week ilike 'National Championship%' then 99
    else 999 end;
$$;

create or replace function public.elite_books_moneyline_points(p_odds integer)
returns integer language sql immutable as $$
  select case when p_odds < 100 then 1 when p_odds < 200 then 2
    when p_odds < 400 then 3 when p_odds < 700 then 4 else 5 end;
$$;

create or replace function public.elite_books_spread_points(p_spread numeric)
returns integer language sql immutable as $$
  select case when p_spread <= 0 then 1 when p_spread < 7 then 1
    when p_spread < 14 then 2 when p_spread < 21 then 3 else 4 end;
$$;

create or replace function public.elite_books_is_commissioner()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.discord_users where auth_user_id=auth.uid() and is_commissioner=true);
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
  v_avatar := v_meta->>'avatar_url';
  if nullif(trim(v_name),'') is null then raise exception 'Discord username was not returned'; end if;

  select * into v_row from public.discord_users
   where auth_user_id=v_uid
      or (v_discord_id is not null and discord_id=v_discord_id)
      or lower(trim(discord_username))=lower(trim(v_name))
   order by case when auth_user_id=v_uid then 0 when discord_id=v_discord_id then 1 else 2 end
   limit 1;

  if v_row.id is null then
    insert into public.discord_users(discord_username,discord_id,auth_user_id,discord_avatar_url,is_active)
    values(v_name,v_discord_id,v_uid,v_avatar,true) returning * into v_row;
  else
    update public.discord_users set discord_username=v_name, discord_id=coalesce(v_discord_id,discord_id),
      auth_user_id=v_uid, discord_avatar_url=coalesce(v_avatar,discord_avatar_url)
    where id=v_row.id returning * into v_row;
  end if;
  return v_row;
end;
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
  skill1 numeric;
  skill2 numeric;
  overall1 numeric;
  overall2 numeric;
  skill_weight1 numeric;
  skill_weight2 numeric;
  overall_weight1 numeric;
  overall_weight2 numeric;
  margin numeric;
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
    locks_at=coalesce(public.sportsbook_boards.locks_at,excluded.locks_at),
    status=case when public.sportsbook_boards.status in ('settled','locked') then public.sportsbook_boards.status else 'open' end
  returning id into v_board;

  for m in select wm.* from public.weekly_matchups wm
    where wm.season_year=v_season and wm.week=v_week
  loop
    select count(*),coalesce(avg(case when gr.team_1_id::text=m.team_1_id::text then gr.team_1_score-gr.team_2_score else gr.team_2_score-gr.team_1_score end),0)
      into games1,history_margin1 from public.game_results gr where gr.season_year<=v_season and (gr.team_1_id::text=m.team_1_id::text or gr.team_2_id::text=m.team_1_id::text);
    select count(*),coalesce(avg(case when gr.team_1_id::text=m.team_2_id::text then gr.team_1_score-gr.team_2_score else gr.team_2_score-gr.team_1_score end),0)
      into games2,history_margin2 from public.game_results gr where gr.season_year<=v_season and (gr.team_1_id::text=m.team_2_id::text or gr.team_2_id::text=m.team_2_id::text);
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
    probability := greatest(.04,least(.96,1/(1+exp(-margin/7.0))));
    ml1 := case when probability>=.5 then round(-100*probability/(1-probability)) else round(100*(1-probability)/probability) end;
    ml2 := case when probability<=.5 then round(-100*(1-probability)/probability) else round(100*probability/(1-probability)) end;
    select rs.rank into r1 from public.ranking_snapshots rs where rs.season_year=v_season and rs.team_id::text=m.team_1_id::text order by rs.week_index desc limit 1;
    select rs.rank into r2 from public.ranking_snapshots rs where rs.season_year=v_season and rs.team_id::text=m.team_2_id::text order by rs.week_index desc limit 1;

    insert into public.sportsbook_lines(board_id,matchup_id,team_1_id,team_2_id,team_1_rank,team_2_rank,
      team_1_spread,team_2_spread,team_1_moneyline,team_2_moneyline,team_1_win_probability,projected_margin,model_snapshot)
    values(v_board,m.id::text,m.team_1_id::text,m.team_2_id::text,r1,r2,-margin,margin,ml1,ml2,probability,margin,
      jsonb_build_object('team_1_power',round(p1,2),'team_2_power',round(p2,2),'team_1_games',games1,'team_2_games',games2,
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
      team_1_win_probability=case when sportsbook_lines.is_frozen then sportsbook_lines.team_1_win_probability else excluded.team_1_win_probability end,
      projected_margin=case when sportsbook_lines.is_frozen then sportsbook_lines.projected_margin else excluded.projected_margin end,
      model_snapshot=case when sportsbook_lines.is_frozen then sportsbook_lines.model_snapshot else excluded.model_snapshot end;
  end loop;
  return v_board;
end;
$$;

create or replace function public.award_elite_books_badges(p_board_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare b public.sportsbook_boards; r record;
begin
  select * into b from public.sportsbook_boards where id=p_board_id;
  if b.id is null then return; end if;
  for r in select discord_user_id,
      count(*) filter(where status='won') wins,
      count(*) filter(where status='lost') losses,
      sum(points_awarded) points
    from public.sportsbook_picks where board_id=b.id and status in ('won','lost','push') group by discord_user_id
  loop
    if r.wins>=3 and r.losses=0 then insert into public.sportsbook_badge_awards(discord_user_id,badge_code,season_year,week) values(r.discord_user_id,'perfect_card',b.season_year,b.week) on conflict do nothing; end if;
    if r.wins=0 and r.losses>=3 then insert into public.sportsbook_badge_awards(discord_user_id,badge_code,season_year,week) values(r.discord_user_id,'cold_ticket',b.season_year,b.week) on conflict do nothing; end if;
    if r.points>=10 then insert into public.sportsbook_badge_awards(discord_user_id,badge_code,season_year,week) values(r.discord_user_id,'bookie_breaker',b.season_year,b.week) on conflict do nothing; end if;
  end loop;
  insert into public.sportsbook_badge_awards(discord_user_id,badge_code,season_year,week)
    select discord_user_id,'sharp',b.season_year,b.week from public.sportsbook_picks where board_id=b.id and status in ('won','lost')
    group by discord_user_id having count(*)>=3 order by count(*) filter(where status='won')::numeric/count(*) desc,sum(points_awarded) desc limit 1 on conflict do nothing;
  insert into public.sportsbook_badge_awards(discord_user_id,badge_code,season_year,week)
    select p.discord_user_id,'dog_whisperer',b.season_year,'' from public.sportsbook_picks p join public.sportsbook_boards sb on sb.id=p.board_id
    where sb.season_year=b.season_year and p.pick_type='moneyline' and p.locked_odds>=100 and p.status='won'
    group by p.discord_user_id having count(*)>=3 on conflict do nothing;
  insert into public.sportsbook_badge_awards(discord_user_id,badge_code,season_year,week)
    select p.discord_user_id,'chalk_eater',b.season_year,'' from public.sportsbook_picks p join public.sportsbook_boards sb on sb.id=p.board_id
    where sb.season_year=b.season_year and p.pick_type='moneyline' and p.locked_odds<0
    group by p.discord_user_id having count(*)>=5 on conflict do nothing;
  insert into public.sportsbook_badge_awards(discord_user_id,badge_code,season_year,week)
    select p.discord_user_id,'heater',b.season_year,'' from public.sportsbook_picks p join public.sportsbook_boards sb on sb.id=p.board_id
    where sb.season_year=b.season_year and p.status='won' group by p.discord_user_id having count(*)>=5 on conflict do nothing;
end;
$$;

create or replace function public.submit_elite_books_pick(p_line_id uuid,p_pick_type text,p_team_id text)
returns public.sportsbook_picks language plpgsql security definer set search_path=public as $$
declare v_user public.discord_users; v_line public.sportsbook_lines; v_board public.sportsbook_boards; v_pick public.sportsbook_picks; v_odds integer; v_spread numeric; v_points integer;
begin
  select * into v_user from public.discord_users where auth_user_id=auth.uid() and is_active is not false;
  if v_user.id is null then raise exception 'Link an active Discord account first'; end if;
  select * into v_line from public.sportsbook_lines where id=p_line_id;
  select * into v_board from public.sportsbook_boards where id=v_line.board_id;
  if v_board.id is null or v_board.status<>'open' or (v_board.locks_at is not null and now()>=v_board.locks_at) then raise exception 'This board is locked'; end if;
  if v_line.is_betting_locked then raise exception 'Betting is locked for this matchup'; end if;
  if not exists(select 1 from public.league_settings ls where ls.id=1 and ls.current_year=v_board.season_year and ls.current_week=v_board.week) then raise exception 'Only the current week is open for picks'; end if;
  if p_team_id not in (v_line.team_1_id,v_line.team_2_id) then raise exception 'Invalid team selection'; end if;
  if p_pick_type='moneyline' then
    v_odds:=case when p_team_id=v_line.team_1_id then v_line.team_1_moneyline else v_line.team_2_moneyline end; v_spread:=null; v_points:=public.elite_books_moneyline_points(v_odds);
  elsif p_pick_type='spread' then
    v_spread:=case when p_team_id=v_line.team_1_id then v_line.team_1_spread else v_line.team_2_spread end; v_odds:=null; v_points:=public.elite_books_spread_points(v_spread);
  else raise exception 'Pick type must be moneyline or spread'; end if;
  insert into public.sportsbook_picks(auth_user_id,discord_user_id,board_id,line_id,pick_type,selected_team_id,locked_odds,locked_spread,possible_points)
    values(auth.uid(),v_user.id::text,v_board.id,v_line.id,p_pick_type,p_team_id,v_odds,v_spread,v_points)
  on conflict(auth_user_id,line_id,pick_type) do update set selected_team_id=excluded.selected_team_id,locked_odds=excluded.locked_odds,locked_spread=excluded.locked_spread,possible_points=excluded.possible_points,created_at=now()
  returning * into v_pick;
  update public.sportsbook_lines set is_frozen=true where id=v_line.id;
  return v_pick;
end;
$$;

create or replace function public.set_elite_books_matchup_lock(p_line_id uuid,p_locked boolean,p_reason text default 'Game started')
returns public.sportsbook_lines language plpgsql security definer set search_path=public as $$
declare v_line public.sportsbook_lines;
begin
  if not public.elite_books_is_commissioner() then raise exception 'Commissioner Discord account required'; end if;
  update public.sportsbook_lines set
    is_betting_locked=p_locked,
    betting_locked_at=case when p_locked then now() else null end,
    betting_lock_reason=case when p_locked then coalesce(nullif(trim(p_reason),''),'Game started') else null end
  where id=p_line_id returning * into v_line;
  if v_line.id is null then raise exception 'Sportsbook matchup not found'; end if;
  return v_line;
end;
$$;

create or replace function public.submit_elite_books_future(p_option_id uuid)
returns public.sportsbook_future_picks language plpgsql security definer set search_path=public as $$
declare v_user public.discord_users; v_option public.sportsbook_future_options; v_market public.sportsbook_future_markets; v_pick public.sportsbook_future_picks;
begin
  select * into v_user from public.discord_users where auth_user_id=auth.uid() and is_active is not false;
  if v_user.id is null then raise exception 'Link an active Discord account first'; end if;
  select * into v_option from public.sportsbook_future_options where id=p_option_id;
  select * into v_market from public.sportsbook_future_markets where id=v_option.market_id;
  if v_market.id is null or v_market.status<>'open' or (v_market.lock_at is not null and now()>=v_market.lock_at) then raise exception 'This futures market is locked'; end if;
  insert into public.sportsbook_future_picks(auth_user_id,discord_user_id,market_id,option_id,locked_odds,possible_points)
    values(auth.uid(),v_user.id::text,v_market.id,v_option.id,v_option.american_odds,v_option.bonus_points)
  on conflict(auth_user_id,market_id) do update set option_id=excluded.option_id,locked_odds=excluded.locked_odds,possible_points=excluded.possible_points,created_at=now()
  returning * into v_pick; return v_pick;
end;
$$;

create or replace function public.settle_elite_books_result()
returns trigger language plpgsql security definer set search_path=public as $$
declare l public.sportsbook_lines; p record; win boolean; push boolean;
begin
  for l in select sl.* from public.sportsbook_lines sl join public.sportsbook_boards sb on sb.id=sl.board_id
    where sb.season_year=new.season_year and sb.week=new.week
      and ((sl.team_1_id=new.team_1_id::text and sl.team_2_id=new.team_2_id::text) or (sl.team_1_id=new.team_2_id::text and sl.team_2_id=new.team_1_id::text))
  loop
    if l.team_1_id=new.team_1_id::text then
      update public.sportsbook_lines set result_id=new.id::text,team_1_score=new.team_1_score,team_2_score=new.team_2_score,winner_team_id=case when new.team_1_score>new.team_2_score then l.team_1_id else l.team_2_id end,settled_at=now() where id=l.id;
    else
      update public.sportsbook_lines set result_id=new.id::text,team_1_score=new.team_2_score,team_2_score=new.team_1_score,winner_team_id=case when new.team_2_score>new.team_1_score then l.team_1_id else l.team_2_id end,settled_at=now() where id=l.id;
    end if;
    select * into l from public.sportsbook_lines where id=l.id;
    for p in select * from public.sportsbook_picks where line_id=l.id and status='pending' loop
      push:=false;
      if p.pick_type='moneyline' then win:=p.selected_team_id=l.winner_team_id;
      elsif p.selected_team_id=l.team_1_id then push:=(l.team_1_score+p.locked_spread=l.team_2_score); win:=(l.team_1_score+p.locked_spread>l.team_2_score);
      else push:=(l.team_2_score+p.locked_spread=l.team_1_score); win:=(l.team_2_score+p.locked_spread>l.team_1_score); end if;
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

drop trigger if exists elite_books_result_settlement on public.game_results;
create trigger elite_books_result_settlement after insert or update of team_1_score,team_2_score on public.game_results
for each row execute function public.settle_elite_books_result();

create or replace function public.elite_books_week_advance()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  update public.sportsbook_boards set locks_at=new.advance_at
    where season_year=new.current_year and week=new.current_week and status='open';
  if old.current_year is distinct from new.current_year or old.current_week is distinct from new.current_week then
    update public.sportsbook_boards set status=case when status='open' then 'locked' else status end
      where season_year=old.current_year and week=old.current_week;
    if old.current_year is distinct from new.current_year then
      insert into public.sportsbook_season_champions(season_year,discord_user_id,total_points,correct_picks,total_picks)
        select season_year,discord_user_id,total_points,correct_picks,graded_picks from public.elite_books_standings
        where season_year=old.current_year order by total_points desc,correct_picks desc limit 1
      on conflict(season_year) do update set discord_user_id=excluded.discord_user_id,total_points=excluded.total_points,correct_picks=excluded.correct_picks,total_picks=excluded.total_picks,crowned_at=now();
      insert into public.sportsbook_badge_awards(discord_user_id,badge_code,season_year,week)
        select discord_user_id,'season_champ',season_year,'' from public.sportsbook_season_champions where season_year=old.current_year
      on conflict do nothing;
    end if;
    perform public.generate_elite_books_board(new.current_year,new.current_week);
  end if;
  return new;
end;
$$;

drop trigger if exists elite_books_on_week_advance on public.league_settings;
create trigger elite_books_on_week_advance after update of current_year,current_week on public.league_settings
for each row execute function public.elite_books_week_advance();

create or replace function public.elite_books_matchup_sync()
returns trigger language plpgsql security definer set search_path=public as $$
declare y integer; w text; mid text;
begin
  if tg_op='DELETE' then y:=old.season_year; w:=old.week; mid:=old.id::text;
  else y:=new.season_year; w:=new.week; mid:=new.id::text; end if;
  if tg_op='DELETE' then delete from public.sportsbook_lines where matchup_id=mid and not is_frozen; end if;
  if exists(select 1 from public.league_settings where id=1 and current_year=y and current_week=w) then
    perform public.generate_elite_books_board(y,w);
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists elite_books_on_matchup_change on public.weekly_matchups;
create trigger elite_books_on_matchup_change after insert or update or delete on public.weekly_matchups
for each row execute function public.elite_books_matchup_sync();

create or replace view public.elite_books_standings as
select sb.season_year,p.discord_user_id,du.discord_username,
  sum(p.points_awarded)::integer as weekly_points,
  count(*) filter(where p.status='won')::integer as correct_picks,
  count(*) filter(where p.status in ('won','lost','push'))::integer as graded_picks,
  coalesce((select sum(fp.points_awarded) from public.sportsbook_future_picks fp join public.sportsbook_future_markets fm on fm.id=fp.market_id where fm.season_year=sb.season_year and fp.discord_user_id=p.discord_user_id),0)::integer as future_points,
  (sum(p.points_awarded)+coalesce((select sum(fp.points_awarded) from public.sportsbook_future_picks fp join public.sportsbook_future_markets fm on fm.id=fp.market_id where fm.season_year=sb.season_year and fp.discord_user_id=p.discord_user_id),0))::integer as total_points
from public.sportsbook_picks p join public.sportsbook_boards sb on sb.id=p.board_id
left join public.discord_users du on du.id::text=p.discord_user_id
group by sb.season_year,p.discord_user_id,du.discord_username;

create or replace view public.elite_books_all_time_standings as
select p.discord_user_id,du.discord_username,
  sum(p.points_awarded)::integer + coalesce((select sum(fp.points_awarded) from public.sportsbook_future_picks fp where fp.discord_user_id=p.discord_user_id),0)::integer as total_points,
  count(*) filter(where p.status='won')::integer as correct_picks,
  count(*) filter(where p.status in ('won','lost','push'))::integer as graded_picks,
  count(distinct sb.season_year)::integer as seasons
from public.sportsbook_picks p join public.sportsbook_boards sb on sb.id=p.board_id
left join public.discord_users du on du.id::text=p.discord_user_id
group by p.discord_user_id,du.discord_username;

create or replace function public.settle_elite_books_future(p_market_id uuid,p_option_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.elite_books_is_commissioner() then raise exception 'Commissioner Discord account required'; end if;
  if not exists(select 1 from public.sportsbook_future_options where id=p_option_id and market_id=p_market_id) then raise exception 'Option is not in this market'; end if;
  update public.sportsbook_future_markets set status='settled',settled_option_id=p_option_id,settled_at=now() where id=p_market_id;
  update public.sportsbook_future_picks set status=case when option_id=p_option_id then 'won' else 'lost' end,
    points_awarded=case when option_id=p_option_id then possible_points else 0 end,settled_at=now() where market_id=p_market_id;
end;
$$;

create or replace function public.set_elite_books_seed(p_user_id text,p_seed numeric)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.elite_books_is_commissioner() then raise exception 'Commissioner Discord account required'; end if;
  update public.discord_users set sportsbook_seed=greatest(1,least(99,p_seed)) where id::text=p_user_id;
  if not found then raise exception 'Discord user not found'; end if;
end;
$$;

create or replace function public.set_elite_books_team_seed(p_team_id text,p_seed numeric)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.elite_books_is_commissioner() then raise exception 'Commissioner Discord account required'; end if;
  update public.teams set sportsbook_team_seed=greatest(1,least(99,p_seed)) where id::text=p_team_id;
  if not found then raise exception 'Team not found'; end if;
end;
$$;

create or replace function public.set_elite_books_commissioner(p_user_id text,p_enabled boolean)
returns public.discord_users language plpgsql security definer set search_path=public as $$
declare v_target public.discord_users; v_commissioner_count integer;
begin
  if not public.elite_books_is_commissioner() then raise exception 'Commissioner Discord account required'; end if;
  select * into v_target from public.discord_users where id::text=p_user_id;
  if v_target.id is null then raise exception 'Discord user not found'; end if;
  if not p_enabled and v_target.is_commissioner then
    select count(*) into v_commissioner_count from public.discord_users where is_commissioner=true;
    if v_commissioner_count<=1 then raise exception 'At least one commissioner must remain'; end if;
  end if;
  update public.discord_users set is_commissioner=p_enabled where id::text=p_user_id returning * into v_target;
  return v_target;
end;
$$;

create or replace function public.seed_elite_books_futures(p_season integer,p_lock_at timestamptz default null)
returns void language plpgsql security definer set search_path=public as $$
declare mk uuid; c record; t record; u record; team_count integer; coach_count integer;
begin
  if auth.uid() is not null and not public.elite_books_is_commissioner() then raise exception 'Commissioner Discord account required'; end if;
  insert into public.sportsbook_future_markets(season_year,market_type,title,lock_at) values(p_season,'national_champion','National Champion',p_lock_at)
    on conflict(season_year,market_type,conference_name) do update set lock_at=coalesce(excluded.lock_at,sportsbook_future_markets.lock_at) returning id into mk;
  select count(*) into team_count from public.team_assignments where status='Active';
  for t in select distinct tm.id::text id,tm.name,round((coalesce(du.sportsbook_seed,50)*.75)+(coalesce(tm.sportsbook_team_seed,70)*.25),2) seed from public.team_assignments ta join public.teams tm on tm.id::text=ta.team_id::text left join public.discord_users du on du.id::text=ta.discord_user_id::text where ta.status='Active' loop
    insert into public.sportsbook_future_options(market_id,selection_type,team_id,selection_label,american_odds,bonus_points,model_snapshot)
      values(mk,'team',t.id,t.name,greatest(100,round(100+(team_count*80)-(t.seed*10)))::integer,greatest(3,round((100+(team_count*80)-(t.seed*10))/175))::integer,jsonb_build_object('preseason_composite',t.seed)) on conflict(market_id,selection_label) do update set american_odds=excluded.american_odds,bonus_points=excluded.bonus_points,model_snapshot=excluded.model_snapshot;
  end loop;
  for c in select distinct tm.conference from public.team_assignments ta join public.teams tm on tm.id::text=ta.team_id::text where ta.status='Active' and nullif(trim(tm.conference),'') is not null loop
    insert into public.sportsbook_future_markets(season_year,market_type,conference_name,title,lock_at) values(p_season,'conference_champion',c.conference,c.conference||' Champion',p_lock_at)
      on conflict(season_year,market_type,conference_name) do update set lock_at=coalesce(excluded.lock_at,sportsbook_future_markets.lock_at) returning id into mk;
    for t in select distinct tm.id::text id,tm.name,round((coalesce(du.sportsbook_seed,50)*.75)+(coalesce(tm.sportsbook_team_seed,70)*.25),2) seed from public.team_assignments ta join public.teams tm on tm.id::text=ta.team_id::text left join public.discord_users du on du.id::text=ta.discord_user_id::text where ta.status='Active' and tm.conference=c.conference loop
      insert into public.sportsbook_future_options(market_id,selection_type,team_id,selection_label,american_odds,bonus_points,model_snapshot)
        values(mk,'team',t.id,t.name,greatest(100,round(850-(t.seed*10)))::integer,greatest(2,round((850-(t.seed*10))/175))::integer,jsonb_build_object('preseason_composite',t.seed)) on conflict(market_id,selection_label) do update set american_odds=excluded.american_odds,bonus_points=excluded.bonus_points,model_snapshot=excluded.model_snapshot;
    end loop;
  end loop;
  insert into public.sportsbook_future_markets(season_year,market_type,title,lock_at) values(p_season,'heath_hurley_coty','Heath Hurley COTY',p_lock_at)
    on conflict(season_year,market_type,conference_name) do update set lock_at=coalesce(excluded.lock_at,sportsbook_future_markets.lock_at) returning id into mk;
  select count(*) into coach_count from public.discord_users where is_active is not false;
  for u in select id::text id,discord_username,coalesce(sportsbook_seed,50) seed from public.discord_users where is_active is not false loop
    insert into public.sportsbook_future_options(market_id,selection_type,discord_user_id,selection_label,american_odds,bonus_points,model_snapshot)
      values(mk,'coach',u.id,u.discord_username,greatest(100,round(100+(coach_count*75)-(u.seed*9)))::integer,greatest(3,round((100+(coach_count*75)-(u.seed*9))/175))::integer,jsonb_build_object('preseason_seed',u.seed)) on conflict(market_id,selection_label) do update set american_odds=excluded.american_odds,bonus_points=excluded.bonus_points,model_snapshot=excluded.model_snapshot;
  end loop;
  if exists(select 1 from public.sportsbook_boards where season_year<p_season) then
    insert into public.sportsbook_future_markets(season_year,market_type,title,lock_at) values(p_season,'most_improved_team','Most Improved Team',p_lock_at)
      on conflict(season_year,market_type,conference_name) do update set lock_at=coalesce(excluded.lock_at,sportsbook_future_markets.lock_at) returning id into mk;
    for t in select distinct tm.id::text id,tm.name from public.team_assignments ta join public.teams tm on tm.id::text=ta.team_id::text where ta.status='Active' loop
      insert into public.sportsbook_future_options(market_id,selection_type,team_id,selection_label,american_odds,bonus_points)
      values(mk,'team',t.id,t.name,500,5) on conflict(market_id,selection_label) do nothing;
    end loop;
  end if;
end;
$$;

create index if not exists sportsbook_boards_season_week_idx on public.sportsbook_boards(season_year,week_index);
create index if not exists sportsbook_picks_user_idx on public.sportsbook_picks(discord_user_id,created_at desc);
create index if not exists sportsbook_future_picks_user_idx on public.sportsbook_future_picks(discord_user_id,created_at desc);
create index if not exists sportsbook_badge_awards_user_idx on public.sportsbook_badge_awards(discord_user_id,awarded_at desc);

alter table public.sportsbook_boards enable row level security;
alter table public.sportsbook_lines enable row level security;
alter table public.sportsbook_picks enable row level security;
alter table public.sportsbook_future_markets enable row level security;
alter table public.sportsbook_future_options enable row level security;
alter table public.sportsbook_future_picks enable row level security;
alter table public.sportsbook_badges enable row level security;
alter table public.sportsbook_badge_awards enable row level security;
alter table public.sportsbook_season_champions enable row level security;

do $$ declare t text; begin
  foreach t in array array['sportsbook_boards','sportsbook_lines','sportsbook_future_markets','sportsbook_future_options','sportsbook_badges','sportsbook_badge_awards','sportsbook_season_champions'] loop
    execute format('drop policy if exists elite_books_public_read on public.%I',t);
    execute format('create policy elite_books_public_read on public.%I for select using (true)',t);
  end loop;
end $$;

drop policy if exists elite_books_pick_read on public.sportsbook_picks;
create policy elite_books_pick_read on public.sportsbook_picks for select using (
  auth_user_id=auth.uid() or exists(select 1 from public.sportsbook_boards b where b.id=board_id and b.status in ('locked','settled'))
);
drop policy if exists elite_books_future_pick_read on public.sportsbook_future_picks;
create policy elite_books_future_pick_read on public.sportsbook_future_picks for select using (
  auth_user_id=auth.uid() or exists(select 1 from public.sportsbook_future_markets m where m.id=market_id and m.status in ('locked','settled','void'))
);

grant select on public.sportsbook_boards,public.sportsbook_lines,public.sportsbook_future_markets,public.sportsbook_future_options,public.sportsbook_badges,public.sportsbook_badge_awards,public.sportsbook_season_champions,public.elite_books_standings,public.elite_books_all_time_standings to anon,authenticated;
grant select on public.sportsbook_picks,public.sportsbook_future_picks to authenticated;
grant execute on function public.link_my_discord_user() to authenticated;
grant execute on function public.submit_elite_books_pick(uuid,text,text) to authenticated;
grant execute on function public.submit_elite_books_future(uuid) to authenticated;
grant execute on function public.set_elite_books_matchup_lock(uuid,boolean,text) to authenticated;
grant execute on function public.generate_elite_books_board(integer,text) to authenticated;
grant execute on function public.settle_elite_books_future(uuid,uuid) to authenticated;
grant execute on function public.seed_elite_books_futures(integer,timestamptz) to authenticated;
grant execute on function public.set_elite_books_seed(text,numeric) to authenticated;
grant execute on function public.set_elite_books_team_seed(text,numeric) to authenticated;
grant execute on function public.set_elite_books_commissioner(text,boolean) to authenticated;

select public.seed_elite_books_futures(current_year,advance_at) from public.league_settings where id=1;
select public.generate_elite_books_board(null,null);

commit;

select 'Elite Books migration complete' as status;
