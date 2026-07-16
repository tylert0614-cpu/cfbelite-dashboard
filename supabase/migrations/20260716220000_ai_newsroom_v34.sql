begin;

create extension if not exists pgcrypto;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create table if not exists public.league_news_jobs (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  job_type text not null check (job_type in ('game_result','week_advance','weekly_digest')),
  season_year integer not null,
  week_label text not null,
  source_id text,
  source_payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','processing','completed','failed')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create table if not exists public.league_news_articles (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.league_news_jobs(id) on delete set null,
  season_year integer not null,
  week_label text not null,
  category text not null check (category in ('breaking','recap','rankings','preview','sportsbook','feature')),
  headline text not null check (char_length(headline) between 5 and 140),
  dek text not null default '' check (char_length(dek) <= 280),
  body text not null check (char_length(body) between 20 and 3600),
  factual_summary jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','published','rejected')),
  ai_model text,
  ai_response_id text,
  channel_message_id uuid references public.league_channel_messages(id) on delete set null,
  reviewed_by text,
  generated_at timestamptz not null default now(),
  published_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists league_news_articles_status_generated_idx
  on public.league_news_articles(status,generated_at desc);
create index if not exists league_news_jobs_status_created_idx
  on public.league_news_jobs(status,created_at);

insert into public.league_channels(slug,name,description,icon,channel_type,sort_order,is_locked,is_archived,created_by)
values('newsroom','CFB Elite Newsroom','AI-assisted league reporting, commissioner reviewed before publication.','#','announcements',15,true,false,'system')
on conflict(slug) do update set
  name=excluded.name,
  description=excluded.description,
  channel_type='announcements',
  is_locked=true,
  is_archived=false;

update public.league_channels
set category_id=(select id from public.league_channel_categories where is_archived=false order by is_system desc,sort_order limit 1)
where slug='newsroom' and category_id is null;

create or replace function public.queue_news_from_game_result()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_key text;
begin
  if new.team_1_score is null or new.team_2_score is null then return new; end if;
  v_key:='game:'||new.id::text||':'||new.team_1_score::text||'-'||new.team_2_score::text;
  insert into public.league_news_jobs(event_key,job_type,season_year,week_label,source_id,source_payload)
  values(v_key,'game_result',new.season_year,new.week,new.id::text,to_jsonb(new))
  on conflict(event_key) do nothing;
  return new;
end;
$$;

drop trigger if exists queue_ai_news_from_game_result on public.game_results;
create trigger queue_ai_news_from_game_result
after insert or update of team_1_score,team_2_score on public.game_results
for each row execute function public.queue_news_from_game_result();

create or replace function public.queue_news_from_week_advance()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.current_year is distinct from new.current_year or old.current_week is distinct from new.current_week then
    insert into public.league_news_jobs(event_key,job_type,season_year,week_label,source_id,source_payload)
    values('advance:'||new.current_year::text||':'||new.current_week,'week_advance',new.current_year,new.current_week,'1',jsonb_build_object('previous_year',old.current_year,'previous_week',old.current_week,'current_year',new.current_year,'current_week',new.current_week))
    on conflict(event_key) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists queue_ai_news_from_week_advance on public.league_settings;
create trigger queue_ai_news_from_week_advance
after update of current_year,current_week on public.league_settings
for each row execute function public.queue_news_from_week_advance();

create or replace function public.queue_league_news_digest()
returns uuid language plpgsql security definer set search_path=public as $$
declare v_settings public.league_settings; v_id uuid;
begin
  if not public.league_network_is_commissioner() then raise exception 'Commissioner access required'; end if;
  select * into v_settings from public.league_settings where id=1;
  insert into public.league_news_jobs(event_key,job_type,season_year,week_label,source_id,source_payload)
  values('digest:'||v_settings.current_year::text||':'||v_settings.current_week||':'||extract(epoch from clock_timestamp())::bigint,'weekly_digest',v_settings.current_year,v_settings.current_week,'manual',jsonb_build_object('requested_by',public.league_network_current_user_id()))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.update_league_news_draft(p_article_id uuid,p_headline text,p_dek text,p_body text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.league_network_is_commissioner() then raise exception 'Commissioner access required'; end if;
  update public.league_news_articles set headline=left(trim(p_headline),140),dek=left(trim(p_dek),280),body=left(trim(p_body),3600),updated_at=now()
  where id=p_article_id and status='draft';
end;
$$;

create or replace function public.review_league_news_article(p_article_id uuid,p_action text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_article public.league_news_articles; v_channel uuid; v_message uuid; v_reviewer text; v_body text;
begin
  if not public.league_network_is_commissioner() then raise exception 'Commissioner access required'; end if;
  v_reviewer:=public.league_network_current_user_id();
  select * into v_article from public.league_news_articles where id=p_article_id for update;
  if v_article.id is null or v_article.status<>'draft' then raise exception 'Draft article not found'; end if;
  if p_action='reject' then
    update public.league_news_articles set status='rejected',reviewed_by=v_reviewer,updated_at=now() where id=p_article_id;
    return null;
  elsif p_action<>'publish' then raise exception 'Action must be publish or reject'; end if;
  select id into v_channel from public.league_channels where slug='newsroom' and is_archived=false limit 1;
  if v_channel is null then raise exception 'Newsroom channel not found'; end if;
  v_body:=left(v_article.headline||E'\n'||case when v_article.dek<>'' then v_article.dek||E'\n\n' else '' end||v_article.body||E'\n\n/'||upper(v_article.category)||' • '||v_article.season_year::text||' '||v_article.week_label,3900);
  insert into public.league_channel_messages(channel_id,author_discord_user_id,body,message_type)
  values(v_channel,v_reviewer,v_body,'announcement') returning id into v_message;
  update public.league_news_articles set status='published',channel_message_id=v_message,reviewed_by=v_reviewer,published_at=now(),updated_at=now() where id=p_article_id;
  return v_message;
end;
$$;

alter table public.league_news_jobs enable row level security;
alter table public.league_news_articles enable row level security;
drop policy if exists league_news_jobs_commissioner_read on public.league_news_jobs;
create policy league_news_jobs_commissioner_read on public.league_news_jobs for select to authenticated using(public.league_network_is_commissioner());
drop policy if exists league_news_articles_member_read on public.league_news_articles;
create policy league_news_articles_member_read on public.league_news_articles for select to authenticated using(status='published' or public.league_network_is_commissioner());

revoke all on public.league_news_jobs,public.league_news_articles from anon;
grant select on public.league_news_jobs,public.league_news_articles to authenticated;
grant execute on function public.queue_league_news_digest() to authenticated;
grant execute on function public.update_league_news_draft(uuid,text,text,text) to authenticated;
grant execute on function public.review_league_news_article(uuid,text) to authenticated;

do $$ declare v_job_id bigint; begin
  for v_job_id in select jobid from cron.job where jobname='cfbelite-ai-newsroom' loop perform cron.unschedule(v_job_id); end loop;
end $$;

select cron.schedule('cfbelite-ai-newsroom','*/3 * * * *',$schedule$
  select net.http_post(
    url:='https://plwpidgxqqesetizopwu.supabase.co/functions/v1/generate-league-news',
    headers:='{"Content-Type":"application/json"}'::jsonb,
    body:='{}'::jsonb,
    timeout_milliseconds:=60000
  );
$schedule$);

insert into public.league_news_jobs(event_key,job_type,season_year,week_label,source_id,source_payload)
select 'digest:'||current_year::text||':'||current_week||':initial-v34','weekly_digest',current_year,current_week,'migration','{}'::jsonb
from public.league_settings where id=1 on conflict(event_key) do nothing;

commit;
