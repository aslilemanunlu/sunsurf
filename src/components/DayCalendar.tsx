import type { Instructor, Sport, SlotWithInstructor } from '../types';
import { formatDuration, formatTimeRange } from '../lib/date';

/** The grid always covers the same window, so days are comparable at a glance. */
const DAY_START_HOUR = 7;
const DAY_END_HOUR = 20;
const ROW_HEIGHT = 60;

const SPORT_LABEL: Record<Sport, string> = { windsurf: 'Windsurf', wingfoil: 'Wingfoil' };

type Props = {
  slots: SlotWithInstructor[];
  loading: boolean;
  filtered: boolean;
  bookedSlotIds: Set<string>;
  busySlotId: string | null;
  onBook: (slot: SlotWithInstructor) => void;
  onCancel: (slotId: string) => void;
  onFindNext: () => void;
};

function minutesFromDayStart(iso: string): number {
  const d = new Date(iso);
  return (d.getHours() - DAY_START_HOUR) * 60 + d.getMinutes();
}

function hourLabel(hour: number): string {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export default function DayCalendar({
  slots,
  loading,
  filtered,
  bookedSlotIds,
  busySlotId,
  onBook,
  onCancel,
  onFindNext,
}: Props) {
  if (loading) {
    return <div className="cal-skeleton" aria-busy="true" />;
  }

  if (slots.length === 0) {
    return (
      <div className="empty">
        <p className="empty-title">
          {filtered ? 'No classes match this filter' : 'No classes on this day'}
        </p>
        <p className="empty-sub">
          {filtered
            ? 'Try “All”, or look at another day.'
            : 'Instructors haven’t put anything on the water here.'}
        </p>
        <button className="btn btn--ghost" onClick={onFindNext}>
          Next day with classes →
        </button>
      </div>
    );
  }

  // One column per instructor teaching that day, in a stable order.
  const instructors: Instructor[] = [
    ...new Map(slots.map((s) => [s.instructor.id, s.instructor])).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));

  const hours = Array.from(
    { length: DAY_END_HOUR - DAY_START_HOUR },
    (_, i) => DAY_START_HOUR + i,
  );
  const now = Date.now();

  return (
    <div
      className="cal-scroll"
      style={{
        ['--row-h' as string]: `${ROW_HEIGHT}px`,
        ['--cols' as string]: instructors.length,
      }}
    >
      <div className="cal">
        <div className="cal-corner" />
        {instructors.map((ins) => {
          const sports = [...new Set(slots.filter((s) => s.instructorId === ins.id).map((s) => s.sport))];
          return (
            <div className="cal-head" key={`h-${ins.id}`}>
              <span className="cal-head-name">{ins.name}</span>
              <span className="cal-head-tags">
                {sports.map((sp) => (
                  <span key={sp} className={`tag tag--${sp}`}>
                    {SPORT_LABEL[sp]}
                  </span>
                ))}
              </span>
            </div>
          );
        })}

        <div className="cal-gutter" style={{ height: hours.length * ROW_HEIGHT }}>
          {hours.map((h, i) => (
            <span key={h} className="cal-hour" style={{ top: i * ROW_HEIGHT + ROW_HEIGHT / 2 }}>
              {hourLabel(h)}
            </span>
          ))}
        </div>

        {instructors.map((ins) => (
          <div
            className="cal-col"
            key={`c-${ins.id}`}
            style={{ height: hours.length * ROW_HEIGHT }}
          >
            {slots
              .filter((s) => s.instructorId === ins.id)
              .map((slot) => {
                const start = new Date(slot.startsAt).getTime();
                const past = start + slot.durationMin * 60_000 <= now;
                const booked = bookedSlotIds.has(slot.id);
                const busy = busySlotId === slot.id;
                const range = formatTimeRange(slot.startsAt, slot.durationMin);
                const state = past ? 'is-past' : booked ? 'is-booked' : 'is-open';

                return (
                  <div
                    key={slot.id}
                    className={`cal-slot cal-slot--${slot.sport} ${state}`}
                    style={{
                      top: (minutesFromDayStart(slot.startsAt) / 60) * ROW_HEIGHT,
                      height: (slot.durationMin / 60) * ROW_HEIGHT,
                    }}
                    title={`${SPORT_LABEL[slot.sport]} with ${ins.name}, ${range} (${formatDuration(
                      slot.durationMin,
                    )})`}
                  >
                    {past ? (
                      <span className="cal-state">Past</span>
                    ) : booked ? (
                      <>
                        <span className="cal-state">✓ Booked</span>
                        <span className="cal-when">{range}</span>
                        <button
                          className="link-btn danger cal-cancel"
                          onClick={() => onCancel(slot.id)}
                          disabled={busy}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        className="cal-hit"
                        onClick={() => onBook(slot)}
                        disabled={busy}
                        aria-label={`Book ${SPORT_LABEL[slot.sport]} with ${ins.name}, ${range}`}
                      >
                        <span className="cal-state">Available</span>
                        <span className="cal-when">{range}</span>
                      </button>
                    )}
                  </div>
                );
              })}
          </div>
        ))}
      </div>
    </div>
  );
}
