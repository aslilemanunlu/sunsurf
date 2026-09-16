-- Customers are tagged with the sport they are here for.
--
-- The list was about what they buy — lessons, rental, storage. Which sport they
-- actually do is a different and more useful question at the desk, so windsurf
-- and wingfoil join it.
--
-- `kids_camp` stays a valid value: a camp registration still tags the child
-- with it, and the customer list still filters by it. It is only gone from the
-- form, where nobody was choosing it by hand.
--
-- Safe to re-run.

alter table customers drop constraint if exists profiles_segments_chk;
alter table customers drop constraint if exists customers_segments_chk;
alter table customers add constraint customers_segments_chk
  check (segments <@ array['lesson', 'storage', 'rental', 'kids_camp', 'windsurf', 'wingfoil']);
