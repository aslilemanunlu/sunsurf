-- Lesson packages against the calendar, and a narrower instructor.
--
-- Two things:
--
--   1. A booking may be attached to a package, chosen when the lesson is
--      written. One booking spends one lesson, however many hours it runs —
--      a ten-lesson pack is ten sessions, not ten hours.
--   2. An instructor may write lessons on their own calendar and nothing else.
--      They no longer read the customer list or create customer records.
--
-- Nothing counts "lessons used" into a column. It is the number of bookings
-- pointing at the package, so cancelling a lesson gives the lesson back without
-- anybody remembering to adjust a total.
--
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Packages
-- ---------------------------------------------------------------------------

-- How many lessons this agreement is worth. Null for anything that is not a
-- lesson package. Stored rather than derived from `plan`, so that editing the
-- package list later cannot silently rewrite what somebody already bought.
alter table agreements add column if not exists lesson_count int
  check (lesson_count is null or lesson_count > 0);

alter table bookings add column if not exists agreement_id uuid references agreements (id);
create index if not exists bookings_agreement_idx on bookings (agreement_id);

-- What the booking dialog offers: how many lessons are left on each package.
-- Deliberately carries no money — an instructor picking a package has no
-- business seeing what it cost.
drop view if exists open_packages;
create view open_packages with (security_invoker = false) as
  select a.id                                   as agreement_id,
         a.customer_id,
         a.plan,
         a.label,
         a.lesson_count                         as sold,
         count(b.id)                            as used,
         a.lesson_count - count(b.id)           as remaining,
         a.created_at
    from agreements a
    left join bookings b
      on b.agreement_id = a.id
     and b.status <> 'rejected'
   where a.kind = 'lesson'
     and a.lesson_count is not null
     and (app_role() = 'admin' or my_instructor_id() is not null)
   group by a.id, a.customer_id, a.plan, a.label, a.lesson_count, a.created_at;

-- ---------------------------------------------------------------------------
-- 2. What an instructor may reach
--
-- The customer list, their history and their notes are the office's, not the
-- beach's. An instructor still needs to name the person they are teaching, so
-- the picker stays — but it gives a name and nothing else. The phone number is
-- part of the customer record, and reading that is an admin's job.
-- ---------------------------------------------------------------------------

drop policy if exists read_customers on customers;
create policy read_customers on customers
  for select to authenticated
  using (app_role() = 'admin');

-- Writing a lesson means naming who it is for, and the person at the desk is
-- often the instructor. So they may still add a customer — they simply cannot
-- browse the ones already there.
drop policy if exists insert_customers on customers;
create policy insert_customers on customers
  for insert to authenticated
  with check (app_role() = 'admin' or my_instructor_id() is not null);

drop view if exists customer_directory;
create view customer_directory with (security_invoker = false) as
  select c.id        as customer_id,
         c.full_name as name,
         case when app_role() = 'admin' then c.email end as email,
         case when app_role() = 'admin' then c.phone end as phone
    from customers c
   where app_role() = 'admin' or my_instructor_id() is not null;

drop view if exists crm_customers;
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
   where app_role() = 'admin';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on open_packages, customer_directory, crm_customers from anonymous, authenticated;
grant select on open_packages to authenticated;
grant select on customer_directory to authenticated;
grant select on crm_customers to authenticated;

-- Remember step 3b in the README: `open_packages` and the rebuilt
-- `customer_directory` / `crm_customers` need a Data API schema cache refresh.
