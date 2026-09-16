-- Yönetici sits above admin.
--
-- The difference between the two is one thing: what an instructor is paid.
-- Everything else an admin already sees. So rather than a third role that every
-- policy in db/ would have to learn about — and one of them would eventually be
-- missed — this is a flag on top of admin. An owner *is* an admin; the flag only
-- opens the commission column.
--
-- Commission arrives here because the role distinction is meaningless without
-- it. It is a rate and nothing more: nothing computes a payout from it, and
-- until something does, it is a note that happens to be a number.
--
-- Safe to re-run.

alter table user_roles add column if not exists is_owner boolean not null default false;

-- security definer for the same reason app_role() is: a policy has to be able
-- to ask without the caller being able to read the whole table.
create or replace function is_owner() returns boolean
  language sql stable security definer set search_path = public, pg_temp
as $fn$
  select coalesce(
    (select r.is_owner from user_roles r where r.user_id = auth.user_id()),
    false
  )
$fn$;

grant execute on function is_owner() to anonymous, authenticated;

-- What the school pays this instructor. Read by an owner and nobody else — it
-- is not in the column grants on `instructors`, and `instructor_admin` does not
-- select it.
alter table instructors add column if not exists commission_rate numeric(6, 2)
  check (commission_rate is null or commission_rate >= 0);
alter table instructors add column if not exists commission_note text;

-- A separate view, so that "can an admin see commission?" is answered in one
-- place instead of by remembering to leave a column out.
drop view if exists instructor_pay;
create view instructor_pay with (security_invoker = false) as
  select i.id,
         i.name,
         i.employment,
         i.commission_rate,
         i.commission_note
    from instructors i
   where is_owner();

revoke all on instructor_pay from anonymous, authenticated;
grant select on instructor_pay to authenticated;

-- Only an owner may set it. `admin_manages_roles` still lets an admin write
-- other columns, so the guard is a trigger: a policy cannot say "every column
-- but this one".
create or replace function instructors_commission_guard() returns trigger
  language plpgsql
as $fn$
begin
  if current_user not in ('anonymous', 'authenticated') then
    return new;
  end if;
  if (new.commission_rate is distinct from old.commission_rate
      or new.commission_note is distinct from old.commission_note)
     and not is_owner()
  then
    raise exception 'only a yönetici may change commission';
  end if;
  return new;
end
$fn$;

drop trigger if exists instructors_commission_guard on instructors;
create trigger instructors_commission_guard before update on instructors
  for each row execute function instructors_commission_guard();

-- An admin promoting somebody must not be able to promote them past themselves.
create or replace function user_roles_owner_guard() returns trigger
  language plpgsql
as $fn$
begin
  if current_user not in ('anonymous', 'authenticated') then
    return new;
  end if;
  if new.is_owner and not is_owner() then
    raise exception 'only a yönetici may appoint another yönetici';
  end if;
  if tg_op = 'UPDATE' and old.is_owner and not new.is_owner and not is_owner() then
    raise exception 'only a yönetici may remove another yönetici';
  end if;
  return new;
end
$fn$;

drop trigger if exists user_roles_owner_guard on user_roles;
create trigger user_roles_owner_guard before insert or update on user_roles
  for each row execute function user_roles_owner_guard();

-- The account list says who is what.
drop view if exists admin_users;
create view admin_users with (security_invoker = false) as
  select u.id::text                   as user_id,
         u.email,
         u.name,
         coalesce(r.role, 'customer') as role,
         coalesce(r.is_owner, false)  as is_owner,
         r.instructor_id,
         u."emailVerified"            as email_verified,
         u."createdAt"                as created_at
    from neon_auth."user" u
    left join user_roles r on r.user_id = u.id::text
   where app_role() = 'admin';

revoke all on admin_users from anonymous, authenticated;
grant select on admin_users to authenticated;

-- ---------------------------------------------------------------------------
-- The school's first owner
--
-- Somebody has to be able to appoint the next one, and the guard above means
-- nobody can appoint themselves. This is the one place it can happen, and only
-- for an account that is already an admin.
-- ---------------------------------------------------------------------------

update user_roles set is_owner = true
 where role = 'admin'
   and not exists (select 1 from user_roles where is_owner);
