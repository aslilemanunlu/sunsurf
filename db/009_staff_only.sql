-- Booking closes to the outside; the customer becomes a record, not an account.
--
-- Until now a customer was an auth user who signed up, completed a profile and
-- sent a request. From here only staff sign in. Anyone else sees the schedule
-- and nothing else. A customer is a row somebody at the school typed in, with
-- no password, no login and no way to reach the system themselves.
--
-- What that changes:
--
--   * `customers` replaces `profiles`. It is keyed by its own id rather than an
--     auth user id, because there is no longer an account to key it to.
--   * `bookings.customer_id` replaces `bookings.user_id`.
--   * The approval queue loses its source. `status` stays, because a booking
--     taken over the phone is often still tentative, but nothing starts as
--     pending unless staff say so.
--
-- Two things are deliberately left in place rather than dropped:
--
--   * `bookings.user_id` — nullable and unused. Dropping the column would make
--     every earlier migration fail the next time they are re-run, since 003,
--     005 and 008 all write policies that mention it.
--   * `app_settings` and `booking_open()` — inert for the same reason: 008's
--     insert policy calls the function, and these files are run in order from
--     the top every time. The switch is gone from the interface.
--
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Customers
-- ---------------------------------------------------------------------------

create table if not exists customers (
  id         uuid primary key default gen_random_uuid(),
  full_name  text not null check (length(btrim(full_name)) > 0),
  phone      text,
  email      text,
  segments   text[] not null default '{}'
               check (segments <@ array['lesson', 'storage', 'rental', 'kids_camp']),
  created_at timestamptz not null default now(),
  created_by text
);

create index if not exists customers_name_idx on customers (lower(full_name));

alter table customers enable row level security;

-- Staff read the whole list: an instructor needs to find the person they are
-- booking. Only an admin edits or removes one.
drop policy if exists read_customers on customers;
create policy read_customers on customers
  for select to authenticated
  using (app_role() = 'admin' or my_instructor_id() is not null);

drop policy if exists insert_customers on customers;
create policy insert_customers on customers
  for insert to authenticated
  with check (app_role() = 'admin' or my_instructor_id() is not null);

drop policy if exists update_customers on customers;
create policy update_customers on customers
  for update to authenticated
  using (app_role() = 'admin')
  with check (app_role() = 'admin');

drop policy if exists delete_customers on customers;
create policy delete_customers on customers
  for delete to authenticated
  using (app_role() = 'admin');

create or replace function customers_set_author() returns trigger
  language plpgsql
as $fn$
begin
  if current_user in ('anonymous', 'authenticated') then
    new.created_by := jwt_user_id();
  end if;
  return new;
end
$fn$;

drop trigger if exists customers_set_author on customers;
create trigger customers_set_author before insert on customers
  for each row execute function customers_set_author();

-- ---------------------------------------------------------------------------
-- 2. Bookings point at a customer record
-- ---------------------------------------------------------------------------

alter table bookings add column if not exists customer_id uuid references customers (id);
create index if not exists bookings_customer_idx on bookings (customer_id);

-- `user_id` is legacy. It cannot be dropped (see the header) so it is emptied
-- of meaning instead: nothing writes it and no policy reads it any more.
do $m$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'bookings'
                and column_name = 'user_id' and is_nullable = 'NO')
  then
    alter table bookings alter column user_id drop not null;
  end if;
end
$m$;

alter table bookings alter column user_id drop default;

-- Same for the notes: they hang off a customer record now.
alter table customer_notes add column if not exists customer_id uuid references customers (id);
create index if not exists customer_notes_customer_idx
  on customer_notes (customer_id, created_at desc);

do $m$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'customer_notes'
                and column_name = 'user_id' and is_nullable = 'NO')
  then
    alter table customer_notes alter column user_id drop not null;
  end if;
end
$m$;

-- ---------------------------------------------------------------------------
-- 3. Who may write a booking
--
-- There is no customer path left. An admin books anyone onto anyone's calendar;
-- an instructor books onto their own.
-- ---------------------------------------------------------------------------

drop policy if exists insert_booking on bookings;
create policy insert_booking on bookings
  for insert to authenticated
  with check (app_role() = 'admin' or instructor_id = my_instructor_id());

-- The earlier policies carried an "or it is your own booking" clause. It reads
-- `user_id`, which is now always null, so it grants nothing — but a permissive
-- policy nobody means any more is how a hole gets back in later. They go.
drop policy if exists read_own_booking on bookings;
drop policy if exists read_bookings on bookings;
drop policy if exists read_booking on bookings;
create policy read_booking on bookings
  for select to authenticated
  using (app_role() = 'admin' or instructor_id = my_instructor_id());

drop policy if exists delete_own_booking on bookings;
drop policy if exists delete_booking on bookings;
create policy delete_booking on bookings
  for delete to authenticated
  using (app_role() = 'admin' or instructor_id = my_instructor_id());

drop policy if exists update_booking_status on bookings;
drop policy if exists decide_bookings on bookings;
drop policy if exists update_booking on bookings;
create policy update_booking on bookings
  for update to authenticated
  using (app_role() = 'admin' or instructor_id = my_instructor_id())
  with check (app_role() = 'admin' or instructor_id = my_instructor_id());

-- A booking staff enter is agreed unless they say otherwise, so it no longer
-- starts life in a queue.
create or replace function bookings_set_initial_status() returns trigger
  language plpgsql
as $fn$
declare
  uid text;
begin
  if current_user not in ('anonymous', 'authenticated') then
    return new;
  end if;

  uid := jwt_user_id();
  if uid is null then
    raise exception 'cannot identify the caller';
  end if;

  new.created_by := uid;
  new.user_id := null;

  if new.status is null or new.status not in ('pending', 'approved', 'rejected') then
    new.status := 'approved';
  end if;

  if new.status = 'approved' then
    new.decided_by := uid;
    new.decided_at := now();
  end if;

  return new;
end
$fn$;

-- The decision guard protected a customer's booking from the instructor who was
-- approving it. There is no customer to protect any more: both parties to a
-- booking are staff, and an instructor rearranging their own day is the job.
drop trigger if exists bookings_decision_guard on bookings;

-- ---------------------------------------------------------------------------
-- 4. Views are rebuilt on the new model
--
-- Dropped in dependency order first: `profiles` cannot go while they stand.
-- ---------------------------------------------------------------------------

drop view if exists busy_hours;
drop view if exists instructor_bookings;
drop view if exists managed_bookings;
drop view if exists customer_directory;
drop view if exists crm_customers;
drop view if exists kids_camp_roll;
drop view if exists admin_users;

-- Profiles, and everything that existed to serve them.
drop trigger if exists link_instructor_account on profiles;
drop trigger if exists profiles_segments_guard on profiles;
drop function if exists link_instructor_account();
drop function if exists profiles_segments_guard();
drop function if exists has_profile();
drop table if exists profiles;

-- What the public sees: which hours are taken and what kind of thing is in
-- them. No name, no phone, no customer id.
create view busy_hours with (security_invoker = false) as
  select b.instructor_id,
         b.lesson_type,
         b.status,
         gs.hour as starts_at
    from bookings b
    cross join lateral generate_series(
      b.starts_at,
      b.starts_at + make_interval(hours => b.duration_hours - 1),
      interval '1 hour'
    ) as gs(hour)
   where b.status <> 'rejected';

-- Every booking staff may see, with the customer attached.
create view managed_bookings with (security_invoker = false) as
  select b.id,
         b.customer_id,
         b.instructor_id,
         i.name        as instructor_name,
         b.starts_at,
         b.duration_hours,
         b.sport,
         b.lesson_type,
         b.group_size,
         b.status,
         b.created_at,
         b.decided_at,
         c.full_name   as customer_name,
         c.email       as customer_email,
         c.phone       as customer_phone,
         coalesce(c.segments, '{}') as customer_segments
    from bookings b
    join instructors i on i.id = b.instructor_id
    left join customers c on c.id = b.customer_id
   where b.instructor_id = my_instructor_id() or app_role() = 'admin';

-- Who staff may book. Empty for anyone who is not staff.
create view customer_directory with (security_invoker = false) as
  select c.id as customer_id,
         c.full_name as name,
         c.email,
         c.phone
    from customers c
   where app_role() = 'admin' or my_instructor_id() is not null;

-- The customer list, with what each of them has actually done.
create view crm_customers with (security_invoker = false) as
  select c.id                          as customer_id,
         c.full_name                   as name,
         c.email,
         c.phone,
         coalesce(c.segments, '{}')    as segments,
         c.created_at,
         coalesce(b.lessons, 0)        as lessons,
         coalesce(b.hours, 0)          as hours,
         coalesce(b.kids_camps, 0)     as kids_camps,
         b.last_lesson_at,
         (select count(*) from customer_notes n where n.customer_id = c.id) as notes
    from customers c
    left join lateral (
      select count(*)                                          as lessons,
             sum(duration_hours)                               as hours,
             count(*) filter (where lesson_type = 'kids_camp') as kids_camps,
             max(starts_at)                                    as last_lesson_at
        from bookings bk
       where bk.customer_id = c.id
         and bk.status <> 'rejected'
    ) b on true
   where app_role() = 'admin' or my_instructor_id() is not null;

-- The kids-camp roll.
create view kids_camp_roll with (security_invoker = false) as
  select bk.id                       as booking_id,
         bk.customer_id,
         c.full_name                 as name,
         c.email,
         c.phone,
         bk.instructor_id,
         i.name                      as instructor_name,
         bk.starts_at,
         bk.duration_hours,
         bk.status,
         coalesce(c.segments, '{}')  as segments
    from bookings bk
    left join customers  c on c.id = bk.customer_id
    left join instructors i on i.id = bk.instructor_id
   where bk.lesson_type = 'kids_camp'
     and (app_role() = 'admin' or bk.instructor_id = my_instructor_id());

-- The accounts that can sign in. Everyone here is staff or waiting to be made
-- staff, since nobody else has a reason to have an account any more.
create view admin_users with (security_invoker = false) as
  select u.id::text                   as user_id,
         u.email,
         u.name,
         coalesce(r.role, 'customer') as role,
         r.instructor_id,
         u."emailVerified"            as email_verified,
         u."createdAt"                as created_at
    from neon_auth."user" u
    left join user_roles r on r.user_id = u.id::text
   where app_role() = 'admin';

-- ---------------------------------------------------------------------------
-- 5. Linking an instructor account is now something an admin does
--
-- It used to happen by itself: a trigger on `profiles` matched the new user's
-- verified email against an instructor record. There are no profiles left to
-- hang that trigger on, and the Data API client in this project has no way to
-- call a function — @neondatabase/postgrest-js ships no `rpc`, so a
-- `security definer` function has no caller.
--
-- Rather than add a trigger to Neon's own `neon_auth."user"` table, which Neon
-- may replace from under us and whose disappearance would be silent, linking is
-- explicit: the instructor signs up, and an admin points their account at the
-- instructor record from the Hocalar page. For a school with a handful of
-- instructors that is a few seconds of work and one less thing that can rot.
-- ---------------------------------------------------------------------------

drop function if exists claim_instructor();

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on customers from anonymous, authenticated;
grant select, insert, update, delete on customers to authenticated;

revoke all on busy_hours, managed_bookings, customer_directory from anonymous, authenticated;
revoke all on crm_customers, kids_camp_roll, admin_users from anonymous, authenticated;

grant select on busy_hours to anonymous, authenticated;
grant select on managed_bookings to authenticated;
grant select on customer_directory to authenticated;
grant select on crm_customers to authenticated;
grant select on kids_camp_roll to authenticated;
grant select on admin_users to authenticated;

-- Remember step 3b in the README: the Data API will not see `customers` or the
-- rebuilt views until the schema cache is refreshed in the Neon console.
