import type { BookingWithSlot } from '../api/client';
import { formatDayLabel, formatTimeRange, toDateKey } from '../lib/date';

type Props = {
  bookings: BookingWithSlot[];
  busyBookingId: string | null;
  onGoToDay: (dateKey: string) => void;
  onCancel: (bookingId: string) => void;
};

const SPORT_LABEL = { windsurf: 'Windsurf', wingfoil: 'Wingfoil' } as const;

export default function MyBookings({ bookings, busyBookingId, onGoToDay, onCancel }: Props) {
  return (
    <section className="mybookings">
      <h3 className="section-title">Your classes</h3>

      {bookings.length === 0 ? (
        <p className="mybookings-empty">
          Nothing booked yet. Pick a day above and book a class.
        </p>
      ) : (
        <ul className="booking-list">
          {bookings.map((b) => {
            const dayKey = toDateKey(new Date(b.slot.startsAt));
            return (
              <li key={b.id} className={`booking booking--${b.slot.sport}`}>
                <button className="booking-main" onClick={() => onGoToDay(dayKey)}>
                  <span className="booking-day">{formatDayLabel(dayKey)}</span>
                  <span className="booking-detail">
                    {formatTimeRange(b.slot.startsAt, b.slot.durationMin)} ·{' '}
                    {b.slot.instructor.name}
                  </span>
                  <span className={`tag tag--${b.slot.sport}`}>{SPORT_LABEL[b.slot.sport]}</span>
                </button>
                <button
                  className="link-btn danger"
                  onClick={() => onCancel(b.id)}
                  disabled={busyBookingId === b.id}
                >
                  Cancel
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
