-- A customer may cancel up to 12 hours before the lesson starts.
--
-- The rule lives here rather than in the browser for the usual reason: the
-- client can be edited, a row-level policy cannot. `canCancel()` in the app
-- checks the same clock, but only so it can grey the button out and explain
-- why — the refusal below is the one that counts.
--
-- A *pending* request is exempt. Nobody has committed to it yet and, because a
-- pending request holds the hour against everyone else, refusing to let it go
-- would lock a slot that nobody is going to teach.
--
-- Instructors are unchanged: they reject a request rather than delete it. An
-- admin may still cancel anything, at any time.
--
-- Safe to re-run.

-- The window as a function so the policy reads as the rule it is. The app keeps
-- its own copy in src/lib/hours.ts — change one and change the other.
create or replace function cancellation_window_hours() returns integer
  language sql immutable
as $fn$ select 12 $fn$;

drop policy if exists delete_own_booking on bookings;
create policy delete_own_booking on bookings
  for delete to authenticated
  using (
    app_role() = 'admin'
    or (
      auth.user_id() = user_id
      and (
        status = 'pending'
        or starts_at - now() >= make_interval(hours => cancellation_window_hours())
      )
    )
  );

grant execute on function cancellation_window_hours() to anonymous, authenticated;

-- ---------------------------------------------------------------------------
-- Why the app cannot simply watch for an error
--
-- A DELETE that RLS filters out is not an error: it matches no rows and comes
-- back as a success having deleted nothing. So `cancelBooking` asks for the
-- deleted rows back (`.delete().select()`) and treats an empty result as a
-- refusal — the only way to tell "cancelled" apart from "silently did nothing".
-- ---------------------------------------------------------------------------
