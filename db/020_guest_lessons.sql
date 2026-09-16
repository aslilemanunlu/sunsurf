-- A lesson for somebody nobody is writing down.
--
-- A hotel guest turns up for one session and will never be seen again. Making a
-- customer record for them fills the list with names that mean nothing, and
-- leaving the lesson unattached makes it indistinguishable from a kids camp
-- booked before the children were named — which is the other reason
-- `customer_id` can be null.
--
-- So it is said outright. `is_guest` is what separates "deliberately nobody"
-- from "nobody yet", and it is what the reports filter on: guest lessons are
-- real hours the school taught, but they are not the school's customers, and
-- counting them in by default would flatter every number about repeat business.
--
-- Safe to re-run.

alter table bookings add column if not exists is_guest boolean not null default false;

do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'bookings_guest_chk') then
    -- a guest lesson belongs to nobody, by definition
    alter table bookings add constraint bookings_guest_chk
      check (not is_guest or customer_id is null);
  end if;
end
$c$;

drop view if exists managed_bookings;
create view managed_bookings with (security_invoker = false) as
  select b.id,
         b.customer_id,
         b.is_guest,
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
         b.agreement_id,
         c.full_name   as customer_name,
         c.email       as customer_email,
         c.phone       as customer_phone,
         coalesce(c.segments, '{}') as customer_segments
    from bookings b
    join instructors i on i.id = b.instructor_id
    left join customers c on c.id = b.customer_id
   where b.instructor_id = my_instructor_id() or app_role() = 'admin';

revoke all on managed_bookings from anonymous, authenticated;
grant select on managed_bookings to authenticated;

-- Remember step 3b in the README: `managed_bookings` was rebuilt and the Data
-- API will not see `is_guest` until the schema cache is refreshed.
