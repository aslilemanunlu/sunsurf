-- Registering a child for a camp season, and the form that comes with it.
--
-- A camp booking is an hour on a calendar. Registering is a different thing: a
-- child is signed up for a *season*, with a guardian, two people to ring, and a
-- signed form that gets photographed at the desk. That happens once, before any
-- hour is booked, so it cannot hang off a booking.
--
-- The child is a `customers` row — that is where the name, birth date, allergy,
-- guardian and emergency contacts already live, and duplicating them here would
-- create a second version of the truth. This table adds only what is about the
-- season.
--
-- Documents are stored as a data URL in a text column rather than as bytea or
-- in object storage. There is no server of ours to sign an upload with, and the
-- volume is small: a season is tens of children with a page or two each. The
-- app shrinks the picture before sending it, and the CHECK below is the backstop
-- — a phone camera produces 4MB files and none of them need to be.
--
-- Admin only, both tables: a registration form carries a child's medical notes
-- and a parent's phone number.
--
-- Safe to re-run.

create table if not exists camp_registrations (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete cascade,
  -- the year the season starts: 2026 means the 2026 season
  season      int not null check (season between 2020 and 2100),
  note        text,
  created_at  timestamptz not null default now(),
  created_by  text,
  unique (customer_id, season)
);

create index if not exists camp_registrations_season_idx
  on camp_registrations (season, created_at desc);

create table if not exists camp_documents (
  id              uuid primary key default gen_random_uuid(),
  registration_id uuid not null references camp_registrations (id) on delete cascade,
  filename        text,
  -- a data URL: "data:image/jpeg;base64,…"
  data            text not null check (length(data) between 32 and 3500000),
  created_at      timestamptz not null default now(),
  created_by      text
);

create index if not exists camp_documents_registration_idx
  on camp_documents (registration_id, created_at);

alter table camp_registrations enable row level security;
alter table camp_documents enable row level security;

drop policy if exists admin_camp_registrations on camp_registrations;
create policy admin_camp_registrations on camp_registrations
  for all to authenticated
  using (app_role() = 'admin')
  with check (app_role() = 'admin');

drop policy if exists admin_camp_documents on camp_documents;
create policy admin_camp_documents on camp_documents
  for all to authenticated
  using (app_role() = 'admin')
  with check (app_role() = 'admin');

drop trigger if exists camp_registrations_author on camp_registrations;
create trigger camp_registrations_author before insert on camp_registrations
  for each row execute function agreements_set_author();

drop trigger if exists camp_documents_author on camp_documents;
create trigger camp_documents_author before insert on camp_documents
  for each row execute function agreements_set_author();

-- ---------------------------------------------------------------------------
-- The season's roll
--
-- Everything about a registered child in one row, including how many camp hours
-- they have actually been booked for — the registration and the attendance are
-- different questions and both get asked.
--
-- `documents` is a count, not the images: a list of thirty children should not
-- drag thirty photographs across the wire. They are fetched one child at a time.
-- ---------------------------------------------------------------------------

drop view if exists camp_season_roll;
create view camp_season_roll with (security_invoker = false) as
  select r.id                         as registration_id,
         r.season,
         r.note,
         r.created_at,
         c.id                         as customer_id,
         c.full_name                  as child_name,
         c.birth_date,
         case when c.birth_date is not null
              then extract(year from age(c.birth_date))::int
         end                          as age,
         c.allergy_note,
         c.guardian_name,
         c.guardian_phone,
         c.emergency1_name,
         c.emergency1_phone,
         c.emergency2_name,
         c.emergency2_phone,
         (select count(*) from camp_documents d where d.registration_id = r.id) as documents,
         coalesce(b.days, 0)          as days,
         coalesce(b.hours, 0)         as hours
    from camp_registrations r
    join customers c on c.id = r.customer_id
    left join lateral (
      select count(distinct date_trunc('day', bk.starts_at)) as days,
             sum(bk.duration_hours)                          as hours
        from bookings bk
       where bk.customer_id = c.id
         and bk.lesson_type = 'kids_camp'
         and bk.status <> 'rejected'
    ) b on true
   where app_role() = 'admin';

revoke all on camp_registrations, camp_documents, camp_season_roll
  from anonymous, authenticated;
grant select, insert, update, delete on camp_registrations to authenticated;
grant select, insert, delete on camp_documents to authenticated;
grant select on camp_season_roll to authenticated;

-- Remember step 3b in the README: the Data API cannot see `camp_registrations`,
-- `camp_documents` or `camp_season_roll` until the schema cache is refreshed.
