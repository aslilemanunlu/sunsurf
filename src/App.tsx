import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useT } from './lib/i18n';
import { AuthView, NeonAuthUIProvider, SignedIn, SignedOut } from '@neondatabase/auth-ui';
import type {
  AuthViewName,
  CustomerRef,
  Instructor,
  LessonType,
  ManagedBooking,
  Viewer,
} from './types';
import * as api from './api/client';
import { auth } from './neon';
import { todayKey } from './lib/date';
import { gridHours, hourKey, isOpenHour, MAX_DURATION, type HourState } from './lib/hours';
import { lessonClass, shortLesson } from './lib/lessons';
import DayNav from './components/DayNav';
import SportFilter, { type SportFilterValue } from './components/SportFilter';
import DayCalendar, { type HourCell } from './components/DayCalendar';
import BookingDialog, { type NewBooking } from './components/BookingDialog';
import AdminShell from './components/admin/AdminShell';
import AccountMenu from './components/AccountMenu';
import LangToggle from './components/LangToggle';
import HourActions from './components/HourActions';
import LeaveDialog from './components/LeaveDialog';

const HOUR = 60 * 60 * 1000;

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const AUTH_VIEWS: Record<string, AuthViewName> = {
  'sign-in': 'SIGN_IN',
  'sign-up': 'SIGN_UP',
  'forgot-password': 'FORGOT_PASSWORD',
  'reset-password': 'RESET_PASSWORD',
};

/**
 * Neon's auth UI navigates between its screens by changing the URL, which this
 * app has no routes for — left alone it reloads the page and throws the dialog
 * away. Mapping its hrefs back to a view name keeps the flow inside the dialog.
 *
 * Null means the href is not one of its screens, which is how it says the flow
 * is over: after a successful sign-in it navigates to `/`.
 */
function viewForHref(href: string): AuthViewName | null {
  const last = href.split('?')[0].split('/').filter(Boolean).pop() ?? '';
  return AUTH_VIEWS[last] ?? null;
}

/**
 * The reset link in the password email points at /auth/reset-password?token=…
 * on this origin. The app has no router, so that path used to render the plain
 * calendar and the token was never read — which is what "forgot password does
 * nothing" looked like. Anything that lands on an auth path opens the dialog on
 * that view instead; the reset form reads the token from the query itself.
 */
function authViewFromLocation(): AuthViewName | null {
  const last = window.location.pathname.split('/').filter(Boolean).pop() ?? '';
  if (last === 'reset-password') return 'RESET_PASSWORD';
  if (last === 'forgot-password') return 'FORGOT_PASSWORD';
  if (last === 'sign-up') return 'SIGN_UP';
  if (last === 'sign-in') return 'SIGN_IN';
  return null;
}

/** A visitor, or an account nobody has given a job to yet. Reads, nothing else. */
const GUEST: Viewer = { role: 'customer', isOwner: false, instructorId: null };

export default function App() {
  const { t } = useT();
  const session = auth.useSession();
  const signedIn = !!session.data?.user;
  const accountName = session.data?.user?.name ?? '';
  const accountEmail = session.data?.user?.email ?? '';

  const [dateKey, setDateKey] = useState(todayKey());
  const [sport, setSport] = useState<SportFilterValue>('all');
  const [viewer, setViewer] = useState<Viewer>(GUEST);

  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [busy, setBusy] = useState<Map<string, api.BusyRow>>(new Map());
  const [blocks, setBlocks] = useState<Map<string, string>>(new Map());
  const [ownBookings, setOwnBookings] = useState<Map<string, ManagedBooking>>(new Map());
  const [customers, setCustomers] = useState<CustomerRef[]>([]);

  const [loadingDay, setLoadingDay] = useState(true);
  const [dayError, setDayError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [dialog, setDialog] = useState<{
    instructor: Instructor;
    startsAt: Date;
    lessonType: LessonType;
    /** Hours dragged out on the grid, when that is how it was opened. */
    duration?: number;
  } | null>(null);
  const [hourMenu, setHourMenu] = useState<{
    instructor: Instructor;
    cell: HourCell;
    /** Hours dragged out on the grid, when that is how the menu was opened. */
    hours?: number;
  } | null>(null);
  const [authOpen, setAuthOpen] = useState(() => authViewFromLocation() !== null);
  const [screen, setScreen] = useState<'calendar' | 'admin'>('calendar');
  const [authView, setAuthView] = useState<AuthViewName>(() => authViewFromLocation() ?? 'SIGN_IN');
  const [submitting, setSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [busyCellKey, setBusyCellKey] = useState<string | null>(null);

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);
  const manages = viewer.role === 'admin' || viewer.role === 'instructor';

  // What this account may do. Nothing, until an admin says otherwise.
  useEffect(() => {
    let cancelled = false;
    if (!signedIn) {
      setViewer(GUEST);
      return;
    }
    api
      .getViewer()
      .then((v) => !cancelled && setViewer(v))
      .catch(() => !cancelled && setViewer(GUEST));
    return () => {
      cancelled = true;
    };
  }, [signedIn, reloadToken]);

  // The day, as anyone may see it: instructors, which hours are taken, and
  // which the instructor closed. None of this needs an account.
  useEffect(() => {
    let cancelled = false;
    setLoadingDay(true);
    setDayError(null);

    (async () => {
      const [ins, busyRows, blockRows] = await Promise.all([
        api.listInstructors(),
        api.listBusyHours(dateKey),
        api.listBlockedHours(dateKey),
      ]);
      if (cancelled) return;

      setInstructors(ins);
      setBusy(new Map(busyRows.map((r) => [hourKey(r.instructor_id, r.starts_at), r])));
      setBlocks(new Map(blockRows.map((b) => [hourKey(b.instructorId, b.startsAt), b.id])));
    })()
      .catch((err) => !cancelled && setDayError(message(err)))
      .finally(() => !cancelled && setLoadingDay(false));

    return () => {
      cancelled = true;
    };
  }, [dateKey, reloadToken]);

  // What staff may act on: this day's bookings with the customer attached, and
  // the list of customers they can book. The view decides the scope, not this.
  useEffect(() => {
    let cancelled = false;
    if (!manages) {
      setOwnBookings(new Map());
      setCustomers([]);
      return;
    }
    api
      .listManagedBookings(dateKey)
      .then((day) => {
        if (cancelled) return;
        const byHour = new Map<string, ManagedBooking>();
        for (const b of day) {
          if (b.status === 'rejected') continue;
          const start = new Date(b.startsAt).getTime();
          for (let i = 0; i < b.durationHours; i++) {
            byHour.set(hourKey(b.instructorId, new Date(start + i * HOUR)), b);
          }
        }
        setOwnBookings(byHour);
      })
      .catch(() => !cancelled && setOwnBookings(new Map()));

    api
      .listCustomers()
      .then((c) => !cancelled && setCustomers(c))
      .catch((err) => {
        // Usually a Data API schema cache that has not been refreshed since the
        // customers table was added. Booking still works — a name typed in
        // creates a record — so this warns rather than blocking the screen.
        console.warn('customer list unavailable:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [manages, dateKey, reloadToken]);

  useEffect(() => {
    if (signedIn && authView !== 'RESET_PASSWORD') setAuthOpen(false);
  }, [signedIn, authView]);

  const navigateAuth = useCallback((href: string) => {
    const next = viewForHref(href);

    // Leaving its own screens is how the auth UI says the flow finished. This
    // used to fall through to SIGN_IN, so a successful sign-in left the dialog
    // sitting there looking like nothing had happened. The session is a cookie
    // the session hook has already read once, so the page is reloaded rather
    // than nudged: signing in happens rarely and being certain beats being
    // smooth.
    if (!next) {
      window.location.replace('/');
      return;
    }

    setAuthView(next);
    // The reset form reads its token from the query string, so the URL may only
    // be tidied once we have left that view — otherwise a refresh mid-reset
    // loses the token and the form silently has nothing to submit.
    if (next !== 'RESET_PASSWORD' && window.location.pathname !== '/') {
      window.history.replaceState(null, '', '/');
    }
  }, []);

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

  /**
   * Everybody sees every column. What differs is the detail: an instructor's
   * own column shows who each lesson is for, and the rest show only whether the
   * hour is taken — which is what `busy_hours` gives anyone anyway.
   */
  const visibleInstructors = useMemo(
    () => (sport === 'all' ? instructors : instructors.filter((i) => i.sports.includes(sport))),
    [instructors, sport],
  );

  /**
   * Availability is derived, never stored. An hour starts free inside working
   * hours and is downgraded only by something the database actually knows: a
   * booking, or a block.
   */
  const cells = useMemo(() => {
    const now = Date.now();
    const out = new Map<string, HourCell>();

    for (const instructor of visibleInstructors) {
      for (const hour of gridHours(dateKey)) {
        const key = hourKey(instructor.id, hour);
        const blockId = blocks.get(key);
        const occupant = busy.get(key);
        const own = ownBookings.get(key);

        let state: HourState;
        if (!isOpenHour(hour.getHours())) state = 'closed';
        else if (hour.getTime() + HOUR <= now) state = 'past';
        else if (occupant) state = occupant.status === 'pending' ? 'pending' : 'taken';
        else if (blockId) state = 'blocked';
        else state = 'free';

        // Outside the school a booked hour is just booked. A camp is the one
        // exception: it is the thing people ring up to ask about.
        const label =
          occupant && (manages || occupant.lesson_type === 'kids_camp')
            ? shortLesson({ lessonType: occupant.lesson_type, groupSize: null })
            : undefined;

        out.set(key, {
          instructorId: instructor.id,
          startsAt: hour,
          state,
          blockId,
          bookingId: own?.id,
          lessonType: occupant?.lesson_type,
          lessonLabel: label,
          lessonClass: occupant
            ? lessonClass({ lessonType: occupant.lesson_type, groupSize: null })
            : undefined,
        });
      }
    }
    return out;
  }, [visibleInstructors, dateKey, busy, blocks, ownBookings, manages]);

  /** How many consecutive hours are bookable from here. */
  const freeHoursFrom = useCallback(
    (instructorId: string, start: Date): number => {
      let n = 0;
      for (let i = 0; i < MAX_DURATION; i++) {
        const cell = cells.get(hourKey(instructorId, new Date(start.getTime() + i * HOUR)));
        if (!cell || cell.state !== 'free') break;
        n++;
      }
      return n;
    },
    [cells],
  );

  async function confirmBooking(input: NewBooking) {
    if (!dialog) return;
    setSubmitting(true);
    setBookingError(null);
    try {
      const base = {
        instructorId: dialog.instructor.id,
        startsAt: dialog.startsAt.toISOString(),
        durationHours: input.durationHours,
        lessonType: input.lessonType,
        sport: input.sport,
        groupSize: input.groupSize,
        customerId: input.customerId,
        agreementId: input.agreementId,
        tentative: input.tentative,
      };

      if (input.dates.length > 1) {
        const { created, skipped } = await api.createBookingSeries(base, input.dates);
        setNotice(
          t('{a} ders yazıldı, {b} saat dolu olduğu için atlandı.')
            .replace('{a}', String(created))
            .replace('{b}', String(skipped)),
        );
      } else {
        await api.createBooking(base);
      }
      reload();
      setDialog(null);
    } catch (err) {
      setBookingError(message(err));
    } finally {
      setSubmitting(false);
    }
  }

  /** A stray tap should not destroy a lesson, so the grid asks first. */
  async function cancelFromCalendar(bookingId: string) {
    const booking = [...ownBookings.values()].find((b) => b.id === bookingId);
    const soon = booking && new Date(booking.startsAt).getTime() - Date.now() < 12 * HOUR;
    const question = soon
      ? t('Bu ders 12 saatten yakın. Yine de silinsin mi?')
      : t('Bu dersi iptal etmek istediğinize emin misiniz?');
    if (!window.confirm(question)) return;

    setBusyCellKey(null);
    try {
      await api.cancelBooking(bookingId);
      reload();
    } catch (err) {
      setDayError(message(err));
    }
  }

  /** Closing a whole dragged run, rather than one hour at a time. */
  async function blockSpan(instructorId: string, start: Date, hours: number) {
    setBusyCellKey(hourKey(instructorId, start));
    try {
      const all = Array.from({ length: hours }, (_, i) =>
        new Date(start.getTime() + i * HOUR).toISOString(),
      );
      await api.blockRange(instructorId, all);
      reload();
    } catch (err) {
      setDayError(message(err));
    } finally {
      setBusyCellKey(null);
    }
  }

  /** Staff close and reopen hours. An admin may do it on any calendar. */
  async function toggleBlock(cell: HourCell) {
    const key = hourKey(cell.instructorId, cell.startsAt);
    setBusyCellKey(key);
    try {
      if (cell.blockId) await api.unblockHour(cell.blockId);
      else await api.blockHour(cell.instructorId, cell.startsAt.toISOString());
      reload();
    } catch (err) {
      setDayError(message(err));
    } finally {
      setBusyCellKey(null);
    }
  }

  const roleLabel =
    viewer.isOwner
      ? 'Yönetici'
      : viewer.role === 'admin'
        ? 'Admin'
        : viewer.role === 'instructor'
          ? 'Eğitmen'
          : null;

  const account = (
    <div className="account">
      <LangToggle />
      {roleLabel && <span className="role-badge">{t(roleLabel)}</span>}
      {viewer.role === 'admin' && screen === 'calendar' && (
        <button className="btn btn--ghost" onClick={() => setScreen('admin')}>
          {t('Yönetim')}
        </button>
      )}
      <SignedIn>
        <AccountMenu name={accountName} email={accountEmail} />
      </SignedIn>
      <SignedOut>
        <button className="btn btn--ghost" onClick={() => setAuthOpen(true)}>
          {t('Giriş yap')}
        </button>
      </SignedOut>
    </div>
  );

  // The admin panel is its own screen rather than a route: there is no router,
  // and it shares nothing with the calendar but the header.
  if (screen === 'admin' && viewer.role === 'admin') {
    return (
      <NeonAuthUIProvider
        authClient={auth}
        navigate={navigateAuth}
        replace={navigateAuth}
        Link={AuthLink}
      >
        <div className="app app--wide">
          <header className="topbar">
            <div className="brand">
              <img className="brand-mark" src="/logo.jpg" alt="Sun Surf Alaçatı" />
              <div>
                <h1>{t('Yönetim')}</h1>
                <p>Sun Surf Alaçatı</p>
              </div>
            </div>
            {account}
          </header>

          <AdminShell
            viewer={viewer}
            instructors={instructors}
            onBackToCalendar={() => setScreen('calendar')}
            onChanged={reload}
          />
        </div>
      </NeonAuthUIProvider>
    );
  }

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
            <img className="brand-mark" src="/logo.jpg" alt="Sun Surf Alaçatı" />
            <div>
              <h1>Sun Surf Alaçatı</h1>
            </div>
          </div>
          {account}
        </header>

        <main>
          <DayNav dateKey={dateKey} onChange={setDateKey} />

          <div className="toolbar">
            <SportFilter value={sport} onChange={setSport} />
            {manages && (
              <button className="btn btn--ghost btn--small" onClick={() => setLeaveOpen(true)}>
                {t('İzin / gün kapat')}
              </button>
            )}
            <span className="count">{t('08:00 – 20:00 arası ders alınabilir')}</span>
          </div>

          <div className="cal-bar">
            <h3 className="section-title">
              {t('Ders programı')}
            </h3>
            <ul className="legend">
              <li className="legend-item legend-item--open">{t('Müsait')}</li>
              <li className="legend-item legend-item--booked">{t('Dolu')}</li>
              <li className="legend-item legend-item--past">{t('Kapalı')}</li>
            </ul>
          </div>

          {viewer.role === 'instructor' && !viewer.instructorId && (
            <p className="notice">
              {t(
                'Hesabınız eğitmen olarak işaretli ama henüz bir hocaya bağlanmamış. Yöneticinin sizi eşleştirmesi gerekiyor.',
              )}
            </p>
          )}

          {manages && (
            <p className="notice">
              {t(
                viewer.role === 'admin'
                  ? 'Bir saate tıklayarak ders yazabilir, çocuk kampı açabilir ya da saati bloke edebilirsiniz — her hocanın takviminde.'
                  : 'Kendi takviminizde bir saate tıklayarak ders yazabilir ya da saati bloke edebilirsiniz.',
              )}
            </p>
          )}

          {notice && (
            <p className="notice notice--done" onClick={() => setNotice(null)}>
              {notice}
            </p>
          )}

          {dayError ? (
            <div className="empty">
              <p className="empty-title">{t('Takvime ulaşılamadı')}</p>
              <p className="empty-sub">{dayError}</p>
              <button className="btn btn--ghost" onClick={reload}>
                {t('Tekrar dene')}
              </button>
            </div>
          ) : (
            <DayCalendar
              instructors={visibleInstructors}
              cells={cells}
              loading={loadingDay}
              dateKey={dateKey}
              viewer={viewer}
              ownBookings={ownBookings}
              busyKey={busyCellKey}
              onManageHour={(instructor, cell) => setHourMenu({ instructor, cell })}
              onSelectRange={(instructor, startsAt, hours) => {
                setBookingError(null);
                setHourMenu({
                  instructor,
                  cell: { instructorId: instructor.id, startsAt, state: 'free' },
                  hours,
                });
              }}
            />
          )}
        </main>

        {dialog && (
          <BookingDialog
            instructor={dialog.instructor}
            startsAt={dialog.startsAt}
            freeHours={freeHoursFrom(dialog.instructor.id, dialog.startsAt)}
            initialLessonType={dialog.lessonType}
            initialDuration={dialog.duration}
            customers={customers}
            submitting={submitting}
            error={bookingError}
            onConfirm={confirmBooking}
            onCustomerAdded={() => {
              api
                .listCustomers()
                .then(setCustomers)
                .catch(() => {});
            }}
            onClose={() => setDialog(null)}
          />
        )}

        {leaveOpen && (
          <LeaveDialog
            instructors={instructors}
            viewer={viewer}
            onClose={() => setLeaveOpen(false)}
            onDone={(message) => {
              setLeaveOpen(false);
              setNotice(message);
              reload();
            }}
          />
        )}

        {hourMenu && (
          <HourActions
            instructor={hourMenu.instructor}
            cell={hourMenu.cell}
            hours={hourMenu.hours}
            busy={busyCellKey !== null}
            onBlock={async () => {
              const { cell, instructor, hours } = hourMenu;
              setHourMenu(null);
              if (hours && hours > 1) {
                await blockSpan(instructor.id, cell.startsAt, hours);
              } else {
                await toggleBlock(cell);
              }
            }}
            onUnblock={async () => {
              const cell = hourMenu.cell;
              setHourMenu(null);
              await toggleBlock(cell);
            }}
            onCancelBooking={async () => {
              const { cell, instructor } = hourMenu;
              const id =
                cell.bookingId ?? ownBookings.get(hourKey(instructor.id, cell.startsAt))?.id;
              setHourMenu(null);
              if (id) {
                await cancelFromCalendar(id);
              } else {
                setDayError(t('Bu saatteki ders bulunamadı; sayfayı yenileyip tekrar deneyin.'));
              }
            }}
            onCreateLesson={() => {
              setBookingError(null);
              setDialog({
                instructor: hourMenu.instructor,
                startsAt: hourMenu.cell.startsAt,
                lessonType: 'individual',
                duration: hourMenu.hours,
              });
              setHourMenu(null);
            }}
            onCreateCamp={() => {
              setBookingError(null);
              setDialog({
                instructor: hourMenu.instructor,
                startsAt: hourMenu.cell.startsAt,
                lessonType: 'kids_camp',
                duration: hourMenu.hours,
              });
              setHourMenu(null);
            }}
            onClose={() => setHourMenu(null)}
          />
        )}

        {authOpen && (!signedIn || authView === 'RESET_PASSWORD') && (
          <div className="overlay" onClick={() => setAuthOpen(false)}>
            <div
              className="dialog dialog--auth"
              role="dialog"
              aria-modal="true"
              aria-label={t('Giriş')}
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
