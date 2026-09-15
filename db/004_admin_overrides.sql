-- What an admin may do to an instructor's calendar.
--
-- Until now `my_instructor_id()` was the only key to a calendar, so an admin who
-- was not themselves linked to an instructor could not touch anything. These
-- policies give admins their own way in, without widening what instructors can
-- reach: an instructor is still confined to their own id.
--
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- Closing and reopening hours on any instructor's calendar
-- ---------------------------------------------------------------------------

drop policy if exists write_own_blocks on instructor_blocks;
create policy write_own_blocks on instructor_blocks
  for insert to authenticated
  with check (instructor_id = my_instructor_id() or app_role() = 'admin');

drop policy if exists delete_own_blocks on instructor_blocks;
create policy delete_own_blocks on instructor_blocks
  for delete to authenticated
  using (instructor_id = my_instructor_id() or app_role() = 'admin');

-- ---------------------------------------------------------------------------
-- Moving a booking
--
-- The guard still refuses to let an *instructor* change anything but the status,
-- which is the rule that stops them rewriting a customer's booking while
-- approving it. An admin is trusted to move and reschedule; the exclusion
-- constraint still refuses to let them move a booking on top of another one.
-- ---------------------------------------------------------------------------

create or replace function bookings_decision_guard() returns trigger
  language plpgsql
as $fn$
declare
  uid text;
begin
  -- Trust is decided by the Postgres role, not by whether a JWT can be read.
  -- Migrations and psql connect as the owner; requests through the Data API
  -- arrive as anonymous or authenticated and must identify themselves.
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

  -- the customer may edit their own booking; an admin may edit anyone's
  if uid = old.user_id or app_role() = 'admin' then
    return new;
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
