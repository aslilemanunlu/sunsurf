-- Deleting a customer takes their notes with them.
--
-- A note is about a person; with the person gone it is a sentence about nobody.
-- It was blocking the delete instead, and the app then blamed lessons — which
-- is how "I deleted every booking and it still refuses" happens.
--
-- Lessons and agreements still block, deliberately: a lesson that happened is
-- calendar history, and an agreement is money. Neither should disappear because
-- somebody tidied a contact list. The app now names which of them is in the way
-- rather than guessing.
--
-- Safe to re-run.

alter table customer_notes drop constraint if exists customer_notes_customer_id_fkey;
alter table customer_notes
  add constraint customer_notes_customer_id_fkey
  foreign key (customer_id) references customers (id) on delete cascade;
