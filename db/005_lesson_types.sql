-- Lesson types: individual, group (one contact + a head count), and kids camp.
-- Also lets instructors and admins book on a customer's behalf.
--
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table bookings add column if not exists lesson_type text not null default 'individual';
alter table bookings add column if not exists group_size int;
alter table bookings add column if not exists created_by text default auth.user_id();

-- kids camp has no sport, so the column can no longer be unconditionally NOT NULL
alter table bookings alter column sport drop not null;

do $c$
begin
  if exists (select 1 from pg_constraint where conname = 'bookings_sport_chk') then
    alter table bookings drop constraint bookings_sport_chk;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'bookings_type_chk') then
    alter table bookings add constraint bookings_type_chk
      check (lesson_type in ('individual', 'group', 'kids_camp'));
  end if;

  -- One rule keeps the three fields consistent, so "a group with no head count"
  -- or "a kids camp that is somehow windsurf" cannot reach the table at all.
  if exists (select 1 from pg_constraint where conname = 'bookings_shape_chk') then
    alter table bookings drop constraint bookings_shape_chk;
  end if;

  alter table bookings add constraint bookings_shape_chk
      check (
        -- `group_size between 2 and 4` is NULL, not false, when group_size is
        -- null — and a CHECK only rejects on false. Without the explicit IS NOT
        -- NULL a group with no head count slips straight through.
        case lesson_type
          when 'kids_camp' then sport is null     and group_size is null
          when 'group'     then sport is not null and group_size is not null
                                                  and group_size between 2 and 4
          else                  sport is not null and group_size is null
        end
        and (sport is null or sport in ('windsurf', 'wingfoil'))
      );
end
$c$;

-- ---------------------------------------------------------------------------
-- Who may create a booking, and in what state
-- ---------------------------------------------------------------------------

drop policy if exists insert_own_booking on bookings;
drop policy if exists insert_booking on bookings;
create policy insert_booking on bookings
  for insert to authenticated
  with check (
    -- a customer, for themselves, once they have given us a phone number
    (auth.user_id() = user_id and has_profile())
    -- an admin, for anyone
    or app_role() = 'admin'
    -- an instructor, but only onto their own calendar
    or instructor_id = my_instructor_id()
  );

-- A lesson entered by staff is already agreed, so it skips the approval queue.
-- Only a customer's own request starts as pending.
create or replace function bookings_set_initial_status() returns trigger
  language plpgsql
as $fn$
declare
  uid text;
begin
  if current_user not in ('anonymous', 'authenticated') then
    return new; -- migrations and psql set what they like
  end if;

  uid := jwt_user_id();
  if uid is null then
    raise exception 'cannot identify the caller';
  end if;

  new.created_by := uid;
  new.status := case when uid = new.user_id then 'pending' else 'approved' end;

  if new.status = 'approved' then
    new.decided_by := uid;
    new.decided_at := now();
  end if;

  return new;
end
$fn$;

drop trigger if exists bookings_set_initial_status on bookings;
create trigger bookings_set_initial_status
  before insert on bookings
  for each row execute function bookings_set_initial_status();

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------

-- Occupancy: what kind of thing is in each hour, still without saying whose.
drop view if exists busy_hours;
create view busy_hours with (security_invoker = false) as
  select b.instructor_id,
         g.hour as starts_at,
         b.status,
         b.lesson_type,
         b.group_size
    from bookings b
    cross join lateral generate_series(
      b.starts_at,
      b.starts_at + make_interval(hours => b.duration_hours - 1),
      interval '1 hour'
    ) as g(hour)
   where b.status <> 'rejected';

drop view if exists managed_bookings;
create view managed_bookings with (security_invoker = false) as
  select b.id,
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

-- Who staff may book on behalf of. Empty for a plain customer.
drop view if exists customer_directory;
create view customer_directory with (security_invoker = false) as
  select u.id::text                        as user_id,
         coalesce(p.full_name, u.name)     as name,
         u.email,
         p.phone
    from neon_auth."user" u
    left join profiles p on p.user_id = u.id::text
   where app_role() = 'admin' or my_instructor_id() is not null;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on busy_hours, managed_bookings, customer_directory from anonymous, authenticated;
grant select on busy_hours to anonymous, authenticated;
grant select on managed_bookings to authenticated;
grant select on customer_directory to authenticated;
