-- Pet Rock Simulator — accounts, cross-device saves and the shared board.
--
-- Paste this whole file into the Supabase SQL editor and run it. It is
-- safe to run more than once.
--
-- Design notes
-- ------------
-- Players sign in with a username and password, so a save follows them
-- between devices. Passwords are stored only as bcrypt hashes (pgcrypto),
-- never in the clear, and are never readable by any client.
--
-- The anon key in the app is public by design, so the tables are locked
-- down instead of the key:
--   * RLS is on everywhere and only ever permits SELECT.
--   * Column grants expose only what the leaderboard shows. Password
--     hashes and session tokens carry no grants at all, so they cannot be
--     selected even by a client that asks for them.
--   * Every write goes through a SECURITY DEFINER function that checks a
--     password or a session token and clamps what it is given.

create extension if not exists pgcrypto;

-- Older installs keyed the board by device. Keep that data rather than
-- dropping it; players re-attach their progress when they register.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pets' and column_name = 'device_id'
  ) then
    execute 'drop policy if exists "leaderboard is public" on public.pets';
    execute 'alter table public.pets rename to pets_legacy';
  end if;
end $$;

-- ------------------------------------------------------------- accounts

create table if not exists public.accounts (
  id             uuid        primary key default gen_random_uuid(),
  username       text        not null,
  username_lower text        not null unique,
  password_hash  text        not null,
  failed_logins  integer     not null default 0,
  locked_until   timestamptz,
  created_at     timestamptz not null default now(),
  last_seen_at   timestamptz not null default now()
);

create table if not exists public.sessions (
  token_hash text        primary key,
  account_id uuid        not null references public.accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists sessions_account_idx on public.sessions (account_id);

create table if not exists public.pets (
  account_id   uuid        primary key references public.accounts(id) on delete cascade,
  rock_name    text        not null default 'Pebbles',
  level        integer     not null default 1 check (level between 1 and 999),
  xp           integer     not null default 0 check (xp >= 0),
  best_level   integer     not null default 1 check (best_level between 1 and 999),
  care         smallint    not null default 0 check (care between 0 and 100),
  equipped     jsonb       not null default '{}'::jsonb,
  badges       smallint    not null default 0 check (badges >= 0),
  save         jsonb       not null default '{}'::jsonb,
  client_clock bigint      not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists pets_rank_idx on public.pets (level desc, xp desc);

-- ---------------------------------------------------------- read access

alter table public.accounts enable row level security;
alter table public.sessions enable row level security;
alter table public.pets     enable row level security;

drop policy if exists "accounts are listable" on public.accounts;
create policy "accounts are listable" on public.accounts
  for select to anon, authenticated using (true);

drop policy if exists "leaderboard is public" on public.pets;
create policy "leaderboard is public" on public.pets
  for select to anon, authenticated using (true);

-- sessions has RLS on and no policy at all: invisible to every client.
revoke all on public.accounts from anon, authenticated;
revoke all on public.sessions from anon, authenticated;
revoke all on public.pets     from anon, authenticated;

-- Only these columns are readable. password_hash, lockout state and the
-- full save blob are deliberately absent, so `select=*` is refused and
-- clients must name the columns they want.
grant select (id, username, created_at) on public.accounts to anon, authenticated;
grant select (account_id, rock_name, level, xp, best_level, care, equipped, badges, updated_at)
  on public.pets to anon, authenticated;

-- --------------------------------------------------------------- helpers

create or replace function public.norm_username(p_username text)
returns text language sql immutable as $$
  select lower(btrim(coalesce(p_username, '')));
$$;

/** Pulls the leaderboard columns out of a client save, clamped. */
create or replace function public.apply_save(p_account uuid, p_state jsonb, p_clock bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_level integer;
begin
  v_level := least(greatest(coalesce((p_state->>'level')::integer, 1), 1), 999);

  update public.pets set
    rock_name    = coalesce(nullif(btrim(left(coalesce(p_state->>'rockName', ''), 18)), ''), 'Pebbles'),
    level        = v_level,
    xp           = least(greatest(coalesce((p_state->>'xp')::integer, 0), 0), 1000000),
    best_level   = greatest(best_level, least(greatest(coalesce((p_state->>'bestLevel')::integer, v_level), v_level), 999)),
    care         = least(greatest(coalesce((p_state->>'care')::integer, 0), 0), 100),
    equipped     = coalesce(p_state->'equipped', '{}'::jsonb),
    badges       = least(greatest(coalesce(jsonb_array_length(p_state->'unlocked'), 0), 0), 999),
    save         = p_state,
    client_clock = greatest(client_clock, coalesce(p_clock, 0)),
    updated_at   = now()
  where account_id = p_account;
end;
$$;

/** Mints a session and returns the raw token (stored only as a hash). */
create or replace function public.new_session(p_account uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_token text := encode(gen_random_bytes(32), 'hex');
  v_expires timestamptz := now() + interval '180 days';
begin
  delete from public.sessions where expires_at < now();
  insert into public.sessions (token_hash, account_id, expires_at)
  values (encode(digest(v_token, 'sha256'), 'hex'), p_account, v_expires);
  return jsonb_build_object('token', v_token, 'expires_at', v_expires);
end;
$$;

/** Resolves a session token to its account, or null. */
create or replace function public.session_account(p_token text)
returns uuid language sql security definer set search_path = public as $$
  select account_id from public.sessions
  where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and expires_at > now();
$$;

/** The shape returned to a signed-in client. */
create or replace function public.account_payload(p_account uuid, p_session jsonb)
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'account_id', a.id,
    'username', a.username,
    'token', p_session->>'token',
    'expires_at', p_session->>'expires_at',
    'save', p.save,
    'client_clock', p.client_clock,
    'rock_name', p.rock_name,
    'updated_at', p.updated_at
  )
  from public.accounts a join public.pets p on p.account_id = a.id
  where a.id = p_account;
$$;

-- --------------------------------------------------------------- sign up

create or replace function public.register(
  p_username text,
  p_password text,
  p_rock     text default 'Pebbles',
  p_state    jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_name  text := btrim(coalesce(p_username, ''));
  v_lower text := norm_username(v_name);
  v_id    uuid;
begin
  if length(v_name) < 3 or length(v_name) > 18 then
    raise exception 'Username must be 3 to 18 characters' using errcode = '22023';
  end if;
  if v_name !~ '^[A-Za-z0-9 _.-]+$' then
    raise exception 'Username can use letters, numbers, spaces, dot, dash and underscore' using errcode = '22023';
  end if;
  if length(coalesce(p_password, '')) < 8 then
    raise exception 'Password must be at least 8 characters' using errcode = '22023';
  end if;
  if exists (select 1 from public.accounts where username_lower = v_lower) then
    raise exception 'That username is taken' using errcode = '23505';
  end if;

  insert into public.accounts (username, username_lower, password_hash)
  values (v_name, v_lower, crypt(p_password, gen_salt('bf', 10)))
  returning id into v_id;

  insert into public.pets (account_id, rock_name)
  values (v_id, coalesce(nullif(btrim(left(coalesce(p_rock, ''), 18)), ''), 'Pebbles'));

  -- Carry over whatever the player had on this device before registering.
  if p_state ? 'level' then
    perform apply_save(v_id, p_state, coalesce((p_state->>'lastTick')::bigint, 0));
    update public.pets
       set rock_name = coalesce(nullif(btrim(left(coalesce(p_rock, ''), 18)), ''), rock_name)
     where account_id = v_id;
  end if;

  return account_payload(v_id, new_session(v_id));
end;
$$;

-- --------------------------------------------------------------- sign in

create or replace function public.login(p_username text, p_password text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_lower text := norm_username(p_username);
  a       public.accounts%rowtype;
begin
  select * into a from public.accounts where username_lower = v_lower;

  if a.id is null then
    -- Same message either way, so the form cannot be used to discover
    -- which usernames exist.
    raise exception 'Wrong username or password' using errcode = '28P01';
  end if;

  if a.locked_until is not null and a.locked_until > now() then
    raise exception 'Too many attempts. Try again in a few minutes' using errcode = '28P01';
  end if;

  if a.password_hash <> crypt(coalesce(p_password, ''), a.password_hash) then
    update public.accounts set
      failed_logins = failed_logins + 1,
      locked_until = case when failed_logins + 1 >= 5 then now() + interval '15 minutes' end
    where id = a.id;
    raise exception 'Wrong username or password' using errcode = '28P01';
  end if;

  update public.accounts
     set failed_logins = 0, locked_until = null, last_seen_at = now()
   where id = a.id;

  return account_payload(a.id, new_session(a.id));
end;
$$;

-- ---------------------------------------------------------------- session

create or replace function public.resume(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_account uuid := session_account(p_token);
begin
  if v_account is null then
    raise exception 'Session expired' using errcode = '28000';
  end if;
  update public.accounts set last_seen_at = now() where id = v_account;
  return account_payload(v_account, jsonb_build_object('token', p_token));
end;
$$;

create or replace function public.sign_out(p_token text)
returns void language sql security definer set search_path = public as $$
  delete from public.sessions
  where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

/**
 * Saves progress. The newer client clock wins, so two devices on one
 * account converge instead of clobbering each other; the caller always
 * gets the authoritative row back.
 */
create or replace function public.sync_pet(p_token text, p_state jsonb, p_clock bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_account uuid := session_account(p_token);
  v_stored  bigint;
begin
  if v_account is null then
    raise exception 'Session expired' using errcode = '28000';
  end if;

  select client_clock into v_stored from public.pets where account_id = v_account;
  if coalesce(p_clock, 0) >= coalesce(v_stored, 0) then
    perform apply_save(v_account, p_state, p_clock);
  end if;

  update public.accounts set last_seen_at = now() where id = v_account;
  return account_payload(v_account, jsonb_build_object('token', p_token));
end;
$$;

-- ----------------------------------------------------------------- grants

revoke all on function public.apply_save(uuid, jsonb, bigint)   from public;
revoke all on function public.new_session(uuid)                 from public;
revoke all on function public.session_account(text)             from public;
revoke all on function public.account_payload(uuid, jsonb)      from public;
revoke all on function public.register(text, text, text, jsonb) from public;
revoke all on function public.login(text, text)                 from public;
revoke all on function public.resume(text)                      from public;
revoke all on function public.sign_out(text)                    from public;
revoke all on function public.sync_pet(text, jsonb, bigint)     from public;

grant execute on function public.register(text, text, text, jsonb) to anon, authenticated;
grant execute on function public.login(text, text)                 to anon, authenticated;
grant execute on function public.resume(text)                      to anon, authenticated;
grant execute on function public.sign_out(text)                    to anon, authenticated;
grant execute on function public.sync_pet(text, jsonb, bigint)     to anon, authenticated;
