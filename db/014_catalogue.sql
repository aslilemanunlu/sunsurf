-- The school's own vocabulary.
--
-- What gets sold has two dimensions that were being squeezed into one. A rental
-- is a *level* of kit for a *period*: "Freeride, weekly" and "Beginner, 3 hours"
-- are both rentals and neither is describable by one field. So the level moves
-- into its own column and `plan` keeps the period.
--
-- `units` is the number attached to a plan, and it means whatever that plan
-- counts: sessions on a lesson pack, hours on an hourly rental, days on a daily
-- one, credits on a credit block. One column rather than four, because they are
-- the same question — how many — and four columns would mean three of them are
-- null on every row.
--
-- `lesson_count` from db/011 is what `units` replaces. It stays because these
-- files are re-run from the top every time and 011 would put it back; nothing
-- reads it any more except the view below, which prefers `units`.
--
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. What is sold
-- ---------------------------------------------------------------------------

alter table agreements add column if not exists units int
  check (units is null or units > 0);

update agreements set units = lesson_count where units is null and lesson_count is not null;

-- Beginner kit and a pro board are different rentals at different prices.
alter table agreements add column if not exists equipment_level text;

do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'agreements_equipment_level_chk') then
    alter table agreements add constraint agreements_equipment_level_chk
      check (equipment_level is null
             or equipment_level in ('beginner', 'freeride', 'advanced'));
  end if;
end
$c$;

-- Insurance is sold the same way as everything else: agreed, paid, left.
alter table agreements drop constraint if exists agreements_kind_check;
alter table agreements add constraint agreements_kind_check
  check (kind in ('lesson', 'rental', 'kids_camp', 'storage', 'insurance'));

-- A package's lessons are counted from `units` now.
drop view if exists open_packages;
create view open_packages with (security_invoker = false) as
  select a.id                                          as agreement_id,
         a.customer_id,
         a.plan,
         a.label,
         coalesce(a.units, a.lesson_count)             as sold,
         count(b.id)                                   as used,
         coalesce(a.units, a.lesson_count) - count(b.id) as remaining,
         a.created_at
    from agreements a
    left join bookings b
      on b.agreement_id = a.id
     and b.status <> 'rejected'
   where a.kind = 'lesson'
     and coalesce(a.units, a.lesson_count) is not null
     and (app_role() = 'admin' or my_instructor_id() is not null)
   group by a.id, a.customer_id, a.plan, a.label, a.units, a.lesson_count, a.created_at;

drop view if exists agreement_balances;
create view agreement_balances with (security_invoker = false) as
  select a.id,
         a.customer_id,
         c.full_name                                as customer_name,
         c.phone                                    as customer_phone,
         a.kind,
         a.plan,
         a.equipment_level,
         coalesce(a.units, a.lesson_count)          as units,
         a.label,
         a.note,
         a.agreed_amount,
         coalesce(p.paid, 0)                        as paid,
         coalesce(p.received, 0)                    as received,
         coalesce(p.written_off, 0)                 as written_off,
         a.agreed_amount - coalesce(p.paid, 0)      as balance,
         a.created_at,
         case
           when a.kind = 'kids_camp' then (
             select count(distinct date_trunc('day', b.starts_at))
               from bookings b
              where b.customer_id = a.customer_id
                and b.lesson_type = 'kids_camp'
                and b.status <> 'rejected'
           )
         end                                        as camp_days
    from agreements a
    join customers c on c.id = a.customer_id
    left join lateral (
      select sum(amount)                                  as paid,
             sum(amount) filter (where kind = 'payment')  as received,
             sum(amount) filter (where kind = 'writeoff') as written_off
        from payments pm
       where pm.agreement_id = a.id
    ) p on true
   where app_role() = 'admin';

-- ---------------------------------------------------------------------------
-- 2. How an instructor is engaged
--
-- Not a pay rate: nobody asked for one, and a rate sitting unused in a column
-- is a number somebody will eventually trust. This is only what kind of
-- arrangement it is, with room to write down anything that is neither.
-- ---------------------------------------------------------------------------

alter table instructors add column if not exists employment text;
alter table instructors add column if not exists employment_note text;

do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'instructors_employment_chk') then
    alter table instructors add constraint instructors_employment_chk
      check (employment is null or employment in ('salaried', 'freelance', 'other'));
  end if;
end
$c$;

drop view if exists instructor_admin;
create view instructor_admin with (security_invoker = false) as
  select i.id,
         i.name,
         i.sports,
         i.bio,
         i.email,
         i.phone,
         i.employment,
         i.employment_note,
         i.created_at,
         r.user_id as linked_user_id
    from instructors i
    left join user_roles r on r.instructor_id = i.id
   where app_role() = 'admin';

-- Employment is the office's business, not the public calendar's: it is not in
-- the column grants on `instructors`, so it reaches nobody except through here.
revoke all on instructor_admin, open_packages, agreement_balances
  from anonymous, authenticated;
grant select on instructor_admin to authenticated;
grant select on open_packages to authenticated;
grant select on agreement_balances to authenticated;

-- Remember step 3b in the README: the rebuilt views need a schema cache refresh.
