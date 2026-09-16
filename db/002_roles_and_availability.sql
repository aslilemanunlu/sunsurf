-- Roles, implicit availability, and instructor-managed blocked hours.
--
-- Supersedes the `slots` part of 001: availability is no longer stored. Every
-- instructor is available 08:00–20:00 every day, and an hour is unavailable only
-- when a booking exists for it or the instructor has closed it.
--
-- Safe to re-run. Running 001 afterwards recreates an empty `slots` table, which
-- re-running this file drops again.

-- ---------------------------------------------------------------------------
-- Roles
--
-- Deliberately NOT neon_auth."user".role: the Data API switches to a Postgres
-- role named by the JWT's `role` claim, so writing 'admin' there could try to
-- SET ROLE admin and lock the account out. App roles live here instead, and the
-- neon_auth schema is never touched.
--
-- No row means 'customer', so signing up needs no server-side hook.
-- ---------------------------------------------------------------------------

create table if not exists user_roles (
  user_id       text primary key,
  role          text not null default 'customer'
                  check (role in ('admin', 'instructor', 'customer')),
  instructor_id text references instructors (id) on delete set null,
  updated_at    timestamptz not null default now()
);

-- security definer so RLS policies can call them without recursing back into
-- the very table the policy is protecting
create or replace function app_role() returns text
  language sql stable security definer set search_path = public, pg_temp
as $fn$
  select coalesce((select role from user_roles where user_id = auth.user_id()), 'customer')
$fn$;

create or replace function my_instructor_id() returns text
  language sql stable security definer set search_path = public, pg_temp
as $fn$
  select instructor_id
    from user_roles
   where user_id = auth.user_id()
     and role in ('instructor', 'admin')
$fn$;

-- ---------------------------------------------------------------------------
-- Hours an instructor has closed. Closing is an insert, reopening is a delete.
-- ---------------------------------------------------------------------------

create table if not exists instructor_blocks (
  id            uuid primary key default gen_random_uuid(),
  instructor_id text not null references instructors (id) on delete cascade,
  starts_at     timestamptz not null,
  created_at    timestamptz not null default now(),
  unique (instructor_id, starts_at)
);

create index if not exists instructor_blocks_starts_at_idx on instructor_blocks (starts_at);

-- ---------------------------------------------------------------------------
-- Bookings move from a slot reference to (instructor, hour, sport)
-- ---------------------------------------------------------------------------

alter table bookings add column if not exists instructor_id text references instructors (id) on delete cascade;
alter table bookings add column if not exists starts_at timestamptz;
alter table bookings add column if not exists sport text;

do $mig$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'bookings' and column_name = 'slot_id')
     and exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'slots')
  then
    execute $q$
      update bookings b
         set instructor_id = s.instructor_id,
             starts_at     = date_trunc('hour', s.starts_at),
             sport         = s.sport
        from slots s
       where s.id = b.slot_id
         and b.instructor_id is null
    $q$;

    -- Only ever delete inside the one-time conversion, and only rows the
    -- backfill just failed to map. Left at file scope this runs on every
    -- migration, which is a standing hazard to real bookings.
    execute $q$
      delete from bookings
       where instructor_id is null or starts_at is null or sport is null
    $q$;
  end if;
end
$mig$;

alter table bookings alter column instructor_id set not null;
alter table bookings alter column starts_at set not null;
-- Only while nothing contradicts it: db/005 makes this column nullable, because
-- a kids camp has no sport, and re-running this file afterwards must not fail.
do $sport$
begin
  if not exists (select 1 from bookings where sport is null) then
    begin
      alter table bookings alter column sport set not null;
    exception when others then
      null; -- already relaxed by a later migration; nothing to do
    end;
  end if;
end
$sport$;
alter table bookings drop column if exists slot_id;

do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'bookings_sport_chk') then
    alter table bookings add constraint bookings_sport_chk check (sport in ('windsurf', 'wingfoil'));
  end if;
  -- one booking per instructor per hour: capacity is 1
  if not exists (select 1 from pg_constraint where conname = 'bookings_instructor_hour_key') then
    alter table bookings add constraint bookings_instructor_hour_key unique (instructor_id, starts_at);
  end if;
end
$c$;

create index if not exists bookings_starts_at_idx on bookings (starts_at);

drop table if exists slots;

-- ---------------------------------------------------------------------------
-- Views. All run with the owner's privileges, so they can read tables the
-- caller cannot, and each one filters to what the caller is allowed to see.
-- ---------------------------------------------------------------------------

-- Which hours are taken, without revealing who took them. Booking rows stay
-- private to their owner; this is the public occupancy signal the calendar needs.
drop view if exists busy_hours;
create view busy_hours with (security_invoker = false) as
  select instructor_id, starts_at from bookings;

-- An instructor's own bookings, with who is coming.
drop view if exists instructor_bookings;
create view instructor_bookings with (security_invoker = false) as
  select b.id,
         b.instructor_id,
         b.starts_at,
         b.sport,
         b.created_at,
         u.name  as customer_name,
         u.email as customer_email
    from bookings b
    left join neon_auth."user" u on u.id::text = b.user_id
   where b.instructor_id = my_instructor_id();

-- User directory for the admin panel. Returns nothing unless the caller is admin,
-- so no direct grant on neon_auth is needed.
drop view if exists admin_users;
create view admin_users with (security_invoker = false) as
  select u.id::text                   as user_id,
         u.email,
         u.name,
         coalesce(r.role, 'customer') as role,
         r.instructor_id,
         u."createdAt"                as created_at
    from neon_auth."user" u
    left join user_roles r on r.user_id = u.id::text
   where app_role() = 'admin';

-- ---------------------------------------------------------------------------
-- Grants — this file decides them, not a console checkbox
-- ---------------------------------------------------------------------------

grant usage on schema public to anonymous, authenticated;

revoke all on user_roles, instructor_blocks, bookings from anonymous, authenticated;
revoke all on busy_hours, instructor_bookings, admin_users from anonymous, authenticated;

grant select on instructors to anonymous, authenticated;

-- the schedule anyone may read
grant select on busy_hours       to anonymous, authenticated;
grant select on instructor_blocks to anonymous, authenticated;

-- signed-in actions
grant select, insert, delete on bookings to authenticated;
grant insert, delete on instructor_blocks to authenticated;
grant select on instructor_bookings to authenticated;
grant select on admin_users to authenticated;
grant select, insert, update, delete on user_roles to authenticated;

grant execute on function app_role() to anonymous, authenticated;
grant execute on function my_instructor_id() to anonymous, authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table user_roles        enable row level security;
alter table instructor_blocks enable row level security;
alter table bookings          enable row level security;

-- bookings: yours and only yours
drop policy if exists own_bookings on bookings;
create policy own_bookings on bookings
  for all to authenticated
  using (auth.user_id() = user_id)
  with check (auth.user_id() = user_id);

-- blocked hours are public to read, so customers see them as unavailable
drop policy if exists read_blocks on instructor_blocks;
create policy read_blocks on instructor_blocks
  for select to anonymous, authenticated
  using (true);

-- and writable only for your own instructor. my_instructor_id() comes from the
-- JWT, so a client cannot claim to be someone else.
drop policy if exists write_own_blocks on instructor_blocks;
create policy write_own_blocks on instructor_blocks
  for insert to authenticated
  with check (instructor_id = my_instructor_id());

drop policy if exists delete_own_blocks on instructor_blocks;
create policy delete_own_blocks on instructor_blocks
  for delete to authenticated
  using (instructor_id = my_instructor_id());

-- roles: you can see your own, admins can see and change everyone's
drop policy if exists read_own_role on user_roles;
create policy read_own_role on user_roles
  for select to authenticated
  using (user_id = auth.user_id() or app_role() = 'admin');

drop policy if exists admin_manages_roles on user_roles;
create policy admin_manages_roles on user_roles
  for all to authenticated
  using (app_role() = 'admin')
  with check (app_role() = 'admin');

-- ---------------------------------------------------------------------------
-- The first admin
-- ---------------------------------------------------------------------------

insert into user_roles (user_id, role)
select u.id::text, 'admin' from neon_auth."user" u where u.email = 'asliunlu08@gmail.com'
on conflict (user_id) do update set role = 'admin', updated_at = now();
