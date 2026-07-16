begin;

alter table public.sportsbook_lines
  add column if not exists voided_at timestamptz,
  add column if not exists void_reason text,
  add column if not exists voided_by uuid;

create or replace function public.void_elite_books_matchup(p_line_id uuid,p_reason text default 'Game was not played')
returns public.sportsbook_lines language plpgsql security definer set search_path=public as $$
declare
  v_line public.sportsbook_lines;
  v_reason text:=coalesce(nullif(trim(p_reason),''),'Game was not played');
begin
  if not public.elite_books_is_commissioner() then
    raise exception 'Commissioner Discord account required';
  end if;

  select * into v_line from public.sportsbook_lines where id=p_line_id for update;
  if v_line.id is null then raise exception 'Sportsbook matchup not found'; end if;
  if v_line.voided_at is not null then return v_line; end if;
  if v_line.settled_at is not null then raise exception 'A finalized matchup cannot be voided'; end if;

  update public.sportsbook_lines set
    voided_at=now(),
    void_reason=v_reason,
    voided_by=auth.uid(),
    settled_at=now(),
    is_betting_locked=true,
    betting_locked_at=coalesce(betting_locked_at,now()),
    betting_lock_reason='Matchup voided: '||v_reason,
    result_id=null,
    team_1_score=null,
    team_2_score=null,
    winner_team_id=null
  where id=p_line_id returning * into v_line;

  update public.sportsbook_picks set
    status='void',points_awarded=0,settled_at=now()
  where line_id=p_line_id and status='pending';

  update public.sportsbook_boards sb set status='settled',settled_at=now()
  where sb.id=v_line.board_id
    and exists(select 1 from public.sportsbook_lines sl where sl.board_id=sb.id)
    and not exists(select 1 from public.sportsbook_lines sl where sl.board_id=sb.id and sl.settled_at is null);

  perform public.award_elite_books_badges(v_line.board_id);
  return v_line;
end;
$$;

grant execute on function public.void_elite_books_matchup(uuid,text) to authenticated;

-- Voided matchups stay void even if a result is accidentally entered later.
create or replace function public.settle_elite_books_result()
returns trigger language plpgsql security definer set search_path=public as $$
declare l public.sportsbook_lines; p record; win boolean; push boolean; final_total integer;
begin
  for l in select sl.* from public.sportsbook_lines sl join public.sportsbook_boards sb on sb.id=sl.board_id
    where sb.season_year=new.season_year and sb.week=new.week and sl.voided_at is null
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
      else win:=false;
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

-- Backfill Dward1515's four manually documented Week 2 moneyline/spread pairs.
do $$
declare
  v_user record;
  v_board public.sportsbook_boards;
  v_choice record;
  v_line public.sportsbook_lines;
  v_team_id text;
  v_odds integer;
  v_spread numeric(5,1);
  v_points integer;
  v_pick record;
  v_win boolean;
  v_push boolean;
begin
  select * into v_user from public.discord_users
  where lower(discord_username)=lower('Dward1515') and is_active is not false
  order by (auth_user_id is not null) desc limit 1;
  if v_user.id is null then raise exception 'Active Discord user Dward1515 was not found'; end if;
  if v_user.auth_user_id is null then raise exception 'Dward1515 must log in with Discord once before picks can be backfilled'; end if;

  select * into v_board from public.sportsbook_boards
  where season_year=2026 and week_index=2 limit 1;
  if v_board.id is null then raise exception 'The 2026 Week 2 Elite Books board was not found'; end if;

  for v_choice in
    select * from (values
      ('Arkansas State Red Wolves','moneyline'),('Arkansas State Red Wolves','spread'),
      ('Marshall Thundering Herd','moneyline'),('Marshall Thundering Herd','spread'),
      ('Washington State Cougars','moneyline'),('Washington State Cougars','spread'),
      ('Temple Owls','moneyline'),('Temple Owls','spread')
    ) as x(team_name,pick_type)
  loop
    select t.id::text into v_team_id from public.teams t where lower(t.name)=lower(v_choice.team_name) limit 1;
    if v_team_id is null then raise exception 'Team not found: %',v_choice.team_name; end if;
    select * into v_line from public.sportsbook_lines
      where board_id=v_board.id and v_team_id in (team_1_id,team_2_id) limit 1;
    if v_line.id is null then raise exception 'Week 2 line not found for %',v_choice.team_name; end if;

    v_odds:=null; v_spread:=null;
    if v_choice.pick_type='moneyline' then
      v_odds:=case when v_team_id=v_line.team_1_id then v_line.team_1_moneyline else v_line.team_2_moneyline end;
      v_points:=public.elite_books_moneyline_points(v_odds);
    else
      v_spread:=case when v_team_id=v_line.team_1_id then v_line.team_1_spread else v_line.team_2_spread end;
      v_points:=public.elite_books_spread_points(v_spread);
    end if;

    insert into public.sportsbook_picks(auth_user_id,discord_user_id,board_id,line_id,pick_type,pick_slot,selected_team_id,locked_odds,locked_spread,possible_points,status,points_awarded)
    values(v_user.auth_user_id,v_user.id::text,v_board.id,v_line.id,v_choice.pick_type,v_choice.pick_type,v_team_id,v_odds,v_spread,v_points,'pending',0)
    on conflict(auth_user_id,line_id,pick_slot) do nothing;
    update public.sportsbook_lines set is_frozen=true where id=v_line.id;

    if v_line.settled_at is not null and v_line.voided_at is null and v_line.team_1_score is not null and v_line.team_2_score is not null then
      for v_pick in select * from public.sportsbook_picks
        where auth_user_id=v_user.auth_user_id and line_id=v_line.id and pick_slot=v_choice.pick_type and status='pending'
      loop
        v_push:=false;
        if v_pick.pick_type='moneyline' then
          v_win:=v_pick.selected_team_id=v_line.winner_team_id;
        elsif v_pick.selected_team_id=v_line.team_1_id then
          v_push:=(v_line.team_1_score+v_pick.locked_spread=v_line.team_2_score);
          v_win:=(v_line.team_1_score+v_pick.locked_spread>v_line.team_2_score);
        else
          v_push:=(v_line.team_2_score+v_pick.locked_spread=v_line.team_1_score);
          v_win:=(v_line.team_2_score+v_pick.locked_spread>v_line.team_1_score);
        end if;
        update public.sportsbook_picks set
          status=case when v_push then 'push' when v_win then 'won' else 'lost' end,
          points_awarded=case when v_win and not v_push then possible_points else 0 end,
          settled_at=now()
        where id=v_pick.id;
      end loop;
    end if;
  end loop;
end;
$$;

commit;

select 'Elite Books v23: Dward1515 backfill and matchup voiding complete' as status;
