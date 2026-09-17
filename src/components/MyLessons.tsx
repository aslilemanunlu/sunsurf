import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ManagedBooking } from '../types';
import { locale, useT } from '../lib/i18n';
import * as api from '../api/client';
import { formatTime } from '../lib/date';
import { describeLesson, lessonClass } from '../lib/lessons';
import { downloadCsv } from '../lib/csv';
import { Split, type Slice } from './admin/Charts';

type Props = {
  /** The instructor profile whose lessons these are. */
  instructorId: string;
  instructorName: string;
  onBack: () => void;
};

/** "2026-09" — what a month picker gives back. */
function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function bounds(month: string): [string, string] {
  const [y, m] = month.split('-').map(Number);
  return [new Date(y, m - 1, 1).toISOString(), new Date(y, m, 1).toISOString()];
}

/**
 * An instructor's own month: what they taught, and the totals.
 *
 * Filtered to this instructor on purpose, not left to the database. For an
 * instructor the view already returns only their calendar, but an admin who
 * also teaches can read every booking — and "my lessons" must not become
 * "everyone's" the day somebody is both.
 *
 * Rejected bookings are left out of every number: they did not happen.
 */
export default function MyLessons({ instructorId, instructorName, onBack }: Props) {
  const { t } = useT();
  const [month, setMonth] = useState(thisMonth());
  const [rows, setRows] = useState<ManagedBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [from, to] = bounds(month);
      const all = await api.listBookingsBetween(from, to);
      setRows(
        all
          .filter((b) => b.instructorId === instructorId && b.status !== 'rejected')
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
      );
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [month, instructorId]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    const hours = rows.reduce((s, r) => s + r.durationHours, 0);
    const days = new Set(rows.map((r) => new Date(r.startsAt).toDateString())).size;
    const guests = rows.filter((r) => r.isGuest).length;
    return { lessons: rows.length, hours, days, guests };
  }, [rows]);

  const byType = useMemo<Slice[]>(() => {
    const count = (type: string) => rows.filter((r) => r.lessonType === type).length;
    return [
      { label: t('Bireysel'), value: count('individual'), tone: 'individual' },
      { label: t('Grup'), value: count('group'), tone: 'group' },
      { label: t('Çocuk kampı'), value: count('kids_camp'), tone: 'kids' },
    ];
  }, [rows, t]);

  const bySport = useMemo<Slice[]>(
    () => [
      { label: 'Windsurf', value: rows.filter((r) => r.sport === 'windsurf').length, tone: 'individual' },
      { label: 'Wingfoil', value: rows.filter((r) => r.sport === 'wingfoil').length, tone: 'group' },
    ],
    [rows],
  );

  function exportMonth() {
    downloadCsv(
      `derslerim-${month}`,
      [t('Tarih'), t('Saat'), t('Müşteri'), t('Ders'), t('Süre')],
      rows.map((r) => [
        new Date(r.startsAt).toLocaleDateString(locale()),
        formatTime(r.startsAt),
        r.isGuest ? t('Misafir') : (r.customerName ?? ''),
        describeLesson(r),
        r.durationHours,
      ]),
    );
  }

  return (
    <section className="mylessons">
      <div className="admin-bar">
        <button className="link-btn" onClick={onBack}>
          ← {t('Takvime dön')}
        </button>
      </div>

      <div className="admin-bar">
        <h2 className="admin-title">
          {t('Derslerim')} · {instructorName}
        </h2>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value || thisMonth())}
          aria-label={t('Ay')}
        />
        <button
          className="btn btn--ghost btn--small"
          onClick={exportMonth}
          disabled={rows.length === 0}
        >
          {t('Excel’e aktar')}
        </button>
      </div>

      {error && <p className="dialog-error">{error}</p>}

      {loading ? (
        <p className="admin-hint">{t('Yükleniyor…')}</p>
      ) : (
        <>
          <div className="stat-grid stat-grid--compact">
            <article className="stat stat--accent">
              <header className="stat-head">
                <span className="stat-title">{t('Ders')}</span>
              </header>
              <p className="stat-value">{totals.lessons}</p>
            </article>
            <article className="stat stat--individual">
              <header className="stat-head">
                <span className="stat-title">{t('Toplam saat')}</span>
              </header>
              <p className="stat-value">
                {totals.hours}
                <span className="stat-suffix"> {t('saat')}</span>
              </p>
            </article>
            <article className="stat stat--group">
              <header className="stat-head">
                <span className="stat-title">{t('Çalışılan gün')}</span>
              </header>
              <p className="stat-value">{totals.days}</p>
            </article>
            <article className="stat stat--kids">
              <header className="stat-head">
                <span className="stat-title">{t('Misafir dersleri')}</span>
              </header>
              <p className="stat-value">{totals.guests}</p>
            </article>
          </div>

          {rows.length > 0 && (
            <div className="chart-grid">
              <section className="panel">
                <h4 className="panel-title">{t('Ders tipi dağılımı')}</h4>
                <Split data={byType} empty={t('Bu ayda ders yok.')} />
              </section>
              <section className="panel">
                <h4 className="panel-title">{t('Spor')}</h4>
                <Split data={bySport} empty={t('Bu ayda ders yok.')} />
              </section>
            </div>
          )}

          {rows.length === 0 ? (
            <p className="mybookings-empty">{t('Bu ayda ders yok.')}</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('Tarih / saat')}</th>
                    <th>{t('Müşteri')}</th>
                    <th>{t('Ders')}</th>
                    <th className="num">{t('Süre')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const end = new Date(
                      new Date(r.startsAt).getTime() + r.durationHours * 3_600_000,
                    );
                    return (
                      <tr key={r.id}>
                        <td>
                          {new Date(r.startsAt).toLocaleDateString(locale(), {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short',
                          })}
                          <div className="cell-dim">
                            {formatTime(r.startsAt)} – {formatTime(end.toISOString())}
                          </div>
                        </td>
                        <td>
                          {r.isGuest ? (
                            <span className="cell-dim">{t('Misafir')}</span>
                          ) : (
                            <>
                              {r.customerName ?? '—'}
                              {r.customerPhone && (
                                <div className="cell-dim">
                                  <a href={`tel:${r.customerPhone}`}>{r.customerPhone}</a>
                                </div>
                              )}
                            </>
                          )}
                        </td>
                        <td>
                          <span className={`tag tag--${lessonClass(r)}`}>{describeLesson(r)}</span>
                          {r.status === 'pending' && (
                            <div className="status status--pending">{t('Ön rezervasyon')}</div>
                          )}
                        </td>
                        <td className="num">
                          {r.durationHours} {t('saat')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
