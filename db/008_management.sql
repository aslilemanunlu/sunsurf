-- From a booking page to something the business is run from.
--
-- Three things arrive here:
--
--   1. A switch that closes customer booking without hiding the schedule.
--   2. Customer segments — the office's own classification of a customer,
--      kept apart from what the customer said about themselves at sign-up.
--   3. Notes on a customer, which only staff may ever read.
--
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Is customer booking open?
--
-- One row, one switch. The calendar stays readable when it is off — closing
-- booking is not the same as closing the business, and a customer who can see
-- next week's schedule is a customer who comes back when it reopens.
-- ---------------------------------------------------------------------------

create table if not exists app_settings (
  -- `id` exists only to make a second row impossible
  id                    boolean primary key default true check (id),
  customer_booking_open boolean not null default true,
  updated_at            timestamptz not null default now(),
  updated_by            text
);

insert into app_settings (id) values (true) on conflict (id) do nothing;

alter table app_settings enable row level security;

drop policy if exists read_settings on app_settings;
create policy read_settings on app_settings
  for select to anonymous, authenticated
  using (true);

drop policy if exists update_settings on app_settings;
create policy update_settings on app_settings
  for update to authenticated
  using (app_role() = 'admin')
  with check (app_role() = 'admin');

-- security definer so a policy on `bookings` can ask the question without the
-- caller needing to be able to read the settings row for themselves.
create or replace function booking_open() returns boolean
  language sql stable security definer set search_path = public, pg_temp
as $fn$
  select coalesce((select customer_booking_open from app_settings where id), true)
$fn$;

create or replace function settings_touch() returns trigger
  language plpgsql
as $fn$
begin
  new.updated_at := now();
  if current_user in ('anonymous', 'authenticated') then
    new.updated_by := jwt_user_id();
  end if;
  return new;
end
$fn$;

drop trigger if exists settings_touch on app_settings;
create trigger settings_touch before update on app_settings
  for each row execute function settings_touch();

-- The switch only closes the *customer's own* path. Staff keep writing lessons:
-- the phone still rings when online booking is off.
drop policy if exists insert_booking on bookings;
create policy insert_booking on bookings
  for insert to authenticated
  with check (
    -- a customer, for themselves, with a phone number on file, while open
    (auth.user_id() = user_id and has_profile() and booking_open())
    -- an admin, for anyone
    or app_role() = 'admin'
    -- an instructor, but only onto their own calendar
    or instructor_id = my_instructor_id()
  );

-- ---------------------------------------------------------------------------
-- 2. Customer segments
--
-- `interests` stays exactly what it was: the customer's own answer at sign-up.
-- `segments` is the office's classification of them. They use overlapping words
-- on purpose — the useful question is where the two disagree.
-- ---------------------------------------------------------------------------

alter table profiles add column if not exists segments text[] not null default '{}';

do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_segments_chk') then
    alter table profiles add constraint profiles_segments_chk
      check (segments <@ array['lesson', 'storage', 'rental', 'kids_camp']);
  end if;
end
$c$;

-- A customer may edit their own name, phone and interests. Segments are not
-- theirs to set, and the policy that lets them update their row cannot express
-- "every column but this one", so a trigger says it instead.
create or replace function profiles_segments_guard() returns trigger
  language plpgsql
as $fn$
begin
  if current_user not in ('anonymous', 'authenticated') then
    return new; -- migrations and psql
  end if;
  if new.segments is distinct from old.segments and app_role() <> 'admin' then
    raise exception 'only an admin may change customer segments';
  end if;
  return new;
end
$fn$;

drop trigger if exists profiles_segments_guard on profiles;
create trigger profiles_segments_guard before update on profiles
  for each row execute function profiles_segments_guard();

-- An admin works the customer list directly, so they read and write the table
-- rather than going through a view.
drop policy if exists read_profiles_admin on profiles;
create policy read_profiles_admin on profiles
  for select to authenticated
  using (app_role() = 'admin');

drop policy if exists update_profiles_admin on profiles;
create policy update_profiles_admin on profiles
  for update to authenticated
  using (app_role() = 'admin')
  with check (app_role() = 'admin');

-- ---------------------------------------------------------------------------
-- 3. Notes on a customer
--
-- Deliberately not a column on `profiles`: a customer can read their own
-- profile row, and "she is always late" is not something to hand back to her.
-- ---------------------------------------------------------------------------

create table if not exists customer_notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null,
  body       text not null check (length(btrim(body)) > 0),
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists customer_notes_user_idx on customer_notes (user_id, created_at desc);

alter table customer_notes enable row level security;

drop policy if exists read_notes on customer_notes;
create policy read_notes on customer_notes
  for select to authenticated
  using (app_role() = 'admin');

drop policy if exists write_notes on customer_notes;
create policy write_notes on customer_notes
  for insert to authenticated
  with check (app_role() = 'admin');

drop policy if exists delete_notes on customer_notes;
create policy delete_notes on customer_notes
  for delete to authenticated
  using (app_role() = 'admin');

create or replace function notes_set_author() returns trigger
  language plpgsql
as $fn$
begin
  if current_user in ('anonymous', 'authenticated') then
    new.created_by := jwt_user_id();
  end if;
  return new;
end
$fn$;

drop trigger if exists notes_set_author on customer_notes;
create trigger notes_set_author before insert on customer_notes
  for each row execute function notes_set_author();

-- ---------------------------------------------------------------------------
-- Views for the management screens
-- ---------------------------------------------------------------------------

-- Every customer with what the business knows about them. Empty for non-admins.
drop view if exists crm_customers;
create view crm_customers with (security_invoker = false) as
  select u.id::text                         as user_id,
         u.email,
         coalesce(p.full_name, u.name)      as name,
         p.phone,
         coalesce(p.interests, '{}')        as interests,
         coalesce(p.segments, '{}')         as segments,
         coalesce(r.role, 'customer')       as role,
         r.instructor_id,
         u."createdAt"                      as created_at,
         coalesce(b.lessons, 0)             as lessons,
         coalesce(b.hours, 0)               as hours,
         coalesce(b.kids_camps, 0)          as kids_camps,
         b.last_lesson_at,
         (p.user_id is not null)            as has_profile,
         (select count(*) from customer_notes n where n.user_id = u.id::text) as notes
    from neon_auth."user" u
    left join user_roles r on r.user_id = u.id::text
    left join profiles   p on p.user_id = u.id::text
    left join lateral (
      select count(*)                                              as lessons,
             sum(duration_hours)                                   as hours,
             count(*) filter (where lesson_type = 'kids_camp')     as kids_camps,
             max(starts_at)                                        as last_lesson_at
        from bookings bk
       where bk.user_id = u.id::text
         and bk.status <> 'rejected'
    ) b on true
   where app_role() = 'admin';

-- The kids-camp roll: one row per camp booking, newest first. A customer shows
-- up here because they have actually been booked into a camp — the `kids_camp`
-- segment is a separate, manual answer and the two are shown side by side.
drop view if exists kids_camp_roll;
create view kids_camp_roll with (security_invoker = false) as
  select bk.id                              as booking_id,
         bk.user_id,
         coalesce(p.full_name, u.name)      as name,
         u.email,
         p.phone,
         bk.instructor_id,
         i.name                             as instructor_name,
         bk.starts_at,
         bk.duration_hours,
         bk.status,
         coalesce(p.segments, '{}')         as segments
    from bookings bk
    left join neon_auth."user" u on u.id::text = bk.user_id
    left join profiles   p on p.user_id = bk.user_id
    left join instructors i on i.id = bk.instructor_id
   where bk.lesson_type = 'kids_camp'
     and app_role() = 'admin';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on app_settings, customer_notes from anonymous, authenticated;
revoke all on crm_customers, kids_camp_roll from anonymous, authenticated;

grant select on app_settings to anonymous, authenticated;
grant update (customer_booking_open) on app_settings to authenticated;
grant select, insert, delete on customer_notes to authenticated;
grant select on crm_customers to authenticated;
grant select on kids_camp_roll to authenticated;

grant execute on function booking_open() to anonymous, authenticated;

-- Remember step 3b in the README: the Data API will not see app_settings,
-- customer_notes, crm_customers or kids_camp_roll until the schema cache is
-- refreshed in the Neon console.

-- ---------------------------------------------------------------------------
-- managed_bookings gains the customer's id
--
-- The customer drawer asks for one person's whole history, which needs
-- something to filter on. The id is opaque and staff already see that
-- customer's name and email on the same row, so it discloses nothing new.
--
-- Dropping the view drops its grants with it, so they are restated below.
-- ---------------------------------------------------------------------------

drop view if exists managed_bookings;
create view managed_bookings with (security_invoker = false) as
  select b.id,
         b.user_id,
         b.instructor_id,
         i.name  as instructor_name,
         b.starts_at,
         b.duration_hours,
         b.sport,
         b.lesson_type,
         b.group_size,
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

revoke all on managed_bookings from anonymous, authenticated;
grant select on managed_bookings to authenticated;
