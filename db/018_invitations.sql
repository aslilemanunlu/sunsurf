-- Deciding who gets in, without anybody typing somebody else's password.
--
-- The ask was for an admin to set an account's email *and* password. This stack
-- cannot do that: creating a user means calling Neon's sign-up endpoint, which
-- answers with a session for the new user and would sign the admin out of their
-- own browser. There is no server of ours to call an admin API from, and the
-- Data API client has no way to invoke a function.
--
-- So the admin decides *who* and *what*, and the person sets their own password:
--
--   1. An admin adds an invitation: email + role (+ an instructor to link to).
--   2. That person signs up normally and picks their own password.
--   3. On first sign-in the app claims the invitation, and the role is granted.
--
-- Step 3 is an ordinary INSERT the new user makes for themselves — no function
-- call, which is why this works at all. What stops it being a self-promotion is
-- that the policy only permits the insert when an invitation matches their own
-- address, and a trigger overwrites whatever role they sent with the invited
-- one. The client chooses nothing.
--
-- It is also better than what was asked for: nobody has to know a colleague's
-- password, and nobody has to change one they were handed.
--
-- Safe to re-run.

create table if not exists staff_invitations (
  email         text primary key,
  role          text not null check (role in ('admin', 'instructor')),
  -- an invited admin may also be a yönetici
  is_owner      boolean not null default false,
  instructor_id text references instructors (id),
  created_at    timestamptz not null default now(),
  created_by    text
);

alter table staff_invitations enable row level security;

drop policy if exists admin_invitations on staff_invitations;
create policy admin_invitations on staff_invitations
  for all to authenticated
  using (app_role() = 'admin')
  with check (app_role() = 'admin');

-- Normalising here rather than trusting the caller: an invitation that differs
-- from the sign-up address only by capitals would never be claimed.
create or replace function invitations_normalise() returns trigger
  language plpgsql
as $fn$
begin
  new.email := lower(btrim(new.email));
  if current_user in ('anonymous', 'authenticated') then
    new.created_by := jwt_user_id();
  end if;
  if new.role <> 'admin' then
    new.is_owner := false;
  end if;
  return new;
end
$fn$;

drop trigger if exists invitations_normalise on staff_invitations;
create trigger invitations_normalise before insert or update on staff_invitations
  for each row execute function invitations_normalise();

-- ---------------------------------------------------------------------------
-- Claiming one
-- ---------------------------------------------------------------------------

-- The caller's own address, from the session. `security definer` because
-- neon_auth is not theirs to read.
create or replace function my_email() returns text
  language sql stable security definer set search_path = public, neon_auth, pg_temp
as $fn$
  select lower(u.email) from neon_auth."user" u where u.id::text = auth.user_id()
$fn$;

grant execute on function my_email() to authenticated;

-- A new account may give itself exactly the role it was invited to, and only
-- while it has none.
drop policy if exists claim_invitation on user_roles;
create policy claim_invitation on user_roles
  for insert to authenticated
  with check (
    user_id = auth.user_id()
    and exists (select 1 from staff_invitations i where i.email = my_email())
  );

create or replace function user_roles_claim() returns trigger
  language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare
  inv staff_invitations%rowtype;
begin
  if current_user not in ('anonymous', 'authenticated') then
    return new;
  end if;
  -- an admin writing somebody else's row is the ordinary path, untouched
  if app_role() = 'admin' then
    return new;
  end if;

  select * into inv from staff_invitations where email = my_email();
  if not found then
    raise exception 'no invitation for this account';
  end if;

  -- Whatever the client sent is discarded. This is the line that makes the
  -- insert safe to expose at all.
  new.role := inv.role;
  new.is_owner := inv.is_owner;
  new.instructor_id := inv.instructor_id;

  delete from staff_invitations where email = inv.email;
  return new;
end
$fn$;

drop trigger if exists user_roles_claim on user_roles;
create trigger user_roles_claim before insert on user_roles
  for each row execute function user_roles_claim();

-- ---------------------------------------------------------------------------
-- One list of everybody who can sign in, invitations included
-- ---------------------------------------------------------------------------

drop view if exists admin_users;
create view admin_users with (security_invoker = false) as
  select u.id::text                   as user_id,
         u.email,
         u.name,
         coalesce(r.role, 'customer') as role,
         coalesce(r.is_owner, false)  as is_owner,
         r.instructor_id,
         i.name                       as instructor_name,
         u."emailVerified"            as email_verified,
         u."createdAt"                as created_at,
         false                        as pending
    from neon_auth."user" u
    left join user_roles r on r.user_id = u.id::text
    left join instructors i on i.id = r.instructor_id
   where app_role() = 'admin'

   union all

  -- invited but not signed up yet: the same shape, so one table shows both
  select null                as user_id,
         v.email,
         null                as name,
         v.role,
         v.is_owner,
         v.instructor_id,
         i.name              as instructor_name,
         false               as email_verified,
         v.created_at,
         true                as pending
    from staff_invitations v
    left join instructors i on i.id = v.instructor_id
   where app_role() = 'admin';

revoke all on staff_invitations, admin_users from anonymous, authenticated;
grant select, insert, update, delete on staff_invitations to authenticated;
grant select on admin_users to authenticated;

-- Remember step 3b in the README: `staff_invitations` and the rebuilt
-- `admin_users` need a Data API schema cache refresh.
