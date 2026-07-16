begin;

-- Spread rewards now reflect the actual risk of the selection:
-- taking points is the safer one-point side, while asking a favorite to cover
-- an increasingly large number earns progressively more.
create or replace function public.elite_books_spread_points(p_spread numeric)
returns integer language sql immutable as $$
  select case
    when coalesce(p_spread,0)>=0 then 1
    when abs(p_spread)<7 then 2
    when abs(p_spread)<14 then 3
    when abs(p_spread)<21 then 4
    else 5
  end;
$$;

-- Translate the projected scoring margin into a straight-up win probability,
-- then add a 4.5% two-way overround. Spread and moneyline can only match at a
-- genuine pick'em; every non-zero projected edge receives distinct ML prices.
create or replace function public.price_elite_books_line_v33()
returns trigger language plpgsql set search_path=public as $$
declare
  v_margin numeric;
  v_probability numeric;
  v_priced_probability_1 numeric;
  v_priced_probability_2 numeric;
begin
  if coalesce(new.is_frozen,false) then return new; end if;
  v_margin:=coalesce(new.projected_margin,-new.team_1_spread,0);
  v_probability:=greatest(.06,least(.94,1/(1+exp(-v_margin/7.5))));
  v_priced_probability_1:=greatest(.02,least(.98,v_probability*1.045));
  v_priced_probability_2:=greatest(.02,least(.98,(1-v_probability)*1.045));
  new.team_1_win_probability:=v_probability;
  new.team_1_moneyline:=(round((case when v_priced_probability_1>=.5 then -100*v_priced_probability_1/(1-v_priced_probability_1) else 100*(1-v_priced_probability_1)/v_priced_probability_1 end)/5.0)*5)::integer;
  new.team_2_moneyline:=(round((case when v_priced_probability_2>=.5 then -100*v_priced_probability_2/(1-v_priced_probability_2) else 100*(1-v_priced_probability_2)/v_priced_probability_2 end)/5.0)*5)::integer;
  -- Do not let five-point display rounding erase a real model edge.
  if abs(v_margin)>.01 and new.team_1_moneyline=new.team_2_moneyline then
    if v_margin>0 then
      new.team_1_moneyline:=new.team_1_moneyline-5;
      new.team_2_moneyline:=new.team_2_moneyline+5;
    else
      new.team_1_moneyline:=new.team_1_moneyline+5;
      new.team_2_moneyline:=new.team_2_moneyline-5;
    end if;
  end if;
  new.model_snapshot:=coalesce(new.model_snapshot,'{}'::jsonb)||jsonb_build_object(
    'pricing_version','v33-risk-choice',
    'probability_curve_scale',7.5,
    'moneyline_hold',0.045,
    'fair_team_1_probability',round(v_probability,4),
    'spread_reward_rule','favorite cover risk; underdog with points is one point'
  );
  return new;
end;
$$;

drop trigger if exists price_elite_books_line_v33 on public.sportsbook_lines;
create trigger price_elite_books_line_v33
before insert or update of projected_margin,team_1_spread,team_2_spread,is_frozen
on public.sportsbook_lines
for each row execute function public.price_elite_books_line_v33();

-- Reprice only unsettled, unfrozen lines. Existing submitted/locked tickets
-- retain their recorded odds, spread, and possible points.
update public.sportsbook_lines
set projected_margin=projected_margin
where coalesce(is_frozen,false)=false and settled_at is null;

create or replace function public.queue_test_push_notification()
returns uuid language plpgsql security definer set search_path=public as $$
declare v_discord_user_id text; v_notification_id uuid;
begin
  select id::text into v_discord_user_id
  from public.discord_users
  where auth_user_id=auth.uid() and is_active is not false and is_banned is not true
  limit 1;
  if v_discord_user_id is null then raise exception 'An active linked Discord account is required'; end if;
  insert into public.app_notifications(auth_user_id,discord_user_id,notification_type,title,body,target_tab)
  values(auth.uid(),v_discord_user_id,'test','CFB Elite 27 notifications are live','Your league alerts are connected to this device.','leagueHub')
  returning id into v_notification_id;
  return v_notification_id;
end;
$$;

grant execute on function public.queue_test_push_notification() to authenticated;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
declare v_job_id bigint;
begin
  for v_job_id in select jobid from cron.job where jobname='cfbelite-push-delivery'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end;
$$;

select cron.schedule(
  'cfbelite-push-delivery',
  '* * * * *',
  $schedule$
    select net.http_post(
      url:='https://plwpidgxqqesetizopwu.supabase.co/functions/v1/send-push-notifications',
      headers:='{"Content-Type":"application/json"}'::jsonb,
      body:='{}'::jsonb,
      timeout_milliseconds:=10000
    );
  $schedule$
);

comment on function public.elite_books_spread_points(numeric) is
  'v33 choice model: underdog spread is safer at one point; favorite cover requirements earn 2-5 points.';

commit;
