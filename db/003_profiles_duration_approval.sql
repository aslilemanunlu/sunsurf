-- Customer profiles, multi-hour bookings, and the pending/approved/rejected flow.
--
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- Profiles
--
-- Neon's sign-up form collects name, email and password. Phone and interests
-- are ours, so they live here rather than in the managed neon_auth schema.
-- ---------------------------------------------------------------------------

create table if not exists profiles (
  user_id    text primary key default auth.user_id(),
  full_name  text not null,
  phone      text not null,
  interests  text[] not null default '{}'
               check (interests <@ array['rental', 'wingfoil', 'windsurf']),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- security definer so an RLS policy can ask "does this caller have a profile?"
-- without needing read access to the profiles table itself
create or replace function has_profile() returns boolean
  language sql stable security definer set search_path = public, pg_temp
as $fn$
  select exists (select 1 from profiles where user_id = auth.user_id())
$fn$;

-- ---------------------------------------------------------------------------
-- Bookings: duration and approval status
-- ---------------------------------------------------------------------------

alter table bookings add column if not exists duration_hours int not null default 1;
alter table bookings add column if not exists decided_by text;
alter table bookings add column if not exists decided_at timestamptz;

do $mig$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'bookings' and column_name = 'status')
  then
    alter table bookings add column status text not null default 'pending';
    -- rows made before this flow existed were effectively already confirmed
    update bookings set status = 'approved';
  end if;
end
$mig$;

do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'bookings_duration_chk') then
    alter table bookings add constraint bookings_duration_chk
      check (duration_hours between 1 and 3);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bookings_status_chk') then
    alter table bookings add constraint bookings_status_chk
      check (status in ('pending', 'approved', 'rejected'));
  end if;
end
$c$;

-- The hours a booking occupies, as a range Postgres can compare.
--
-- Not a generated column: `timestamptz + interval` is STABLE rather than
-- IMMUTABLE (it depends on the session timezone), and generated expressions
-- must be immutable. A trigger keeps it in step instead.
alter table bookings add column if not exists span tstzrange;

create or replace function bookings_set_span() returns trigger
  language plpgsql
as $fn$
begin
  new.span := tstzrange(
    new.starts_at,
    new.starts_at + make_interval(hours => new.duration_hours),
    '[)'
  );
  return new;
end
$fn$;

drop trigger if exists bookings_set_span on bookings;
create trigger bookings_set_span
  before insert or update on bookings
  for each row execute function bookings_set_span();

update bookings
   set span = tstzrange(starts_at, starts_at + make_interval(hours => duration_hours), '[)')
 where span is null;

alter table bookings alter column span set not null;

-- ---------------------------------------------------------------------------
-- The lock
--
-- One constraint carries three of the requirements: multi-hour blocks cannot
-- overlap, a *pending* booking already blocks the hours (only 'rejected' is
-- excluded), and rejecting one frees them again. The application never decides
-- this; the database refuses the overlap.
-- ---------------------------------------------------------------------------

create extension if not exists btree_gist;

alter table bookings drop constraint if exists bookings_instructor_hour_key;

do $x$
begin
  if not exists (select 1 from pg_constraint where conname = 'bookings_no_overlap') then
    alter table bookings add constraint bookings_no_overlap
      exclude using gist (instructor_id with =, span with &&)
      where (status <> 'rejected');
  end if;
end
$x$;

-- ---------------------------------------------------------------------------
-- Only the decision may be changed by someone who is not the customer.
--
-- RLS can say "you may update this row" but not "you may update only this
-- column". Without this, an instructor could use their approval rights to move
-- a booking to another time or another person.
-- ---------------------------------------------------------------------------

drop function if exists current_user_id();

-- The `authenticated` role has no USAGE on the auth schema, so a trigger running
-- as the invoker cannot call auth.user_id() directly — it fails with "permission
-- denied for schema auth". This definer-owned wrapper can, and the JWT it reads
-- is session state, so it still identifies the real caller.
create or replace function jwt_user_id() returns text
  language sql stable security definer set search_path = auth, pg_temp
as $fn$
  select auth.user_id()
$fn$;

grant execute on function jwt_user_id() to anonymous, authenticated;

-- Deliberately NOT security definer: the guard needs current_user to still say
-- which role is really making the request.
create or replace function bookings_decision_guard() returns trigger
  language plpgsql
as $fn$
declare
  uid text;
begin
  -- Trust is decided by the Postgres role, not by whether a JWT can be read.
  -- Migrations and psql connect as the owner; requests through the Data API
  -- arrive as anonymous or authenticated and must identify themselves.
  --
  -- An earlier version wrapped auth.user_id() in an exception handler that
  -- returned null, and treated null as "trusted". That made the guard inert for
  -- every API caller — an instructor could approve a booking and move it at the
  -- same time. Anything unidentified is now refused instead.
  if current_user not in ('anonymous', 'authenticated') then
    return new;
  end if;

  uid := jwt_user_id();

  if uid is null then
    raise exception 'cannot identify the caller';
  end if;

  if new.status is distinct from old.status then
    new.decided_by := uid;
    new.decided_at := now();
  end if;

  if uid = old.user_id then
    return new; -- customers may edit their own booking
  end if;

  if new.instructor_id is distinct from old.instructor_id
     or new.starts_at is distinct from old.starts_at
     or new.duration_hours is distinct from old.duration_hours
     or new.sport is distinct from old.sport
     or new.user_id is distinct from old.user_id
  then
    raise exception 'only the booking status may be changed';
  end if;

  return new;
end
$fn$;

drop trigger if exists bookings_decision_guard on bookings;
create trigger bookings_decision_guard
  before update on bookings
  for each row execute function bookings_decision_guard();

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------

-- Every hour a live booking occupies, with its status but never its owner.
drop view if exists busy_hours;
create view busy_hours with (security_invoker = false) as
  select b.instructor_id,
         g.hour as starts_at,
         b.status
    from bookings b
    cross join lateral generate_series(
      b.starts_at,
      b.starts_at + make_interval(hours => b.duration_hours - 1),
      interval '1 hour'
    ) as g(hour)
   where b.status <> 'rejected';

-- Full detail for whoever is allowed to act on it: the instructor whose
-- calendar it is, or an admin. The WHERE clause is the access rule; the front
-- end does no filtering of its own.
drop view if exists instructor_bookings;
drop view if exists managed_bookings;
create view managed_bookings with (security_invoker = false) as
  select b.id,
         b.instructor_id,
         i.name  as instructor_name,
         b.starts_at,
         b.duration_hours,
         b.sport,
         b.status,
         b.created_at,
         b.decided_at,
         u.name  as customer_name,
         u.email as customer_email,
         p.full_name as customer_full_name,
         p.phone     as customer_phone,
         p.interests as customer_interests
    from bookings b
    join instructors i on i.id = b.instructor_id
    left join neon_auth."user" u on u.id::text = b.user_id
    left join profiles p on p.user_id = b.user_id
   where b.instructor_id = my_instructor_id() or app_role() = 'admin';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on profiles from anonymous, authenticated;
revoke all on busy_hours, managed_bookings from anonymous, authenticated;

grant select on busy_hours to anonymous, authenticated;
grant select on managed_bookings to authenticated;
grant select, insert, update on profiles to authenticated;
grant select, insert, update, delete on bookings to authenticated;

grant execute on function has_profile() to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table profiles enable row level security;

drop policy if exists read_own_profile on profiles;
create policy read_own_profile on profiles
  for select to authenticated
  using (user_id = auth.user_id() or app_role() = 'admin');

drop policy if exists insert_own_profile on profiles;
create policy insert_own_profile on profiles
  for insert to authenticated
  with check (user_id = auth.user_id());

drop policy if exists update_own_profile on profiles;
create policy update_own_profile on profiles
  for update to authenticated
  using (user_id = auth.user_id())
  with check (user_id = auth.user_id());

-- bookings: the single ALL policy is replaced by one per action
drop policy if exists own_bookings on bookings;

drop policy if exists read_bookings on bookings;
create policy read_bookings on bookings
  for select to authenticated
  using (
    auth.user_id() = user_id
    or app_role() = 'admin'
    or instructor_id = my_instructor_id()
  );

-- no profile, no booking — the phone number requirement lives here too
drop policy if exists insert_own_booking on bookings;
create policy insert_own_booking on bookings
  for insert to authenticated
  with check (auth.user_id() = user_id and has_profile());

drop policy if exists decide_bookings on bookings;
create policy decide_bookings on bookings
  for update to authenticated
  using (
    app_role() = 'admin'
    or instructor_id = my_instructor_id()
    or auth.user_id() = user_id
  )
  with check (
    app_role() = 'admin'
    or instructor_id = my_instructor_id()
    or auth.user_id() = user_id
  );

drop policy if exists delete_own_booking on bookings;
create policy delete_own_booking on bookings
  for delete to authenticated
  using (auth.user_id() = user_id or app_role() = 'admin');
