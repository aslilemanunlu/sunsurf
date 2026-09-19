-- Who did what, and when.
--
-- Written by triggers rather than by the app, because the app is the browser:
-- anything the client is trusted to write, the client can also decline to
-- write. A row lands in here because the database put it there, in the same
-- transaction as the change it describes.
--
-- What is logged is what somebody would ask about after the fact: lessons,
-- the camp register, packages and money, access, and the editing or deleting
-- of a customer record. Creating a customer is not logged — that happens
-- dozens of times a week and answers no question.
--
-- Only the yönetici reads it. An admin can change everything the log records,
-- so an admin reading their own audit trail is most of the way to editing it.
--
-- Rows older than 90 days are deleted, which is what was asked for. It is not
-- a backup and it will not answer "what happened last season".
--
-- Safe to re-run.

create table if not exists audit_log (
  id          uuid primary key default gen_random_uuid(),
  happened_at timestamptz not null default now(),
  actor_id    text,
  actor_email text,
  -- booking | camp | package | payment | access | customer
  area        text not null,
  -- create | update | delete | cancel
  action      text not null,
  /** Who or what it was about, already readable: a name, an email. */
  subject     text,
  /** The one line of context: when the lesson was, how much, which package. */
  detail      text,
  row_id      uuid
);

create index if not exists audit_log_when_idx on audit_log (happened_at desc);

alter table audit_log enable row level security;

-- Nobody writes through a policy; the triggers are security definer.
drop policy if exists owner_reads_audit on audit_log;
create policy owner_reads_audit on audit_log
  for select to authenticated
  using (is_owner());

revoke all on audit_log from anonymous, authenticated;
grant select on audit_log to authenticated;

-- ---------------------------------------------------------------- the writer

create or replace function audit_write(
  p_area text,
  p_action text,
  p_subject text,
  p_detail text,
  p_row uuid
) returns void
  language plpgsql security definer set search_path = public, neon_auth, pg_temp
as $fn$
begin
  insert into audit_log (actor_id, actor_email, area, action, subject, detail, row_id)
  values (
    jwt_user_id(),
    (select lower(u.email) from neon_auth."user" u where u.id::text = jwt_user_id()),
    p_area, p_action, p_subject, p_detail, p_row
  );

  -- Pruning here rather than on a schedule: there is no scheduler, and one
  -- delete in twenty writes keeps a 90-day table 90 days long without a sweep
  -- running on every single change.
  if random() < 0.05 then
    delete from audit_log where happened_at < now() - interval '90 days';
  end if;
end
$fn$;

-- ------------------------------------------------------------------ lessons

create or replace function audit_booking() returns trigger
  language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare
  row       record := coalesce(new, old);
  who       text;
  where_    text;
  what      text;
begin
  select i.name into where_ from instructors i where i.id = row.instructor_id;

  if row.is_guest then
    who := 'Misafir';
  else
    select c.full_name into who from customers c where c.id = row.customer_id;
  end if;

  what := coalesce(who, '—') || ' · ' || coalesce(where_, '—');

  if tg_op = 'INSERT' then
    perform audit_write('booking', 'create', what,
      to_char(row.starts_at, 'DD.MM.YYYY HH24:MI') || ' · ' || row.duration_hours || ' saat · ' ||
      row.lesson_type, row.id);
  elsif tg_op = 'DELETE' then
    perform audit_write('booking', 'delete', what,
      to_char(row.starts_at, 'DD.MM.YYYY HH24:MI') || ' · ' || row.lesson_type, row.id);
  elsif new.status = 'rejected' and old.status is distinct from 'rejected' then
    perform audit_write('booking', 'cancel', what,
      to_char(row.starts_at, 'DD.MM.YYYY HH24:MI'), row.id);
  else
    perform audit_write('booking', 'update', what,
      to_char(old.starts_at, 'DD.MM.YYYY HH24:MI') || ' → ' ||
      to_char(new.starts_at, 'DD.MM.YYYY HH24:MI'), row.id);
  end if;

  return null;
end
$fn$;

drop trigger if exists audit_booking on bookings;
create trigger audit_booking after insert or update or delete on bookings
  for each row execute function audit_booking();

-- ------------------------------------------------------------- camp register

create or replace function audit_camp_attendance() returns trigger
  language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare
  row   record := coalesce(new, old);
  child text;
begin
  select coalesce(r.child_name, c.full_name) into child
    from camp_registrations r
    join customers c on c.id = r.customer_id
   where r.id = row.registration_id;

  if tg_op = 'DELETE' then
    perform audit_write('camp', 'delete', child,
      to_char(row.day, 'DD.MM.YYYY') || ' · yoklamadan kaldırıldı', row.id);
  elsif tg_op = 'INSERT' then
    perform audit_write('camp', 'create', child,
      to_char(row.day, 'DD.MM.YYYY') || ' · ' || row.kind, row.id);
  else
    perform audit_write('camp', 'update', child,
      to_char(row.day, 'DD.MM.YYYY') || ' · ' || old.kind || ' → ' || new.kind, row.id);
  end if;

  return null;
end
$fn$;

drop trigger if exists audit_camp_attendance on camp_attendance;
create trigger audit_camp_attendance after insert or update or delete on camp_attendance
  for each row execute function audit_camp_attendance();

-- A camp registration is logged when it is changed or removed, never when it
-- is created: signing a child up is the ordinary thing that happens all summer.
create or replace function audit_camp_registration() returns trigger
  language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare
  row   record := coalesce(new, old);
  child text;
begin
  select coalesce(row.child_name, c.full_name) into child
    from customers c where c.id = row.customer_id;

  perform audit_write(
    'camp',
    case when tg_op = 'DELETE' then 'delete' else 'update' end,
    child,
    row.season || ' sezonu kampı · ' ||
      case when tg_op = 'DELETE' then 'kayıt silindi' else 'kayıt düzenlendi' end,
    row.id
  );
  return null;
end
$fn$;

drop trigger if exists audit_camp_registration on camp_registrations;
create trigger audit_camp_registration after update or delete on camp_registrations
  for each row execute function audit_camp_registration();

-- --------------------------------------------------------- packages and money

create or replace function audit_agreement() returns trigger
  language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare
  row  record := coalesce(new, old);
  who  text;
begin
  select c.full_name into who from customers c where c.id = row.customer_id;

  perform audit_write(
    'package',
    lower(tg_op),
    who,
    row.kind || coalesce(' · ' || row.plan, '') ||
      coalesce(' · ' || row.lesson_count || ' ders', '') ||
      ' · ' || row.agreed_amount,
    row.id
  );
  return null;
end
$fn$;

drop trigger if exists audit_agreement on agreements;
create trigger audit_agreement after insert or update or delete on agreements
  for each row execute function audit_agreement();

create or replace function audit_payment() returns trigger
  language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare
  row  record := coalesce(new, old);
  who  text;
begin
  select c.full_name into who
    from agreements a join customers c on c.id = a.customer_id
   where a.id = row.agreement_id;

  perform audit_write(
    'payment',
    case when tg_op = 'DELETE' then 'delete' else 'create' end,
    who,
    row.amount || case when row.kind = 'writeoff' then ' · bakiye sıfırlandı' else ' · tahsilat' end,
    row.id
  );
  return null;
end
$fn$;

drop trigger if exists audit_payment on payments;
create trigger audit_payment after insert or delete on payments
  for each row execute function audit_payment();

-- ------------------------------------------------------- access and invites

create or replace function audit_access() returns trigger
  language plpgsql security definer set search_path = public, neon_auth, pg_temp
as $fn$
declare
  row   record := coalesce(new, old);
  email text;
begin
  if tg_table_name = 'user_roles' then
    select lower(u.email) into email from neon_auth."user" u where u.id::text = row.user_id;
    perform audit_write(
      'access',
      lower(tg_op),
      coalesce(email, row.user_id),
      row.role || case when row.is_owner then ' · yönetici' else '' end ||
        case when row.instructor_id is not null then ' · hoca profili bağlı' else '' end,
      null
    );
  else
    perform audit_write(
      'access',
      case when tg_op = 'DELETE' then 'delete' else 'create' end,
      row.email,
      'davet · ' || row.role || case when row.is_owner then ' · yönetici' else '' end,
      null
    );
  end if;
  return null;
end
$fn$;

drop trigger if exists audit_user_roles on user_roles;
create trigger audit_user_roles after insert or update or delete on user_roles
  for each row execute function audit_access();

drop trigger if exists audit_invitations on staff_invitations;
create trigger audit_invitations after insert or delete on staff_invitations
  for each row execute function audit_access();

-- ---------------------------------------------------------------- customers

-- Changed or removed only. A new customer record is created from the booking
-- dialog several times a day and logging it would bury everything else.
create or replace function audit_customer() returns trigger
  language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare
  row record := coalesce(new, old);
begin
  perform audit_write(
    'customer',
    case when tg_op = 'DELETE' then 'delete' else 'update' end,
    row.full_name,
    case when tg_op = 'DELETE' then 'müşteri kaydı silindi' else 'müşteri kaydı düzenlendi' end,
    row.id
  );
  return null;
end
$fn$;

drop trigger if exists audit_customer on customers;
create trigger audit_customer after update or delete on customers
  for each row execute function audit_customer();

-- Remember step 3b in the README: `audit_log` needs a Data API schema refresh.
