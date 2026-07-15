-- CFBElite 27 v22: enrich the All-Time Sportsbook ledger with market records.

begin;

create or replace view public.elite_books_all_time_standings as
select
  p.discord_user_id,
  du.discord_username,
  sum(p.points_awarded)::integer
    + coalesce((
        select sum(fp.points_awarded)
          from public.sportsbook_future_picks fp
         where fp.discord_user_id=p.discord_user_id
      ),0)::integer as total_points,
  count(*) filter(where p.status='won')::integer as correct_picks,
  count(*) filter(where p.status in ('won','lost','push'))::integer as graded_picks,
  count(distinct sb.season_year)::integer as seasons,
  count(*) filter(where p.status='lost')::integer as lost_picks,
  count(*) filter(where p.status='push')::integer as pushes,
  coalesce(round(
    100.0 * count(*) filter(where p.status='won')
    / nullif(count(*) filter(where p.status in ('won','lost')),0)
  ,1),0)::numeric(5,1) as win_percentage,
  count(*) filter(where p.pick_type='moneyline' and p.status='won')::integer as moneyline_wins,
  count(*) filter(where p.pick_type='moneyline' and p.status='lost')::integer as moneyline_losses,
  count(*) filter(where p.pick_type='spread' and p.status='won')::integer as spread_wins,
  count(*) filter(where p.pick_type='spread' and p.status='lost')::integer as spread_losses,
  count(*) filter(where p.pick_type='total' and p.status='won')::integer as total_wins,
  count(*) filter(where p.pick_type='total' and p.status='lost')::integer as total_losses,
  count(*) filter(where p.pick_type='moneyline' and p.locked_odds>=100 and p.status='won')::integer as underdog_wins
from public.sportsbook_picks p
join public.sportsbook_boards sb on sb.id=p.board_id
left join public.discord_users du on du.id::text=p.discord_user_id
group by p.discord_user_id,du.discord_username;

comment on view public.elite_books_all_time_standings is
  'Career Elite Books points, overall record, win percentage, market records, and underdog moneyline wins.';

commit;
