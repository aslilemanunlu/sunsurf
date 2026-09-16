-- What the school keeps about a person.
--
-- Everything here is optional except the name. Somebody who walks up ten
-- minutes before a lesson gives you a first name and nothing else, and a form
-- that refuses that is a form staff stop using.
--
-- Two of these are safety fields rather than marketing ones: an injury that
-- changes what an instructor should do on the water, and — for a child — an
-- allergy. They sit on the record so that whoever is teaching can be told,
-- not so that anybody is profiled.
--
-- Safe to re-run.

alter table customers add column if not exists birth_date date;

-- Where they came from: Instagram, a hotel, a recommendation, walking past.
-- Free text rather than an enum: the list will be wrong within a season, and a
-- column that has to be migrated every time is a column nobody updates.
alter table customers add column if not exists source text;

-- Anything that changes what should happen on the water.
alter table customers add column if not exists injury_note text;

-- Children only, in practice: the camp needs it, an adult rarely volunteers it.
alter table customers add column if not exists allergy_note text;

-- Two, because the first one is often the person already on the beach.
alter table customers add column if not exists emergency1_name  text;
alter table customers add column if not exists emergency1_phone text;
alter table customers add column if not exists emergency2_name  text;
alter table customers add column if not exists emergency2_phone text;

-- For a camp the customer record is the child; this is who to ring.
alter table customers add column if not exists guardian_name  text;
alter table customers add column if not exists guardian_phone text;

-- A birth date in the future is a typo, not a baby.
do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'customers_birth_date_chk') then
    alter table customers add constraint customers_birth_date_chk
      check (birth_date is null or birth_date <= current_date);
  end if;
end
$c$;

-- ---------------------------------------------------------------------------
-- The customer list carries the new fields
--
-- `age` is worked out here rather than stored: a stored age is wrong within a
-- year and nobody ever remembers to recompute it.
-- ---------------------------------------------------------------------------

drop view if exists crm_customers;
create view crm_customers with (security_invoker = false) as
  select c.id                          as customer_id,
         c.full_name                   as name,
         c.email,
         c.phone,
         c.birth_date,
         case when c.birth_date is not null
              then extract(year from age(c.birth_date))::int
         end                           as age,
         c.source,
         c.injury_note,
         c.allergy_note,
         c.emergency1_name,
         c.emergency1_phone,
         c.emergency2_name,
         c.emergency2_phone,
         c.guardian_name,
         c.guardian_phone,
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

-- The camp roll gains what whoever runs the camp actually needs to hand: the
-- guardian's number and anything the child is allergic to.
drop view if exists kids_camp_roll;
create view kids_camp_roll with (security_invoker = false) as
  select bk.id                       as booking_id,
         bk.customer_id,
         c.full_name                 as name,
         c.email,
         c.phone,
         case when c.birth_date is not null
              then extract(year from age(c.birth_date))::int
         end                         as age,
         c.guardian_name,
         c.guardian_phone,
         c.allergy_note,
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

revoke all on crm_customers, kids_camp_roll from anonymous, authenticated;
grant select on crm_customers to authenticated;
grant select on kids_camp_roll to authenticated;

-- Remember step 3b in the README: the rebuilt views need a schema cache refresh.
