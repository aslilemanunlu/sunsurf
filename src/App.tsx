import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AuthView,
  NeonAuthUIProvider,
  SignedIn,
  SignedOut,
  UserButton,
} from '@neondatabase/auth-ui';
import type { SlotWithInstructor } from './types';
import * as api from './api/client';
import { auth } from './neon';
import { isPast, todayKey } from './lib/date';
import DayNav from './components/DayNav';
import SportFilter, { type SportFilterValue } from './components/SportFilter';
import DayCalendar from './components/DayCalendar';
import BookingDialog from './components/BookingDialog';
import MyBookings from './components/MyBookings';

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** The auth views we let the dialog switch between. */
type AuthViewName = 'SIGN_IN' | 'SIGN_UP' | 'FORGOT_PASSWORD';

/**
 * Neon's auth UI navigates between sign-in, sign-up and forgot-password by
 * changing the URL, which this app has no routes for — left alone it reloads
 * the page and throws the dialog away. Mapping its hrefs back to a view name
 * keeps the whole flow inside the dialog.
 */
function viewForHref(href: string): AuthViewName {
  const last = href.split('?')[0].split('/').filter(Boolean).pop() ?? '';
  if (last === 'sign-up') return 'SIGN_UP';
  if (last === 'forgot-password') return 'FORGOT_PASSWORD';
  return 'SIGN_IN';
}

export default function App() {
  const session = auth.useSession();
  const signedIn = !!session.data?.user;

  const [dateKey, setDateKey] = useState(todayKey());
  const [sport, setSport] = useState<SportFilterValue>('all');

  const [slots, setSlots] = useState<SlotWithInstructor[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [bookings, setBookings] = useState<api.BookingWithSlot[]>([]);
  const [dialogSlot, setDialogSlot] = useState<SlotWithInstructor | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authView, setAuthView] = useState<AuthViewName>('SIGN_IN');
  const [submitting, setSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [busyBookingId, setBusyBookingId] = useState<string | null>(null);

  // Day's classes — reloaded whenever the selected day changes.
  useEffect(() => {
    let cancelled = false;
    setLoadingSlots(true);
    setSlotsError(null);
    api
      .listSlots(dateKey)
      .then((result) => {
        if (cancelled) return;
        setSlots(result);
        setLoadingSlots(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setSlots([]);
        setSlotsError(message(err));
        setLoadingSlots(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dateKey, reloadToken]);

  /**
   * Bookings are readable only by their owner, so signing out simply empties
   * this list rather than needing a separate code path.
   */
  const refreshBookings = useCallback(async () => {
    if (!signedIn) {
      setBookings([]);
      return;
    }
    const rows = await api.listBookings();
    setBookings([...rows].sort((a, b) => a.slot.startsAt.localeCompare(b.slot.startsAt)));
  }, [signedIn]);

  useEffect(() => {
    refreshBookings().catch((err) => setSlotsError(message(err)));
  }, [refreshBookings]);

  // Signing in from the header dismisses the auth dialog on its own.
  useEffect(() => {
    if (signedIn) setAuthOpen(false);
  }, [signedIn]);

  const navigateAuth = useCallback((href: string) => setAuthView(viewForHref(href)), []);

  const AuthLink = useCallback(
    ({ href, className, children }: { href: string; className?: string; children: ReactNode }) => (
      <a
        href={href}
        className={className}
        onClick={(e) => {
          e.preventDefault();
          navigateAuth(href);
        }}
      >
        {children}
      </a>
    ),
    [navigateAuth],
  );

  const visibleSlots = useMemo(
    () => (sport === 'all' ? slots : slots.filter((s) => s.sport === sport)),
    [slots, sport],
  );

  const bookedSlotIds = useMemo(() => new Set(bookings.map((b) => b.slotId)), [bookings]);
  const upcoming = useMemo(
    () => bookings.filter((b) => !isPast(b.slot.startsAt.slice(0, 10))),
    [bookings],
  );

  async function confirmBooking() {
    if (!dialogSlot) return;
    setSubmitting(true);
    setBookingError(null);
    try {
      await api.createBooking(dialogSlot.id);
      await refreshBookings();
      setDialogSlot(null);
    } catch (err) {
      setBookingError(message(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelByBookingId(bookingId: string) {
    setBusyBookingId(bookingId);
    try {
      await api.cancelBooking(bookingId);
      await refreshBookings();
    } catch (err) {
      setSlotsError(message(err));
    } finally {
      setBusyBookingId(null);
    }
  }

  async function cancelBySlotId(slotId: string) {
    const booking = bookings.find((b) => b.slotId === slotId);
    if (booking) await cancelByBookingId(booking.id);
  }

  async function goToNextDayWithSlots() {
    try {
      const next = await api.findNextDayWithSlots(dateKey, 1);
      if (next) setDateKey(next);
    } catch (err) {
      setSlotsError(message(err));
    }
  }

  const busySlotId =
    busyBookingId === null ? null : (bookings.find((b) => b.id === busyBookingId)?.slotId ?? null);

  return (
    <NeonAuthUIProvider
      authClient={auth}
      navigate={navigateAuth}
      replace={navigateAuth}
      Link={AuthLink}
    >
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              ≈
            </span>
            <div>
              <h1>Windfoil</h1>
              <p>Windsurf &amp; wingfoil classes with local instructors</p>
            </div>
          </div>

          <div className="account">
            <SignedIn>
              <UserButton size="icon" />
            </SignedIn>
            <SignedOut>
              <button className="btn btn--ghost" onClick={() => setAuthOpen(true)}>
                Sign in
              </button>
            </SignedOut>
          </div>
        </header>

        <main>
          <DayNav dateKey={dateKey} onChange={setDateKey} />

          <div className="toolbar">
            <SportFilter value={sport} onChange={setSport} />
            {!loadingSlots && visibleSlots.length > 0 && (
              <span className="count">
                {visibleSlots.length} {visibleSlots.length === 1 ? 'class' : 'classes'}
              </span>
            )}
          </div>

          <div className="cal-bar">
            <h3 className="section-title">Available classes</h3>
            <ul className="legend">
              <li className="legend-item legend-item--open">Available</li>
              <li className="legend-item legend-item--booked">Booked</li>
              <li className="legend-item legend-item--past">Past</li>
            </ul>
          </div>

          {slotsError ? (
            <div className="empty">
              <p className="empty-title">Couldn’t reach the schedule</p>
              <p className="empty-sub">{slotsError}</p>
              <button className="btn btn--ghost" onClick={() => setReloadToken((n) => n + 1)}>
                Try again
              </button>
            </div>
          ) : (
            <DayCalendar
              slots={visibleSlots}
              loading={loadingSlots}
              filtered={sport !== 'all' && slots.length > 0}
              bookedSlotIds={bookedSlotIds}
              busySlotId={busySlotId}
              onBook={(slot) => {
                setBookingError(null);
                setDialogSlot(slot);
              }}
              onCancel={cancelBySlotId}
              onFindNext={goToNextDayWithSlots}
            />
          )}

          <SignedIn>
            <MyBookings
              bookings={upcoming}
              busyBookingId={busyBookingId}
              onGoToDay={setDateKey}
              onCancel={cancelByBookingId}
            />
          </SignedIn>
        </main>

        <footer className="footer">
          Prototype — classes are sample data in a Neon Postgres database.
        </footer>

        {dialogSlot && (
          <BookingDialog
            slot={dialogSlot}
            signedIn={signedIn}
          authView={authView}
            submitting={submitting}
            error={bookingError}
            onConfirm={confirmBooking}
            onClose={() => setDialogSlot(null)}
          />
        )}

        {authOpen && !signedIn && (
          <div className="overlay" onClick={() => setAuthOpen(false)}>
            <div
              className="dialog dialog--auth"
              role="dialog"
              aria-modal="true"
              aria-label="Sign in"
              onClick={(e) => e.stopPropagation()}
            >
              <AuthView view={authView} />
            </div>
          </div>
        )}
      </div>
    </NeonAuthUIProvider>
  );
}
