-- Who came to camp, and for how much of the day.
--
-- Registering a child for a season and a child turning up on a Tuesday are
-- different facts. Attendance hangs off the registration, so it is inside a
-- season without anybody choosing one: the same child in 2026 and 2027 keeps
-- two separate tallies.
--
-- One row per child per day, and nothing else. A camp runs all summer with
-- twenty children in it, and anything more detailed than "full day or half" is
-- a form nobody fills in by August. A day with no row is a day they did not
-- come — absence is not worth a record.
--
-- Safe to re-run.

create table if not exists camp_attendance (
  id              uuid primary key default gen_random_uuid(),
  registration_id uuid not null references camp_registrations (id) on delete cascade,
  day             date not null,
  kind            text not null check (kind in ('full', 'half')),
  created_at      timestamptz not null default now(),
  created_by      text,
  unique (registration_id, day)
);

create index if not exists camp_attendance_day_idx on camp_attendance (day);

alter table camp_attendance enable row level security;

drop policy if exists admin_camp_attendance on camp_attendance;
create policy admin_camp_attendance on camp_attendance
  for all to authenticated
  using (app_role() = 'admin')
  with check (app_role() = 'admin');

drop trigger if exists camp_attendance_author on camp_attendance;
create trigger camp_attendance_author before insert on camp_attendance
  for each row execute function agreements_set_author();

-- One row per child per day they came, with the season they came in.
drop view if exists camp_attendance_roll;
create view camp_attendance_roll with (security_invoker = false) as
  select a.id,
         a.registration_id,
         r.season,
         r.customer_id,
         coalesce(r.child_name, c.full_name) as child_name,
         a.day,
         a.kind
    from camp_attendance a
    join camp_registrations r on r.id = a.registration_id
    join customers c on c.id = r.customer_id
   where app_role() = 'admin';

-- What each child adds up to over a season. Half days are counted as halves,
-- because that is the question being asked — not how many times they appeared.
drop view if exists camp_attendance_totals;
create view camp_attendance_totals with (security_invoker = false) as
  select r.id                                                   as registration_id,
         r.season,
         r.customer_id,
         coalesce(r.child_name, c.full_name)                     as child_name,
         count(a.id) filter (where a.kind = 'full')              as full_days,
         count(a.id) filter (where a.kind = 'half')              as half_days,
         coalesce(sum(case a.kind when 'full' then 1 else 0.5 end), 0) as total_days
    from camp_registrations r
    join customers c on c.id = r.customer_id
    left join camp_attendance a on a.registration_id = r.id
   where app_role() = 'admin'
   group by r.id, r.season, r.customer_id, coalesce(r.child_name, c.full_name);

revoke all on camp_attendance, camp_attendance_roll, camp_attendance_totals
  from anonymous, authenticated;
grant select, insert, update, delete on camp_attendance to authenticated;
grant select on camp_attendance_roll to authenticated;
grant select on camp_attendance_totals to authenticated;

-- Remember step 3b in the README: `camp_attendance` and its two views need a
-- Data API schema cache refresh.
