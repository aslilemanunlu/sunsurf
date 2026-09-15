import type { Interest, ManagedBooking, Role } from '../types';
import { useT } from '../lib/i18n';
import { formatDayLabel, formatTime, toDateKey } from '../lib/date';
import { describeLesson, lessonClass } from '../lib/lessons';

const INTEREST_LABEL: Record<Interest, string> = {
  rental: 'Kiralama',
  wingfoil: 'Wingfoil',
  windsurf: 'Windsurf',
};

type Props = {
  requests: ManagedBooking[];
  role: Role;
  busyId: string | null;
  onDecide: (bookingId: string, status: 'approved' | 'rejected') => void;
  onGoToDay: (dateKey: string) => void;
};

/**
 * Pending requests for whoever may act on them. The scope comes from the
 * managed_bookings view — an admin sees every instructor, an instructor sees
 * only their own — so there is no filtering to get wrong here.
 */
export default function RequestsPanel({ requests, role, busyId, onDecide, onGoToDay }: Props) {
  const { t } = useT();
  return (
    <section className="requests">
      <h3 className="section-title">
        Bekleyen talepler{requests.length > 0 && ` (${requests.length})`}
      </h3>

      {requests.length === 0 ? (
        <p className="mybookings-empty">{t('Bekleyen talep yok.')}</p>
      ) : (
        <ul className="request-list">
          {requests.map((r) => {
            const dayKey = toDateKey(new Date(r.startsAt));
            const endsAt = new Date(
              new Date(r.startsAt).getTime() + r.durationHours * 60 * 60 * 1000,
            );
            return (
              <li key={r.id} className={`request request--${lessonClass(r)}`}>
                <div className="request-main">
                  <button className="request-when" onClick={() => onGoToDay(dayKey)}>
                    {formatDayLabel(dayKey)} · {formatTime(r.startsAt)} –{' '}
                    {formatTime(endsAt.toISOString())}
                  </button>
                  <span className="request-meta">
                    <span className={`tag tag--${lessonClass(r)}`}>{describeLesson(r)}</span>
                    <span>
                      {r.durationHours} {t('saat')}
                    </span>
                    {role === 'admin' && <span>· {r.instructorName}</span>}
                  </span>
                  <span className="request-customer">
                    {r.customerName ?? r.customerEmail}
                    {r.customerPhone && ` · ${r.customerPhone}`}
                  </span>
                  {r.customerInterests.length > 0 && (
                    <span className="request-interests">
                      {t('İlgi')}: {r.customerInterests.map((i) => t(INTEREST_LABEL[i])).join(', ')}
                    </span>
                  )}
                </div>

                <div className="request-actions">
                  <button
                    className="btn"
                    onClick={() => onDecide(r.id, 'approved')}
                    disabled={busyId === r.id}
                  >
                    {t('Onayla')}
                  </button>
                  <button
                    className="link-btn danger"
                    onClick={() => onDecide(r.id, 'rejected')}
                    disabled={busyId === r.id}
                  >
                    {t('Reddet')}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
