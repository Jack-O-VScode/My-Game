-- Pet Rock Simulator — online leaderboard schema.
--
-- Paste this whole file into the Supabase SQL editor and run it once
-- (Dashboard -> SQL Editor -> New query -> Run). Re-running is safe.
--
-- Design notes
-- ------------
-- There are no accounts. Each device mints a random device_id plus a
-- private secret on first run and keeps them in localStorage. One row per
-- device gives you "one pet per device"; the secret is what stops anyone
-- else overwriting that row.
--
-- The anon key shipped in the app is public by design, so the table is
-- locked down rather than the key:
--   * RLS is on, and only SELECT is allowed, so nobody can write directly.
--   * Column grants exclude `secret`, so it is never readable by clients.
--   * All writes go through submit_pet(), a SECURITY DEFINER function that
--     checks the secret and clamps every value the client sends.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- table

create table if not exists public.pets (
  device_id  uuid        primary key,
  secret     uuid        not null,
  keeper     text        not null default 'Keeper',
  rock_name  text        not null default 'Pebbles',
  level      integer     not null default 1  check (level between 1 and 999),
  xp         integer     not null default 0  check (xp >= 0),
  best_level integer     not null default 1  check (best_level between 1 and 999),
  care       smallint    not null default 0  check (care between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The leaderboard is always read in this order.
create index if not exists pets_rank_idx on public.pets (level desc, xp desc);

-- ------------------------------------------------------------ row policy

alter table public.pets enable row level security;

drop policy if exists "leaderboard is public" on public.pets;
create policy "leaderboard is public"
  on public.pets for select
  to anon, authenticated
  using (true);

-- No insert/update/delete policy exists, so direct writes are refused for
-- everyone. Column grants below also keep `secret` unreadable — note this
-- means clients must ask for columns by name, never select=*.
revoke all on public.pets from anon, authenticated;
grant select (device_id, keeper, rock_name, level, xp, best_level, care, updated_at)
  on public.pets to anon, authenticated;

-- --------------------------------------------------------------- writes

create or replace function public.submit_pet(
  p_device uuid,
  p_secret uuid,
  p_keeper text,
  p_rock   text,
  p_level  integer,
  p_xp     integer,
  p_best   integer,
  p_care   integer
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret uuid;
begin
  if p_device is null or p_secret is null then
    raise exception 'device and secret are required' using errcode = '22023';
  end if;

  -- Never trust the client: trim names and clamp every number into range.
  p_keeper := coalesce(nullif(btrim(left(coalesce(p_keeper, ''), 18)), ''), 'Keeper');
  p_rock   := coalesce(nullif(btrim(left(coalesce(p_rock,   ''), 18)), ''), 'Pebbles');
  p_level  := least(greatest(coalesce(p_level, 1), 1), 999);
  p_xp     := least(greatest(coalesce(p_xp,    0), 0), 1000000);
  p_best   := least(greatest(coalesce(p_best, p_level), p_level), 999);
  p_care   := least(greatest(coalesce(p_care,  0), 0), 100);

  select secret into v_secret from public.pets where device_id = p_device;

  if v_secret is null then
    insert into public.pets (device_id, secret, keeper, rock_name, level, xp, best_level, care)
    values (p_device, p_secret, p_keeper, p_rock, p_level, p_xp, p_best, p_care);
  elsif v_secret = p_secret then
    update public.pets
       set keeper     = p_keeper,
           rock_name  = p_rock,
           level      = p_level,
           xp         = p_xp,
           best_level = greatest(best_level, p_best),
           care       = p_care,
           updated_at = now()
     where device_id = p_device;
  else
    -- Someone guessed a device_id but not its secret.
    raise exception 'device secret mismatch' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.submit_pet(uuid, uuid, text, text, integer, integer, integer, integer) from public;
grant execute on function public.submit_pet(uuid, uuid, text, text, integer, integer, integer, integer)
  to anon, authenticated;
