begin;

create table if not exists public.league_channel_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  color text not null default '#38bdf8',
  sort_order integer not null default 100,
  is_system boolean not null default false,
  is_archived boolean not null default false,
  created_by uuid references public.discord_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint league_channel_categories_name_check check (char_length(trim(name)) between 2 and 40),
  constraint league_channel_categories_color_check check (color ~ '^#[0-9A-Fa-f]{6}$')
);

alter table public.league_channels
  add column if not exists category_id uuid references public.league_channel_categories(id) on delete set null;

create index if not exists league_channels_category_order_idx
  on public.league_channels(category_id,sort_order);

insert into public.league_channel_categories(name,slug,color,sort_order,is_system)
values
  ('League Central','league-central','#38bdf8',10,true),
  ('Game Scheduling','game-scheduling','#f4c430',20,true)
on conflict(slug) do update set
  name=excluded.name,color=excluded.color,sort_order=excluded.sort_order,is_system=true,is_archived=false,updated_at=now();

update public.league_channels c
set category_id=(select id from public.league_channel_categories where slug='game-scheduling')
where c.is_auto_matchup=true;

update public.league_channels c
set category_id=(select id from public.league_channel_categories where slug='league-central')
where c.is_auto_matchup=false and c.category_id is null;

create or replace function public.assign_default_league_channel_category()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.category_id is null then
    select id into new.category_id
    from public.league_channel_categories
    where slug=case when new.is_auto_matchup then 'game-scheduling' else 'league-central' end
      and is_archived=false
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists assign_default_league_channel_category on public.league_channels;
create trigger assign_default_league_channel_category
before insert or update of is_auto_matchup,category_id on public.league_channels
for each row execute function public.assign_default_league_channel_category();

alter table public.league_channel_categories enable row level security;
drop policy if exists league_channel_categories_read on public.league_channel_categories;
create policy league_channel_categories_read on public.league_channel_categories
for select to authenticated
using (public.league_network_current_user_id() is not null and is_archived=false);

revoke all on public.league_channel_categories from anon;
grant select on public.league_channel_categories to authenticated;

create or replace function public.manage_league_channel_category(
  p_category_id uuid,
  p_name text,
  p_color text default '#38bdf8',
  p_sort_order integer default 100
)
returns public.league_channel_categories
language plpgsql security definer set search_path=public as $$
declare v_category public.league_channel_categories; v_slug text;
begin
  if not (public.league_network_is_commissioner() or public.league_network_has_role_permission('manage_channels')) then
    raise exception 'Channel management permission required';
  end if;
  if char_length(trim(coalesce(p_name,''))) not between 2 and 40 then
    raise exception 'Category name must be 2 to 40 characters';
  end if;
  if coalesce(p_color,'') !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Choose a valid category color';
  end if;
  v_slug:=trim(both '-' from regexp_replace(lower(trim(p_name)),'[^a-z0-9]+','-','g'));
  if p_category_id is null then
    insert into public.league_channel_categories(name,slug,color,sort_order,created_by)
    values(trim(p_name),v_slug,lower(p_color),coalesce(p_sort_order,100),public.league_network_current_user_id())
    returning * into v_category;
  else
    update public.league_channel_categories
       set name=trim(p_name),
           slug=case when is_system then slug else v_slug end,
           color=lower(p_color),sort_order=coalesce(p_sort_order,sort_order),updated_at=now()
     where id=p_category_id and is_archived=false
    returning * into v_category;
  end if;
  if v_category.id is null then raise exception 'Category not found'; end if;
  return v_category;
end;
$$;

create or replace function public.archive_league_channel_category(p_category_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_system boolean;
begin
  if not (public.league_network_is_commissioner() or public.league_network_has_role_permission('manage_channels')) then
    raise exception 'Channel management permission required';
  end if;
  select is_system into v_system from public.league_channel_categories where id=p_category_id;
  if v_system then raise exception 'Core categories cannot be deleted'; end if;
  update public.league_channels set category_id=null,updated_at=now() where category_id=p_category_id;
  update public.league_channel_categories set is_archived=true,updated_at=now() where id=p_category_id;
end;
$$;

create or replace function public.set_league_channel_category(p_channel_id uuid,p_category_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not (public.league_network_is_commissioner() or public.league_network_has_role_permission('manage_channels')) then
    raise exception 'Channel management permission required';
  end if;
  if p_category_id is not null and not exists(
    select 1 from public.league_channel_categories where id=p_category_id and is_archived=false
  ) then raise exception 'Category not found'; end if;
  update public.league_channels
     set category_id=p_category_id,updated_at=now()
   where id=p_channel_id and is_auto_matchup=false;
  if not found then raise exception 'Channel not found or category is automatic'; end if;
end;
$$;

grant execute on function public.manage_league_channel_category(uuid,text,text,integer) to authenticated;
grant execute on function public.archive_league_channel_category(uuid) to authenticated;
grant execute on function public.set_league_channel_category(uuid,uuid) to authenticated;

update storage.buckets
set file_size_limit=5242880,
    allowed_mime_types=array['image/png','image/jpeg','image/webp','image/gif']
where id='league-emojis';

commit;
