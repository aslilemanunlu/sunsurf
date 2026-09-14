-- Windfoil schema: instructors, slots, bookings.
--
-- Run this once in the Neon SQL Editor, AFTER enabling Neon Auth and the Data API
-- (both create the roles and the auth.user_id() function this script depends on).
-- Safe to re-run.

create table if not exists instructors (
  id     text primary key,
  name   text not null,
  sports text[] not null,
  bio    text not null
);

create table if not exists slots (
  id            text primary key,          -- deterministic: slot-YYYY-MM-DD-HH
  instructor_id text not null references instructors (id) on delete cascade,
  sport         text not null check (sport in ('windsurf', 'wingfoil')),
  starts_at     timestamptz not null,
  duration_min  int not null check (duration_min > 0)
);

create index if not exists slots_starts_at_idx on slots (starts_at);

create table if not exists bookings (
  id         uuid primary key default gen_random_uuid(),
  slot_id    text not null references slots (id) on delete cascade,
  -- filled in from the JWT, so a client can never book on someone else's behalf
  user_id    text not null default auth.user_id(),
  created_at timestamptz not null default now(),
  unique (slot_id, user_id)
);

create index if not exists bookings_user_id_idx on bookings (user_id);

-- ---------------------------------------------------------------------------
-- Data API access
--
-- `anonymous` is the role for requests with no Authorization header;
-- `authenticated` is the role for requests carrying a valid Neon Auth JWT.
-- ---------------------------------------------------------------------------

grant usage on schema public to anonymous, authenticated;

-- Start from nothing. Enabling the Data API with "grant public schema access"
-- sets ALTER DEFAULT PRIVILEGES so that new tables hand `authenticated` full
-- CRUD; without this revoke, every signed-in user would hold INSERT/UPDATE/
-- DELETE on the schedule and only the absence of a policy would stop them.
-- This file, not a console checkbox, decides what the roles can do.
revoke all on instructors, slots, bookings from anonymous, authenticated;

-- the schedule is public to read and writable by nobody through the API
grant select on instructors, slots to anonymous, authenticated;

-- bookings: a signed-in user may list, make and cancel, but never edit
grant select, insert, delete on bookings to authenticated;

alter table instructors enable row level security;
alter table slots       enable row level security;
alter table bookings    enable row level security;

drop policy if exists read_instructors on instructors;
create policy read_instructors on instructors
  for select to anonymous, authenticated
  using (true);

drop policy if exists read_slots on slots;
create policy read_slots on slots
  for select to anonymous, authenticated
  using (true);

-- you can see, make and cancel only your own bookings
drop policy if exists own_bookings on bookings;
create policy own_bookings on bookings
  for all to authenticated
  using (auth.user_id() = user_id)
  with check (auth.user_id() = user_id);
