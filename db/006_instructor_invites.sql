-- Instructor profiles that exist before the person signs up, and the email
-- match that links the two once they do.
--
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table instructors add column if not exists email text;
alter table instructors add column if not exists phone text;
alter table instructors add column if not exists created_at timestamptz not null default now();

-- the matching key, case-insensitive
create unique index if not exists instructors_email_key on instructors (lower(email));

-- one instructor profile belongs to at most one account
create unique index if not exists user_roles_instructor_key
  on user_roles (instructor_id) where instructor_id is not null;

-- ---------------------------------------------------------------------------
-- Instructor emails are NOT public
--
-- `instructors` is readable by the anonymous role so signed-out visitors can see
-- the calendar. Adding an email column to a table with a table-wide SELECT grant
-- would publish every instructor's address, so the grant drops to column level.
-- ---------------------------------------------------------------------------

revoke select on instructors from anonymous, authenticated;
revoke select (email, phone, created_at) on instructors from anonymous, authenticated;
grant select (id, name, sports, bio) on instructors to anonymous, authenticated;

-- Admins write the full row (RLS below restricts who), but nobody reads email or
-- phone from the table directly: the read policy is `using (true)`, so a column
-- grant here would hand every signed-in user every instructor's address. Admins
-- read those through the instructor_admin view instead, which runs as the owner.
grant insert, update on instructors to authenticated;

drop policy if exists admin_writes_instructors on instructors;
create policy admin_writes_instructors on instructors
  for all to authenticated
  using (app_role() = 'admin')
  with check (app_role() = 'admin');

-- ---------------------------------------------------------------------------
-- The match
--
-- This runs in the database, not the client: if the app could say "link me to
-- that instructor", anyone could say it. Gated on a verified email, so claiming
-- somebody else's profile means controlling their inbox.
-- ---------------------------------------------------------------------------

create or replace function link_instructor_account() returns trigger
  language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare
  v_email    text;
  v_verified boolean;
  v_id       text;
  v_name     text;
  v_phone    text;
begin
  select u.email, u."emailVerified"
    into v_email, v_verified
    from neon_auth."user" u
   where u.id::text = new.user_id;

  if not found or not coalesce(v_verified, false) then
    return new; -- unverified address proves nothing
  end if;

  select i.id, i.name, i.phone
    into v_id, v_name, v_phone
    from instructors i
   where lower(i.email) = lower(v_email)
     and not exists (select 1 from user_roles r where r.instructor_id = i.id)
   limit 1;

  if not found then
    return new; -- an ordinary customer
  end if;

  insert into user_roles (user_id, role, instructor_id)
  values (new.user_id, 'instructor', v_id)
  on conflict (user_id) do update
    set role = 'instructor', instructor_id = excluded.instructor_id, updated_at = now();

  -- carry across whatever the admin already knew about them
  if coalesce(new.full_name, '') = '' then new.full_name := v_name; end if;
  if coalesce(new.phone, '') = '' and v_phone is not null then new.phone := v_phone; end if;

  return new;
end
$fn$;

drop trigger if exists link_instructor_account on profiles;
create trigger link_instructor_account
  before insert on profiles
  for each row execute function link_instructor_account();

-- ---------------------------------------------------------------------------
-- Views for the admin screens
-- ---------------------------------------------------------------------------

drop view if exists admin_users;
create view admin_users with (security_invoker = false) as
  select u.id::text                   as user_id,
         u.email,
         coalesce(p.full_name, u.name) as name,
         p.phone,
         coalesce(r.role, 'customer') as role,
         r.instructor_id,
         u."emailVerified"            as email_verified,
         u."createdAt"                as created_at
    from neon_auth."user" u
    left join user_roles r on r.user_id = u.id::text
    left join profiles   p on p.user_id = u.id::text
   where app_role() = 'admin';

-- the full instructor row, including the email used for matching
drop view if exists instructor_admin;
create view instructor_admin with (security_invoker = false) as
  select i.id,
         i.name,
         i.sports,
         i.bio,
         i.email,
         i.phone,
         i.created_at,
         r.user_id as linked_user_id
    from instructors i
    left join user_roles r on r.instructor_id = i.id
   where app_role() = 'admin';

revoke all on admin_users, instructor_admin from anonymous, authenticated;
grant select on admin_users to authenticated;
grant select on instructor_admin to authenticated;
