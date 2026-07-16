begin;

create table if not exists public.league_news_comments (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.league_news_articles(id) on delete cascade,
  author_discord_user_id text not null,
  body text not null check (char_length(body) between 1 and 2000),
  reply_to_id uuid references public.league_news_comments(id) on delete set null,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.league_news_reactions (
  article_id uuid not null references public.league_news_articles(id) on delete cascade,
  discord_user_id text not null,
  reaction text not null check (char_length(reaction) between 1 and 80),
  created_at timestamptz not null default now(),
  primary key(article_id,discord_user_id,reaction)
);

create index if not exists league_news_comments_article_created_idx
  on public.league_news_comments(article_id,created_at);

-- Remove the old Hub destination. Newsroom is now its own platform.
update public.league_channels set is_archived=true where slug='newsroom';

-- The first v34 draft was generated before active-user filtering existed.
update public.league_news_articles
set status='rejected',reviewed_by='v35-active-user-filter',updated_at=now()
where status='draft' and ai_model is not null and generated_at < now();

create or replace function public.queue_news_from_game_result()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_key text;
begin
  if new.team_1_score is null or new.team_2_score is null then return new; end if;
  if not exists (
    select 1
    from public.team_assignments ta
    join public.discord_users du on du.id::text=ta.discord_user_id::text
    where ta.team_id::text in (new.team_1_id::text,new.team_2_id::text)
      and lower(coalesce(ta.status,''))='active'
      and coalesce(du.is_active,true)
      and not coalesce(du.is_banned,false)
      and coalesce(ta.start_year,0)<=new.season_year
      and (ta.end_year is null or ta.end_year>=new.season_year)
  ) then return new; end if;
  v_key:='game:'||new.id::text||':'||new.team_1_score::text||'-'||new.team_2_score::text;
  insert into public.league_news_jobs(event_key,job_type,season_year,week_label,source_id,source_payload)
  values(v_key,'game_result',new.season_year,new.week,new.id::text,to_jsonb(new))
  on conflict(event_key) do nothing;
  return new;
end;
$$;

create or replace function public.review_league_news_article(p_article_id uuid,p_action text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_article public.league_news_articles; v_reviewer text;
begin
  if not public.league_network_is_commissioner() then raise exception 'Commissioner access required'; end if;
  v_reviewer:=public.league_network_current_user_id();
  select * into v_article from public.league_news_articles where id=p_article_id for update;
  if v_article.id is null or v_article.status<>'draft' then raise exception 'Draft article not found'; end if;
  if p_action='reject' then
    update public.league_news_articles set status='rejected',reviewed_by=v_reviewer,updated_at=now() where id=p_article_id;
    return null;
  elsif p_action<>'publish' then raise exception 'Action must be publish or reject'; end if;
  update public.league_news_articles
  set status='published',channel_message_id=null,reviewed_by=v_reviewer,published_at=now(),updated_at=now()
  where id=p_article_id;
  insert into public.app_notifications(auth_user_id,discord_user_id,notification_type,title,body,target_tab,target_id,actor_discord_user_id)
  select du.auth_user_id,du.id::text,'announcement','Newsroom: '||left(v_article.headline,120),left(v_article.dek,180),'newsroom',p_article_id::text,v_reviewer
  from public.discord_users du
  left join public.notification_preferences np on np.auth_user_id=du.auth_user_id
  where coalesce(du.is_active,true) and not coalesce(du.is_banned,false)
    and du.auth_user_id is not null and coalesce(np.announcements,true);
  return p_article_id;
end;
$$;

create or replace function public.post_league_news_comment(p_article_id uuid,p_body text,p_reply_to_id uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_user text; v_id uuid;
begin
  v_user:=public.league_network_current_user_id();
  if v_user is null then raise exception 'Active league membership required'; end if;
  if not exists(select 1 from public.discord_users where id::text=v_user and coalesce(is_active,true) and not coalesce(is_banned,false)) then raise exception 'Active league membership required'; end if;
  if not exists(select 1 from public.league_news_articles where id=p_article_id and status='published') then raise exception 'Published article not found'; end if;
  if p_reply_to_id is not null and not exists(select 1 from public.league_news_comments where id=p_reply_to_id and article_id=p_article_id and deleted_at is null) then raise exception 'Reply target not found'; end if;
  insert into public.league_news_comments(article_id,author_discord_user_id,body,reply_to_id)
  values(p_article_id,v_user,left(trim(p_body),2000),p_reply_to_id) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.delete_league_news_comment(p_comment_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_user text; v_author text;
begin
  v_user:=public.league_network_current_user_id();
  select author_discord_user_id into v_author from public.league_news_comments where id=p_comment_id;
  if v_author is null then raise exception 'Comment not found'; end if;
  if v_user<>v_author and not public.league_network_is_commissioner() then raise exception 'Comment owner or commissioner required'; end if;
  update public.league_news_comments set body='Comment removed',deleted_at=now(),edited_at=now() where id=p_comment_id;
end;
$$;

create or replace function public.toggle_league_news_reaction(p_article_id uuid,p_reaction text)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_user text; v_removed integer:=0;
begin
  v_user:=public.league_network_current_user_id();
  if v_user is null then raise exception 'Active league membership required'; end if;
  if not exists(select 1 from public.discord_users where id::text=v_user and coalesce(is_active,true) and not coalesce(is_banned,false)) then raise exception 'Active league membership required'; end if;
  if not exists(select 1 from public.league_news_articles where id=p_article_id and status='published') then raise exception 'Published article not found'; end if;
  delete from public.league_news_reactions where article_id=p_article_id and discord_user_id=v_user and reaction=left(p_reaction,80);
  get diagnostics v_removed=row_count;
  if v_removed>0 then return false; end if;
  insert into public.league_news_reactions(article_id,discord_user_id,reaction) values(p_article_id,v_user,left(p_reaction,80));
  return true;
end;
$$;

alter table public.league_news_comments enable row level security;
alter table public.league_news_reactions enable row level security;
drop policy if exists league_news_comments_member_read on public.league_news_comments;
create policy league_news_comments_member_read on public.league_news_comments for select to authenticated
using(exists(select 1 from public.league_news_articles a where a.id=article_id and a.status='published'));
drop policy if exists league_news_reactions_member_read on public.league_news_reactions;
create policy league_news_reactions_member_read on public.league_news_reactions for select to authenticated
using(exists(select 1 from public.league_news_articles a where a.id=article_id and a.status='published'));

revoke all on public.league_news_comments,public.league_news_reactions from anon;
grant select on public.league_news_comments,public.league_news_reactions to authenticated;
grant execute on function public.post_league_news_comment(uuid,text,uuid) to authenticated;
grant execute on function public.delete_league_news_comment(uuid) to authenticated;
grant execute on function public.toggle_league_news_reaction(uuid,text) to authenticated;

commit;
