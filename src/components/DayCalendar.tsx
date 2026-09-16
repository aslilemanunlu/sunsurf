import { useCallback, useEffect, useRef, useState } from 'react';
import type { Instructor, LessonType, ManagedBooking, Viewer } from '../types';
import { locale, useT } from '../lib/i18n';
import { GRID_START_HOUR, gridHours, hourKey, isOpenHour, type HourState } from '../lib/hours';
import { SPORT_LABEL, shortLesson } from '../lib/lessons';

const STATE_LABEL: Record<HourState, string> = {
  closed: '',
  past: 'Geçmiş',
  blocked: 'Bloke',
  pending: 'Ön rezervasyon',
  taken: 'Dolu',
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
  /** Staff clicked a free or blocked hour — App opens the little action menu. */
  onManageHour: (instructor: Instructor, cell: HourCell) => void;
  /** Staff dragged across several free hours: straight to a lesson of that length. */
  onSelectRange: (instructor: Instructor, startsAt: Date, hours: number) => void;
};

export default function DayCalendar({
  instructors,
  cells,
  loading,
  dateKey,
  viewer,
  ownBookings,
  busyKey,
  onManageHour,
  onSelectRange,
}: Props) {
  const { t } = useT();

  /**
   * Dragging down a column to book several hours at once.
   *
   * Mouse and pen only: on a touch screen a vertical drag is how the grid is
   * scrolled, and stealing that to draw a selection makes the calendar
   * unusable on a phone. A tap there still opens the hour menu.
   */
  const [drag, setDrag] = useState<{
    instructorId: string;
    from: number;
    to: number;
  } | null>(null);

  /**
   * A finished drag releases the pointer over a cell, and that cell's button
   * fires its click straight afterwards — which would open the hour menu on top
   * of the dialog the drag just asked for. This swallows exactly that one click.
   */
  const justDragged = useRef(false);

  const finish = useCallback(() => {
    setDrag((d) => {
      if (d && d.to !== d.from) {
        const ins = instructors.find((i) => i.id === d.instructorId);
        const lo = Math.min(d.from, d.to);
        const hi = Math.max(d.from, d.to);
        if (ins) {
          justDragged.current = true;
          onSelectRange(ins, new Date(lo), (hi - lo) / 3600000 + 1);
        }
      }
      return null;
    });
  }, [instructors, onSelectRange]);

  // The pointer is very often released outside the cell it started in.
  useEffect(() => {
    if (!drag) return;
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    return () => {
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
  }, [drag, finish]);
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

                // Nobody outside the school can act on the calendar, so for
                // everyone else every cell is just text.
                const clickable = !busy && manages && state !== 'past' && state !== 'closed';

                const onClick = () => {
                  if (justDragged.current) {
                    justDragged.current = false;
                    return;
                  }
                  onManageHour(ins, cell ?? { instructorId: ins.id, startsAt: hour, state });
                };

                // a busy hour says what it is; a free one says what you can do
                const text =
                  cell?.lessonLabel ??
                  (manages && state === 'free' ? 'Müsait · düzenle' : STATE_LABEL[state]);
                const who = booking?.customerName;

                const tone = cell?.lessonClass ? ` is-${cell.lessonClass}` : '';

                const inDrag =
                  drag !== null &&
                  drag.instructorId === ins.id &&
                  hour.getTime() >= Math.min(drag.from, drag.to) &&
                  hour.getTime() <= Math.max(drag.from, drag.to);

                // only a run of free hours can be dragged out
                const draggable = manages && state === 'free';

                return (
                  <div
                    key={key}
                    className={`cal-cell is-${state}${tone}${manages ? ' is-own' : ''}${busy ? ' is-busy' : ''}${inDrag ? ' is-selecting' : ''}`}
                    onPointerDown={(e) => {
                      if (!draggable || e.pointerType === 'touch' || e.button !== 0) return;
                      setDrag({ instructorId: ins.id, from: hour.getTime(), to: hour.getTime() });
                    }}
                    onPointerEnter={() => {
                      if (!drag || drag.instructorId !== ins.id || state !== 'free') return;
                      setDrag({ ...drag, to: hour.getTime() });
                    }}
                  >
                    {clickable ? (
                      <button className="cal-hit" onClick={onClick} disabled={busy}>
                        <span className="cal-state">{busy ? '…' : t(text)}</span>
                      </button>
                    ) : (
                      <span className="cal-state">{t(text)}</span>
                    )}

                    {who && (
                      <span className="cal-customer" title={booking?.customerPhone ?? undefined}>
                        {who}
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
