import type { Booking, BookingStatus, Instructor } from '../types';
import { useT } from '../lib/i18n';
import { formatDayLabel, formatTime, toDateKey } from '../lib/date';
import { describeLesson, lessonClass } from '../lib/lessons';

type Props = {
  bookings: Booking[];
  instructors: Map<string, Instructor>;
  busyBookingId: string | null;
  onGoToDay: (dateKey: string) => void;
  onCancel: (bookingId: string) => void;
};

const STATUS_LABEL: Record<BookingStatus, string> = {
  pending: 'Beklemede',
  approved: 'Onaylandı',
  rejected: 'Reddedildi',
};

export default function MyBookings({
  bookings,
  instructors,
  busyBookingId,
  onGoToDay,
  onCancel,
}: Props) {
  const { t } = useT();
  return (
    <section className="mybookings">
      <h3 className="section-title">{t('Derslerim')}</h3>

      {bookings.length === 0 ? (
        <p className="mybookings-empty">
          {t('Henüz bir dersiniz yok. Yukarıdan bir gün seçip müsait bir saate tıklayın.')}
        </p>
      ) : (
        <ul className="booking-list">
          {bookings.map((b) => {
            const dayKey = toDateKey(new Date(b.startsAt));
            const endsAt = new Date(
              new Date(b.startsAt).getTime() + b.durationHours * 60 * 60 * 1000,
            );
            const instructor = instructors.get(b.instructorId);
            return (
              <li key={b.id} className={`booking booking--${lessonClass(b)}`}>
                <button className="booking-main" onClick={() => onGoToDay(dayKey)}>
                  <span className="booking-day">{formatDayLabel(dayKey)}</span>
                  <span className="booking-detail">
                    {formatTime(b.startsAt)} – {formatTime(endsAt.toISOString())} ·{' '}
                    {instructor?.name ?? b.instructorId}
                  </span>
                  <span className={`tag tag--${lessonClass(b)}`}>{describeLesson(b)}</span>
                  <span className={`status status--${b.status}`}>{t(STATUS_LABEL[b.status])}</span>
                </button>
                {b.status !== 'rejected' && (
                  <button
                    className="link-btn danger"
                    onClick={() => onCancel(b.id)}
                    disabled={busyBookingId === b.id}
                  >
                    {t('İptal')}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
