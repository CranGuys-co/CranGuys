-- CranGuys online: accounts, progress, the ranked leaderboard, world records, the public room list and live
-- player counts. Safe to run again. Everything is named cg_… so it can share a project with other games.
--
-- Who can write what:
--   * cg_profiles, cg_ranked, cg_records: only the cg-api Edge Function (it uses the secret key, which bypasses
--     Row Level Security). It applies the game's own rules (src/online/progress.js), so the browser can never
--     set its own Cranberries, items or rank.
--   * cg_rooms, cg_live: anyone, but only through the cg_room_* and cg_live functions below, which check
--     every value. Guests can play online without an account.
--   * Reading: a player can read their own profile; the leaderboard, records, rooms and counts are read
--     through the functions below, which only return public columns.

-- ---------------------------------------------------------------- profiles (one per account)
create table if not exists public.cg_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 16),
  name_key text not null,                        -- lower case, letters and digits only: one bean per name
  data jsonb not null default '{}'::jsonb,       -- the whole save (see src/online/progress.js)
  rp integer not null default 0,                 -- copies of a few numbers from data, for the leaderboard
  wins integer not null default 0,
  level integer not null default 1,
  ranked_played integer not null default 0,
  color text not null default '#ff7af6',
  tag text,
  rev integer not null default 0,                -- bumped on every save (two saves at once can't clobber each other)
  last_result_at timestamptz,
  banned boolean not null default false,         -- set by hand in the Table Editor to hide someone from the boards
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists cg_profiles_name_key on public.cg_profiles (name_key);
create index if not exists cg_profiles_board on public.cg_profiles (rp desc, wins desc, created_at) where ranked_played > 0 and not banned;
alter table public.cg_profiles enable row level security;
drop policy if exists "cg_profiles: read own" on public.cg_profiles;
create policy "cg_profiles: read own" on public.cg_profiles for select to authenticated using ((select auth.uid()) = user_id);
revoke insert, update, delete on public.cg_profiles from anon, authenticated;

-- ---------------------------------------------------------------- ranked matches
-- Every signed-in player books a ranked match when it starts. A result only moves ranked points if the other
-- players booked the same match too, and only one of them can claim the win.
create table if not exists public.cg_ranked (
  mid text not null check (char_length(mid) between 1 and 40),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('duel', 'show')),
  rp_from integer not null,
  booked_at timestamptz not null default now(),
  res real,                  -- duel: 1 win, 0.5 draw, 0 loss
  place integer,             -- show: place among the real players
  won boolean not null default false,
  settled_at timestamptz,
  primary key (mid, user_id)
);
create index if not exists cg_ranked_booked on public.cg_ranked (booked_at);
alter table public.cg_ranked enable row level security;
revoke all on public.cg_ranked from anon, authenticated;

-- ---------------------------------------------------------------- world records (fastest time on each map)
create table if not exists public.cg_records (
  map text primary key check (char_length(map) between 1 and 24),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  ms integer not null check (ms > 0),
  color text not null default '#ff7af6',
  tag text,
  at timestamptz not null default now()
);
alter table public.cg_records enable row level security;
revoke all on public.cg_records from anon, authenticated;

-- ---------------------------------------------------------------- public rooms and live counts
create table if not exists public.cg_rooms (
  code text primary key check (code ~ '^[A-Z0-9]{5}$'),
  v text not null,             -- the game build: players only see rooms they can actually join
  kind text not null default '',
  n integer not null default 1,
  left_s integer not null default 0,
  rp integer not null default 0,
  since bigint not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.cg_rooms enable row level security;
revoke all on public.cg_rooms from anon, authenticated;

create table if not exists public.cg_live (
  id text primary key check (char_length(id) between 4 and 24),
  mode text not null check (mode in ('menu', 'online', 'duel', 'ranked')),
  at timestamptz not null default now()
);
alter table public.cg_live enable row level security;
revoke all on public.cg_live from anon, authenticated;

-- ---------------------------------------------------------------- reading the boards
-- The ranked leaderboard: highest rank first. me = this row is the signed-in player.
create or replace function public.cg_top(lim integer default 100)
returns table (place bigint, name text, rp integer, wins integer, level integer, color text, tag text, me boolean)
language sql stable security definer set search_path = '' as $$
  select row_number() over (order by p.rp desc, p.wins desc, p.created_at), p.name, p.rp, p.wins, p.level, p.color, p.tag,
         p.user_id is not distinct from (select auth.uid())
  from public.cg_profiles p
  where p.ranked_played > 0 and not p.banned
  order by p.rp desc, p.wins desc, p.created_at
  limit greatest(1, least(coalesce(lim, 100), 200))
$$;

-- The signed-in player's own place on the ranked board (null if they haven't played ranked).
create or replace function public.cg_my_place()
returns bigint
language sql stable security definer set search_path = '' as $$
  select 1 + (select count(*) from public.cg_profiles o
              where o.ranked_played > 0 and not o.banned and o.user_id <> me.user_id
                and (o.rp > me.rp or (o.rp = me.rp and (o.wins > me.wins or (o.wins = me.wins and o.created_at < me.created_at)))))
  from public.cg_profiles me
  where me.user_id = (select auth.uid()) and me.ranked_played > 0 and not me.banned
$$;

create or replace function public.cg_records_list()
returns table (map text, name text, ms integer, color text, tag text, at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.map, r.name, r.ms, r.color, r.tag, r.at
  from public.cg_records r join public.cg_profiles p on p.user_id = r.user_id
  where not p.banned
$$;

-- Used by cg-api only: replaces a map's record if this time is faster (atomic, so two at once can't both win).
create or replace function public.cg_set_record(p_map text, p_user uuid, p_name text, p_ms integer, p_color text, p_tag text)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare done integer;
begin
  insert into public.cg_records as r (map, user_id, name, ms, color, tag, at)
  values (p_map, p_user, p_name, p_ms, p_color, p_tag, now())
  on conflict (map) do update set user_id = excluded.user_id, name = excluded.name, ms = excluded.ms, color = excluded.color, tag = excluded.tag, at = now()
    where r.ms > excluded.ms;
  get diagnostics done = row_count;
  return done > 0;
end $$;

-- ---------------------------------------------------------------- the public room list (quick play)
-- A host announces its room every couple of seconds while the lobby is open; quick play lists the fresh ones.
create or replace function public.cg_room_announce(p_code text, p_v text, p_kind text, p_n integer, p_left integer, p_rp integer, p_since bigint)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_code !~ '^[A-Z0-9]{5}$' or char_length(coalesce(p_v, '')) not between 1 and 40 or coalesce(p_kind, '') not in ('', 'duel', 'ranked') then
    raise exception 'bad room' using errcode = '22023';
  end if;
  insert into public.cg_rooms as r (code, v, kind, n, left_s, rp, since, updated_at)
  values (p_code, p_v, coalesce(p_kind, ''), greatest(0, least(coalesce(p_n, 1), 60)), greatest(0, least(coalesce(p_left, 0), 600)),
          greatest(0, least(coalesce(p_rp, 0), 99999)), greatest(0, coalesce(p_since, 0)), now())
  on conflict (code) do update set v = excluded.v, kind = excluded.kind, n = excluded.n, left_s = excluded.left_s, rp = excluded.rp, since = excluded.since, updated_at = now();
  if random() < 0.05 then delete from public.cg_rooms where updated_at < now() - interval '1 minute'; end if;
end $$;

create or replace function public.cg_room_list(p_v text)
returns table (code text, kind text, n integer, left_s integer, rp integer, since bigint, age_ms integer)
language sql stable security definer set search_path = '' as $$
  select r.code, r.kind, r.n, r.left_s, r.rp, r.since, (extract(epoch from now() - r.updated_at) * 1000)::integer
  from public.cg_rooms r
  where r.v = p_v and r.updated_at > now() - interval '8 seconds'
  order by r.updated_at desc
  limit 200
$$;

-- ---------------------------------------------------------------- live player counts
-- Every open copy of the game checks in every 20 s with a random id and what it's doing ('bye' when it
-- closes) and gets back how many real people are doing each thing right now.
create or replace function public.cg_live(p_id text, p_mode text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare out jsonb;
begin
  if char_length(coalesce(p_id, '')) not between 4 and 24 then raise exception 'bad id' using errcode = '22023'; end if;
  if p_mode = 'bye' then
    delete from public.cg_live where id = p_id;
  else
    insert into public.cg_live as l (id, mode, at)
    values (p_id, case when p_mode in ('online', 'duel', 'ranked') then p_mode else 'menu' end, now())
    on conflict (id) do update set mode = excluded.mode, at = now();
  end if;
  if random() < 0.05 then delete from public.cg_live where at < now() - interval '2 minutes'; end if;
  select jsonb_build_object(
    'total', count(*),
    'menu', count(*) filter (where mode = 'menu'),
    'online', count(*) filter (where mode = 'online'),
    'duel', count(*) filter (where mode = 'duel'),
    'ranked', count(*) filter (where mode = 'ranked'))
  into out from public.cg_live where at > now() - interval '50 seconds';
  return out;
end $$;

-- ---------------------------------------------------------------- who may call what
revoke all on function public.cg_top(integer), public.cg_my_place(), public.cg_records_list(),
  public.cg_set_record(text, uuid, text, integer, text, text),
  public.cg_room_announce(text, text, text, integer, integer, integer, bigint), public.cg_room_list(text),
  public.cg_live(text, text) from public, anon, authenticated;
grant execute on function public.cg_top(integer), public.cg_records_list(),
  public.cg_room_announce(text, text, text, integer, integer, integer, bigint), public.cg_room_list(text),
  public.cg_live(text, text) to anon, authenticated;
grant execute on function public.cg_my_place() to authenticated;
grant execute on function public.cg_set_record(text, uuid, text, integer, text, text) to service_role;
