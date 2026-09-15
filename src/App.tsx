import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useT } from './lib/i18n';
import { AuthView, NeonAuthUIProvider, SignedIn, SignedOut } from '@neondatabase/auth-ui';
import type {
  Booking,
  CustomerRef,
  Instructor,
  Interest,
  LessonType,
  ManagedBooking,
  Profile,
  Viewer,
} from './types';
import * as api from './api/client';
import { auth } from './neon';
import { isPast, todayKey } from './lib/date';
import { gridHours, hourKey, isOpenHour, type HourState } from './lib/hours';
import { lessonClass, shortLesson } from './lib/lessons';
import DayNav from './components/DayNav';
import SportFilter, { type SportFilterValue } from './components/SportFilter';
import DayCalendar, { type HourCell } from './components/DayCalendar';
import BookingDialog, { type NewBooking } from './components/BookingDialog';
import MyBookings from './components/MyBookings';
import ProfileDialog from './components/ProfileDialog';
import RequestsPanel from './components/RequestsPanel';
import AdminShell from './components/admin/AdminShell';
import AccountMenu from './components/AccountMenu';
import LangToggle from './components/LangToggle';
import HourActions from './components/HourActions';

const HOUR = 60 * 60 * 1000;

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

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

const GUEST: Viewer = { role: 'customer', instructorId: null };

export default function App() {
  const { t } = useT();
  const session = auth.useSession();
  const signedIn = !!session.data?.user;
  const accountName = session.data?.user?.name ?? '';
  const accountEmail = session.data?.user?.email ?? '';


  const [dateKey, setDateKey] = useState(todayKey());
  const [sport, setSport] = useState<SportFilterValue>('all');
  const [viewer, setViewer] = useState<Viewer>(GUEST);
  const [profile, setProfile] = useState<Profile | null>(null);

  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [busy, setBusy] = useState<Map<string, api.BusyRow>>(new Map());
  const [blocks, setBlocks] = useState<Map<string, string>>(new Map());
  const [ownBookings, setOwnBookings] = useState<Map<string, ManagedBooking>>(new Map());
  const [requests, setRequests] = useState<ManagedBooking[]>([]);
  const [customers, setCustomers] = useState<CustomerRef[]>([]);
  const [myBookings, setMyBookings] = useState<Booking[]>([]);

  const [loadingDay, setLoadingDay] = useState(true);
  const [dayError, setDayError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [dialog, setDialog] = useState<
    { instructor: Instructor; startsAt: Date; lessonType: LessonType } | null
  >(null);
  const [hourMenu, setHourMenu] = useState<{ instructor: Instructor; cell: HourCell } | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [screen, setScreen] = useState<'calendar' | 'admin'>('calendar');
  const [profileOpen, setProfileOpen] = useState(false);
  const [authView, setAuthView] = useState<AuthViewName>('SIGN_IN');
  const [submitting, setSubmitting] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [busyBookingId, setBusyBookingId] = useState<string | null>(null);
  const [busyCellKey, setBusyCellKey] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<string | null>(null);

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);
  const manages = viewer.role === 'admin' || viewer.role === 'instructor';

  // Who is looking, and whether they have finished signing up.
  useEffect(() => {
    let cancelled = false;
    if (!signedIn) {
      setViewer(GUEST);
      setProfile(null);
      return;
    }
    Promise.all([api.getViewer(), api.getProfile()])
      .then(([v, p]) => {
        if (cancelled) return;
        setViewer(v);
        setProfile(p);
        // straight out of sign-up: ask for the missing half
        if (!p) setProfileOpen(true);
      })
      .catch(() => !cancelled && setViewer(GUEST));
    return () => {
      cancelled = true;
    };
  }, [signedIn, reloadToken]);

  // The day: instructors, which hours are taken, which the instructor closed.
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

  // Your own bookings — RLS makes this your rows and nobody else's.
  useEffect(() => {
    let cancelled = false;
    if (!signedIn) {
      setMyBookings([]);
      return;
    }
    api
      .listMyBookings()
      .then((rows) => !cancelled && setMyBookings(rows))
      .catch((err) => !cancelled && setDayError(message(err)));
    return () => {
      cancelled = true;
    };
  }, [signedIn, reloadToken]);

  // What an instructor or admin may act on: this day's detail, and every
  // outstanding request. The view decides the scope, not this code.
  useEffect(() => {
    let cancelled = false;
    if (!manages) {
      setOwnBookings(new Map());
      setRequests([]);
      setCustomers([]);
      return;
    }
    Promise.all([api.listManagedBookings(dateKey), api.listPendingRequests()])
      .then(([day, pending]) => {
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
        setRequests(pending);
        api.listCustomers().then((c) => !cancelled && setCustomers(c)).catch(() => {});
      })
      .catch(() => {
        if (cancelled) return;
        setOwnBookings(new Map());
        setRequests([]);
      });
    return () => {
      cancelled = true;
    };
  }, [manages, dateKey, reloadToken]);

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

  /** An instructor only ever sees their own column. */
  const visibleInstructors = useMemo(() => {
    const bySport =
      sport === 'all' ? instructors : instructors.filter((i) => i.sports.includes(sport));
    if (viewer.role === 'instructor' && viewer.instructorId) {
      return bySport.filter((i) => i.id === viewer.instructorId);
    }
    return bySport;
  }, [instructors, sport, viewer]);

  const instructorsById = useMemo(() => new Map(instructors.map((i) => [i.id, i])), [instructors]);

  /** A booking occupies every hour it spans, not just the first. */
  const myBookingByHour = useMemo(() => {
    const out = new Map<string, Booking>();
    for (const b of myBookings) {
      if (b.status === 'rejected') continue;
      const start = new Date(b.startsAt).getTime();
      for (let i = 0; i < b.durationHours; i++) {
        out.set(hourKey(b.instructorId, new Date(start + i * HOUR)), b);
      }
    }
    return out;
  }, [myBookings]);

  /**
   * Availability is derived, never stored. An hour starts free inside working
   * hours and is downgraded only by something the database actually knows: a
   * booking (pending counts — it holds the slot) or a block.
   */
  const cells = useMemo(() => {
    const now = Date.now();
    const out = new Map<string, HourCell>();

    for (const instructor of visibleInstructors) {
      for (const hour of gridHours(dateKey)) {
        const key = hourKey(instructor.id, hour);
        const mine = myBookingByHour.get(key);
        const blockId = blocks.get(key);
        const taken = busy.get(key);

        const occupant = busy.get(key);

        let state: HourState;
        if (!isOpenHour(hour.getHours())) state = 'closed';
        else if (hour.getTime() + HOUR <= now) state = 'past';
        else if (mine) state = mine.status === 'pending' ? 'mine-pending' : 'mine';
        else if (taken) state = taken.status === 'pending' ? 'pending' : 'taken';
        else if (blockId) state = 'blocked';
        else state = 'free';

        const shape = mine
          ? { lessonType: mine.lessonType, sport: mine.sport, groupSize: mine.groupSize }
          : occupant
            ? { lessonType: occupant.lesson_type, groupSize: occupant.group_size }
            : null;

        out.set(key, {
          instructorId: instructor.id,
          startsAt: hour,
          state,
          bookingId: mine?.id,
          blockId,
          lessonType: shape?.lessonType,
          lessonLabel: shape ? shortLesson(shape) : undefined,
          lessonClass: shape ? lessonClass(shape) : undefined,
        });
      }
    }
    return out;
  }, [visibleInstructors, dateKey, busy, blocks, myBookingByHour]);

  /** How many consecutive hours are bookable from here, capped at three. */
  const freeHoursFrom = useCallback(
    (instructorId: string, start: Date): number => {
      let n = 0;
      for (let i = 0; i < 3; i++) {
        const cell = cells.get(hourKey(instructorId, new Date(start.getTime() + i * HOUR)));
        if (!cell || cell.state !== 'free') break;
        n++;
      }
      return n;
    },
    [cells],
  );

  const upcoming = useMemo(
    () => myBookings.filter((b) => !isPast(b.startsAt.slice(0, 10))),
    [myBookings],
  );

  async function confirmBooking(input: NewBooking) {
    if (!dialog) return;
    setSubmitting(true);
    setBookingError(null);
    try {
      await api.createBooking({
        instructorId: dialog.instructor.id,
        startsAt: dialog.startsAt.toISOString(),
        durationHours: input.durationHours,
        lessonType: input.lessonType,
        sport: input.sport,
        groupSize: input.groupSize,
        userId: input.userId,
      });
      reload();
      setDialog(null);
    } catch (err) {
      setBookingError(message(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function saveProfile(input: { fullName: string; phone: string; interests: Interest[] }) {
    setSavingProfile(true);
    setProfileError(null);
    try {
      await api.saveProfile(input);
      setProfile(await api.getProfile());
      setProfileOpen(false);
    } catch (err) {
      setProfileError(message(err));
    } finally {
      setSavingProfile(false);
    }
  }

  async function decide(bookingId: string, status: 'approved' | 'rejected') {
    setDecidingId(bookingId);
    try {
      await api.decideBooking(bookingId, status);
      reload();
    } catch (err) {
      setDayError(message(err));
    } finally {
      setDecidingId(null);
    }
  }

  async function cancelBooking(bookingId: string) {
    setBusyBookingId(bookingId);
    try {
      await api.cancelBooking(bookingId);
      reload();
    } catch (err) {
      setDayError(message(err));
    } finally {
      setBusyBookingId(null);
    }
  }

  /** Instructors close and reopen their own hours. */
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
    viewer.role === 'admin' ? 'Yönetici' : viewer.role === 'instructor' ? 'Eğitmen' : null;

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
            <div className="account">
              <LangToggle />
              <SignedIn>
                <AccountMenu
                  name={accountName}
                  email={accountEmail}
                  onOpenProfile={() => setProfileOpen(true)}
                />
              </SignedIn>
            </div>
          </header>

          <AdminShell
            instructors={instructors}
            onBackToCalendar={() => setScreen('calendar')}
            onChanged={reload}
          />

          {profileOpen && signedIn && (
            <ProfileDialog
              profile={profile}
              accountName={accountName}
              saving={savingProfile}
              error={profileError}
              onSave={saveProfile}
              onClose={() => setProfileOpen(false)}
            />
          )}
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
              <p>{t('Yerel eğitmenlerle windsurf & wingfoil dersleri')}</p>
            </div>
          </div>

          <div className="account">
            <LangToggle />
            {roleLabel && <span className="role-badge">{t(roleLabel)}</span>}
            {viewer.role === 'admin' && (
              <button className="btn btn--ghost" onClick={() => setScreen('admin')}>
                {t('Yönetim')}
              </button>
            )}
            <SignedIn>
              <AccountMenu
                name={accountName}
                email={accountEmail}
                onOpenProfile={() => setProfileOpen(true)}
              />
            </SignedIn>
            <SignedOut>
              <button className="btn btn--ghost" onClick={() => setAuthOpen(true)}>
                {t('Giriş yap')}
              </button>
            </SignedOut>
          </div>
        </header>

        <main>
          <DayNav dateKey={dateKey} onChange={setDateKey} />

          <div className="toolbar">
            <SportFilter value={sport} onChange={setSport} />
            <span className="count">{t('08:00 – 20:00 arası ders alınabilir')}</span>
          </div>

          {manages && (
            <RequestsPanel
              requests={requests}
              role={viewer.role}
              busyId={decidingId}
              onDecide={decide}
              onGoToDay={setDateKey}
            />
          )}

          <div className="cal-bar">
            <h3 className="section-title">
              {t(viewer.role === 'instructor' ? 'Takvimim' : 'Müsait saatler')}
            </h3>
            <ul className="legend">
              <li className="legend-item legend-item--open">{t('Müsait')}</li>
              <li className="legend-item legend-item--pending">{t('Beklemede')}</li>
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

          {((viewer.role === 'instructor' && viewer.instructorId) || viewer.role === 'admin') && (
            <p className="notice">
              {t(
                viewer.role === 'admin'
                  ? 'Yönetici olarak herhangi bir hocanın saatine tıklayıp kapatabilir, kapalı bir saate tıklayıp açabilirsiniz.'
                  : 'Bir saate tıklayarak kapatabilir, kapalı bir saate tıklayarak yeniden açabilirsiniz.',
              )}
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
              onBook={(instructor, startsAt) => {
                setBookingError(null);
                setDialog({ instructor, startsAt, lessonType: 'individual' });
              }}
              onCancel={cancelBooking}
              onManageHour={(instructor, cell) => setHourMenu({ instructor, cell })}
            />
          )}

          <SignedIn>
            <MyBookings
              bookings={upcoming}
              instructors={instructorsById}
              busyBookingId={busyBookingId}
              onGoToDay={setDateKey}
              onCancel={cancelBooking}
            />
          </SignedIn>
        </main>

        <footer className="footer">
          {t(
            'Müsaitlik ayrı bir tabloda tutulmaz — bir saat yalnızca rezervasyon varsa ya da eğitmen kapattıysa dolu görünür.',
          )}
        </footer>

        {dialog && (
          <BookingDialog
            instructor={dialog.instructor}
            startsAt={dialog.startsAt}
            freeHours={freeHoursFrom(dialog.instructor.id, dialog.startsAt)}
            initialLessonType={dialog.lessonType}
            staff={manages}
            customers={customers}
            signedIn={signedIn}
            hasProfile={profile !== null}
            authView={authView}
            submitting={submitting}
            error={bookingError}
            onConfirm={confirmBooking}
            onCompleteProfile={() => {
              setDialog(null);
              setProfileOpen(true);
            }}
            onClose={() => setDialog(null)}
          />
        )}

        {profileOpen && signedIn && (
          <ProfileDialog
            profile={profile}
            accountName={accountName}
            saving={savingProfile}
            error={profileError}
            onSave={saveProfile}
            onClose={() => setProfileOpen(false)}
          />
        )}

        {hourMenu && (
          <HourActions
            instructor={hourMenu.instructor}
            cell={hourMenu.cell}
            busy={busyCellKey !== null}
            onBlock={async () => {
              const cell = hourMenu.cell;
              setHourMenu(null);
              await toggleBlock(cell);
            }}
            onUnblock={async () => {
              const cell = hourMenu.cell;
              setHourMenu(null);
              await toggleBlock(cell);
            }}
            onCreateLesson={() => {
              setBookingError(null);
              setDialog({
                instructor: hourMenu.instructor,
                startsAt: hourMenu.cell.startsAt,
                lessonType: 'individual',
              });
              setHourMenu(null);
            }}
            onCreateCamp={() => {
              setBookingError(null);
              setDialog({
                instructor: hourMenu.instructor,
                startsAt: hourMenu.cell.startsAt,
                lessonType: 'kids_camp',
              });
              setHourMenu(null);
            }}
            onClose={() => setHourMenu(null)}
          />
        )}

        {authOpen && !signedIn && (
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
