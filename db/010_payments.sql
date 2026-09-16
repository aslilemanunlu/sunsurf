-- Money owed and money taken.
--
-- Four things get sold — lessons, rental, the kids camp, storage — and they all
-- have the same shape: something was agreed, something has been paid, the rest
-- is owed. So there is one table for the agreement and one for the payments
-- against it, rather than four near-identical tables that drift apart.
--
-- A customer may hold several agreements at once: a ten-lesson pack, a season of
-- storage and a week's rental are three rows, not one confused one.
--
-- Balances are never stored. `balance = agreed - paid` is computed in the view
-- every time it is read, because a stored total is a number that can disagree
-- with the payments underneath it, and then nobody knows which one is true.
--
-- Amounts are numeric, not float. Money in binary floating point is how 0.1 +
-- 0.2 stops being 0.3.
--
-- Admin only, both tables. An instructor has no reason to see what anybody owes.
--
-- Safe to re-run.

create table if not exists agreements (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references customers (id),
  kind          text not null check (kind in ('lesson', 'rental', 'kids_camp', 'storage')),
  -- which package or period; 'other' means look at `label`
  plan          text,
  -- free text: what "other" was, or the child's name for a camp
  label         text,
  agreed_amount numeric(10, 2) not null default 0 check (agreed_amount >= 0),
  note          text,
  created_at    timestamptz not null default now(),
  created_by    text
);

create index if not exists agreements_customer_idx on agreements (customer_id, created_at desc);

create table if not exists payments (
  id           uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references agreements (id) on delete cascade,
  amount       numeric(10, 2) not null check (amount > 0),
  -- 'writeoff' is the "clear the balance" button. It settles the account without
  -- pretending cash arrived, so the takings report stays true.
  kind         text not null default 'payment' check (kind in ('payment', 'writeoff')),
  paid_at      timestamptz not null default now(),
  note         text,
  created_by   text
);

create index if not exists payments_agreement_idx on payments (agreement_id, paid_at desc);

alter table agreements enable row level security;
alter table payments enable row level security;

drop policy if exists admin_agreements on agreements;
create policy admin_agreements on agreements
  for all to authenticated
  using (app_role() = 'admin')
  with check (app_role() = 'admin');

drop policy if exists admin_payments on payments;
create policy admin_payments on payments
  for all to authenticated
  using (app_role() = 'admin')
  with check (app_role() = 'admin');

create or replace function agreements_set_author() returns trigger
  language plpgsql
as $fn$
begin
  if current_user in ('anonymous', 'authenticated') then
    new.created_by := jwt_user_id();
  end if;
  return new;
end
$fn$;

drop trigger if exists agreements_set_author on agreements;
create trigger agreements_set_author before insert on agreements
  for each row execute function agreements_set_author();

drop trigger if exists payments_set_author on payments;
create trigger payments_set_author before insert on payments
  for each row execute function agreements_set_author();

-- ---------------------------------------------------------------------------
-- What the payments screen reads
--
-- One row per agreement, with the customer attached and the balance worked out.
-- `camp_days` counts the distinct days that customer is actually booked into a
-- camp — typing that number in by hand would only ever be a second version of
-- something the calendar already knows.
-- ---------------------------------------------------------------------------

drop view if exists agreement_balances;
create view agreement_balances with (security_invoker = false) as
  select a.id,
         a.customer_id,
         c.full_name                                as customer_name,
         c.phone                                    as customer_phone,
         a.kind,
         a.plan,
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
      select sum(amount)                                      as paid,
             sum(amount) filter (where kind = 'payment')      as received,
             sum(amount) filter (where kind = 'writeoff')     as written_off
        from payments pm
       where pm.agreement_id = a.id
    ) p on true
   where app_role() = 'admin';

revoke all on agreements, payments, agreement_balances from anonymous, authenticated;
grant select, insert, update, delete on agreements to authenticated;
grant select, insert, delete on payments to authenticated;
grant select on agreement_balances to authenticated;

-- Remember step 3b in the README: the Data API cannot see `agreements`,
-- `payments` or `agreement_balances` until the schema cache is refreshed.
