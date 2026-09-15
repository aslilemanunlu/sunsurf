import type { Instructor, LessonType, ManagedBooking, Viewer } from '../types';
import { locale, useT } from '../lib/i18n';
import { GRID_START_HOUR, gridHours, hourKey, isOpenHour, type HourState } from '../lib/hours';
import { SPORT_LABEL, shortLesson } from '../lib/lessons';

const STATE_LABEL: Record<HourState, string> = {
  closed: '',
  past: 'Geçmiş',
  blocked: 'Bloke',
  pending: 'Beklemede',
  taken: 'Dolu',
  'mine-pending': 'Talebiniz',
  mine: '✓ Rezerve',
  free: 'Müsait',
};

export type HourCell = {
  instructorId: string;
  startsAt: Date;
  state: HourState;
  bookingId?: string;
  blockId?: string;
  /** What kind of thing occupies this hour, when something does. */
  lessonType?: LessonType;
  lessonLabel?: string;
  lessonClass?: string;
};

type Props = {
  instructors: Instructor[];
  cells: Map<string, HourCell>;
  loading: boolean;
  dateKey: string;
  viewer: Viewer;
  /** Bookings on a calendar the viewer manages, keyed by hourKey. */
  ownBookings: Map<string, ManagedBooking>;
  busyKey: string | null;
  onBook: (instructor: Instructor, startsAt: Date) => void;
  onCancel: (bookingId: string) => void;
  /** Staff clicked a free or blocked hour — App opens the little action menu. */
  onManageHour: (instructor: Instructor, cell: HourCell) => void;
};

export default function DayCalendar({
  instructors,
  cells,
  loading,
  dateKey,
  viewer,
  ownBookings,
  busyKey,
  onBook,
  onCancel,
  onManageHour,
}: Props) {
  const { t } = useT();
  if (loading) {
    return <div className="cal-skeleton" aria-busy="true" />;
  }

  if (instructors.length === 0) {
    return (
      <div className="empty">
        <p className="empty-title">{t('Bu filtreye uyan eğitmen yok')}</p>
        <p className="empty-sub">{t('“Tümü”nü deneyin.')}</p>
      </div>
    );
  }

  const hours = gridHours(dateKey);

  return (
    <div className="cal-scroll" style={{ ['--cols' as string]: instructors.length }}>
      <div className="cal">
        <div className="cal-corner" />
        {instructors.map((ins) => (
          <div className="cal-head" key={`h-${ins.id}`}>
            <span className="cal-head-name">{ins.name}</span>
            <span className="cal-head-tags">
              {ins.sports.map((sp) => (
                <span key={sp} className={`tag tag--${sp}`}>
                  {SPORT_LABEL[sp]}
                </span>
              ))}
            </span>
          </div>
        ))}

        {hours.map((hour) => {
          const label = hour.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
          return (
            <div key={hour.getTime()} style={{ display: 'contents' }}>
              <div className={`cal-hour${hour.getHours() === GRID_START_HOUR ? ' is-first' : ''}`}>
                {label}
              </div>

              {instructors.map((ins) => {
                const key = hourKey(ins.id, hour);
                const cell = cells.get(key);
                const state = cell?.state ?? (isOpenHour(hour.getHours()) ? 'free' : 'closed');

                // an instructor manages their own column; an admin manages all
                const manages =
                  viewer.role === 'admin' ||
                  (viewer.role === 'instructor' && viewer.instructorId === ins.id);

                // Only staff ever see whose booking it is. For a customer the
                // owner is deliberately hidden — busy_hours does not expose it.
                const booking = manages ? ownBookings.get(key) : undefined;
                const busy = busyKey === key;

                const clickable =
                  !busy &&
                  (manages
                    ? state === 'free' || state === 'blocked'
                    : state === 'free' || state === 'mine' || state === 'mine-pending');

                const onClick = () => {
                  if (manages) {
                    onManageHour(ins, cell ?? { instructorId: ins.id, startsAt: hour, state });
                  } else if ((state === 'mine' || state === 'mine-pending') && cell?.bookingId) {
                    onCancel(cell.bookingId);
                  } else {
                    onBook(ins, hour);
                  }
                };

                // a busy hour says what it is; a free one says what you can do
                const text =
                  cell?.lessonLabel ??
                  (manages && state === 'free' ? 'Müsait · düzenle' : STATE_LABEL[state]);

                const tone = cell?.lessonClass ? ` is-${cell.lessonClass}` : '';

                return (
                  <div
                    key={key}
                    className={`cal-cell is-${state}${tone}${manages ? ' is-own' : ''}${busy ? ' is-busy' : ''}`}
                  >
                    {clickable ? (
                      <button className="cal-hit" onClick={onClick} disabled={busy}>
                        <span className="cal-state">{busy ? '…' : t(text)}</span>
                      </button>
                    ) : (
                      <span className="cal-state">{t(text)}</span>
                    )}

                    {booking && (
                      <span className="cal-customer" title={booking.customerPhone ?? undefined}>
                        {booking.customerName ?? booking.customerEmail}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { shortLesson };
