-- Prefix each team's current poll rank onto matchup room titles, e.g.
-- "5 Ironclad State vs 8 Crimson Ridge" instead of just the team names.
--
-- Rebuilt on the function's confirmed-live body (fetched directly from
-- production and diffed byte-for-byte against this repo's v28 -- no drift
-- this time). The only change is pulling each team's most recent
-- ranking_snapshots row (same "order by week_index desc limit 1" lookup
-- generate_elite_books_board already uses for team_1_rank/team_2_rank) and
-- prepending it to the name/description. An unranked team (no snapshot
-- yet, e.g. week 1) falls back to just the team name, unprefixed.
--
-- This only affects the title baked in when a room is created/synced for
-- a given week -- it does not live-update if a team's rank changes after
-- the room already exists for that week, same as the rest of this
-- function's snapshot-at-sync-time behavior.

begin;

create or replace function public.sync_weekly_matchup_channels(p_season integer,p_week text)
returns integer language plpgsql security definer set search_path=public as $$
declare
  m record;
  v_channel_id uuid;
  v_slug text;
  v_count integer:=0;
  v_team_1_label text;
  v_team_2_label text;
begin
  if p_season is null or nullif(trim(p_week),'') is null then return 0; end if;

  update public.league_channels
     set is_archived=true,updated_at=now()
   where is_auto_matchup=true;

  for m in
    select wm.id::text as matchup_id,
           wm.team_1_id::text as team_1_id,
           wm.team_2_id::text as team_2_id,
           coalesce(wm.team_1_user_id::text,(
             select ta.discord_user_id::text from public.team_assignments ta
              where ta.team_id::text=wm.team_1_id::text and (ta.status='Active' or ta.status is null)
              order by ta.created_at desc limit 1
           )) as user_1_id,
           coalesce(wm.team_2_user_id::text,(
             select ta.discord_user_id::text from public.team_assignments ta
              where ta.team_id::text=wm.team_2_id::text and (ta.status='Active' or ta.status is null)
              order by ta.created_at desc limit 1
           )) as user_2_id,
           coalesce(t1.name,'Team 1') as team_1_name,
           coalesce(t2.name,'Team 2') as team_2_name,
           (select rs.rank from public.ranking_snapshots rs
             where rs.season_year=p_season and rs.team_id::text=wm.team_1_id::text
             order by rs.week_index desc limit 1) as team_1_rank,
           (select rs.rank from public.ranking_snapshots rs
             where rs.season_year=p_season and rs.team_id::text=wm.team_2_id::text
             order by rs.week_index desc limit 1) as team_2_rank
      from public.weekly_matchups wm
      left join public.teams t1 on t1.id::text=wm.team_1_id::text
      left join public.teams t2 on t2.id::text=wm.team_2_id::text
     where wm.season_year=p_season and wm.week=p_week
  loop
    if m.user_1_id is null or m.user_2_id is null or m.user_1_id=m.user_2_id then continue; end if;
    if not exists(select 1 from public.discord_users du where du.id::text=m.user_1_id and du.is_active is not false and du.is_banned is not true)
       or not exists(select 1 from public.discord_users du where du.id::text=m.user_2_id and du.is_active is not false and du.is_banned is not true) then continue; end if;

    v_team_1_label:=case when m.team_1_rank is not null then m.team_1_rank||' '||m.team_1_name else m.team_1_name end;
    v_team_2_label:=case when m.team_2_rank is not null then m.team_2_rank||' '||m.team_2_name else m.team_2_name end;

    v_slug:='matchup-'||p_season||'-'||regexp_replace(lower(p_week),'[^a-z0-9]+','-','g')||'-'||left(replace(m.matchup_id,'-',''),8);
    insert into public.league_channels(
      slug,name,description,icon,channel_type,sort_order,is_locked,is_archived,
      is_auto_matchup,season_year,week,matchup_id,updated_at
    ) values (
      v_slug,left(v_team_1_label||' vs '||v_team_2_label,60),
      'Private game scheduling for '||m.team_1_name||' and '||m.team_2_name||' • '||p_week,
      'VS','matchup',200+v_count,false,false,true,p_season,p_week,m.matchup_id,now()
    )
    on conflict(matchup_id) where is_auto_matchup do update set
      slug=excluded.slug,name=excluded.name,description=excluded.description,
      is_archived=false,season_year=excluded.season_year,week=excluded.week,updated_at=now()
    returning id into v_channel_id;

    insert into public.league_channel_permissions(channel_id,discord_user_id,can_view,can_post,can_manage,updated_at)
    values(v_channel_id,m.user_1_id,true,true,false,now()),(v_channel_id,m.user_2_id,true,true,false,now())
    on conflict(channel_id,discord_user_id) do update set can_view=true,can_post=true,updated_at=now();
    v_count:=v_count+1;
  end loop;
  return v_count;
end;
$$;

commit;

select 'Matchup room titles now prefix each team''s current rank' as status;
