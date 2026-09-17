-- Each season's registration keeps its own copy of the form.
--
-- The guardian, the allergy and the two people to ring used to be read from the
-- child's customer record, which every season shares. So bringing a child back
-- for 2027 and correcting the guardian's phone silently rewrote what the 2026
-- form said — the signed paper from last year and the screen would disagree.
--
-- A registration is a record of what was written on the form that season, so it
-- holds those details itself. The customer row stays the child's identity: it is
-- what links 2026 and 2027 to the same person, and it is where their lessons and
-- payments hang. It is not where last season's form lives.
--
-- Existing registrations are filled from the customer record once, which is what
-- they were showing until now.
--
-- Safe to re-run.

alter table camp_registrations add column if not exists child_name       text;
alter table camp_registrations add column if not exists birth_date       date;
alter table camp_registrations add column if not exists allergy_note     text;
alter table camp_registrations add column if not exists guardian_name    text;
alter table camp_registrations add column if not exists guardian_phone   text;
alter table camp_registrations add column if not exists emergency1_name  text;
alter table camp_registrations add column if not exists emergency1_phone text;
alter table camp_registrations add column if not exists emergency2_name  text;
alter table camp_registrations add column if not exists emergency2_phone text;
alter table camp_registrations add column if not exists updated_at       timestamptz;

update camp_registrations r
   set child_name       = c.full_name,
       birth_date       = c.birth_date,
       allergy_note     = c.allergy_note,
       guardian_name    = c.guardian_name,
       guardian_phone   = c.guardian_phone,
       emergency1_name  = c.emergency1_name,
       emergency1_phone = c.emergency1_phone,
       emergency2_name  = c.emergency2_name,
       emergency2_phone = c.emergency2_phone
  from customers c
 where c.id = r.customer_id
   and r.child_name is null;

drop view if exists camp_season_roll;
create view camp_season_roll with (security_invoker = false) as
  select r.id                                             as registration_id,
         r.season,
         r.note,
         r.created_at,
         r.updated_at,
         r.customer_id,
         coalesce(r.child_name, c.full_name)              as child_name,
         r.birth_date,
         case when r.birth_date is not null
              then extract(year from age(r.birth_date))::int
         end                                              as age,
         r.allergy_note,
         r.guardian_name,
         r.guardian_phone,
         r.emergency1_name,
         r.emergency1_phone,
         r.emergency2_name,
         r.emergency2_phone,
         (select count(*) from camp_documents d where d.registration_id = r.id) as documents,
         coalesce(b.days, 0)                              as days,
         coalesce(b.hours, 0)                             as hours
    from camp_registrations r
    join customers c on c.id = r.customer_id
    left join lateral (
      select count(distinct date_trunc('day', bk.starts_at)) as days,
             sum(bk.duration_hours)                          as hours
        from bookings bk
       where bk.customer_id = c.id
         and bk.lesson_type = 'kids_camp'
         and bk.status <> 'rejected'
         and extract(year from bk.starts_at) = r.season
    ) b on true
   where app_role() = 'admin';

revoke all on camp_season_roll from anonymous, authenticated;
grant select on camp_season_roll to authenticated;

-- Remember step 3b in the README: `camp_season_roll` was rebuilt.
