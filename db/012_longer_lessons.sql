-- A lesson may run longer than three hours.
--
-- The calendar now lets staff drag across a range of hours, and a cap of three
-- turns that into a rule nobody can see until the insert is refused. A camp or
-- a full-day rental session is a normal thing to write; twelve is the length of
-- the working day, so it is the only real limit.
--
-- Safe to re-run.

alter table bookings drop constraint if exists bookings_duration_chk;
alter table bookings add constraint bookings_duration_chk
  check (duration_hours between 1 and 12);
