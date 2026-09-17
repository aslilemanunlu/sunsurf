import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ManagedBooking } from '../types';
import { locale, useT } from '../lib/i18n';
import * as api from '../api/client';
import {
  addDays,
  formatTime,
  fromDateKey,
  startOfMonthKey,
  startOfWeekKey,
  todayKey,
  toDateKey,
} from '../lib/date';
import { describeLesson, lessonClass } from '../lib/lessons';
import { downloadCsv } from '../lib/csv';
import { Split, type Slice } from './admin/Charts';

type Props = {
  /** The instructor profile whose lessons these are. */
  instructorId: string;
  instructorName: string;
  onBack: () => void;
};

/**
 * The shortcuts write into the same two date fields the reader can edit, so
 * "this week but from Wednesday" is one click and one edit rather than a mode.
 */
const PRESETS: { label: string; range: () => [string, string] }[] = [
  { label: 'Bugün', range: () => [todayKey(), todayKey()] },
  { label: 'Bu hafta', range: () => [startOfWeekKey(), addDays(startOfWeekKey(), 6)] },
  { label: 'Bu ay', range: () => [startOfMonthKey(), todayKey()] },
  { label: 'Son 90 gün', range: () => [addDays(todayKey(), -89), todayKey()] },
];

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
  const [from, setFrom] = useState(startOfMonthKey());
  const [to, setTo] = useState(todayKey());
  const [rows, setRows] = useState<ManagedBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const end = fromDateKey(to);
      end.setDate(end.getDate() + 1); // the last day is included
      const all = await api.listBookingsBetween(fromDateKey(from).toISOString(), end.toISOString());
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
  }, [from, to, instructorId]);

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

  /** The lessons grouped by day, in order — how a week is read. */
  const days = useMemo(() => {
    const map = new Map<string, ManagedBooking[]>();
    for (const r of rows) {
      const key = toDateKey(new Date(r.startsAt));
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return [...map.entries()];
  }, [rows]);

  function exportMonth() {
    downloadCsv(
      `derslerim-${from}_${to}`,
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
        <button
          className="btn btn--ghost btn--small"
          onClick={exportMonth}
          disabled={rows.length === 0}
        >
          {t('Excel’e aktar')}
        </button>
      </div>

      <div className="filters">
        <div className="segmented" role="group" aria-label={t('Dönem')}>
          {PRESETS.map((p) => {
            const [pf, pt] = p.range();
            const active = from === pf && to === pt;
            return (
              <button
                key={p.label}
                className={`segment${active ? ' is-active' : ''}`}
                onClick={() => {
                  setFrom(pf);
                  setTo(pt);
                }}
                aria-pressed={active}
              >
                {t(p.label)}
              </button>
            );
          })}
        </div>

        <label className="range">
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => e.target.value && setFrom(e.target.value)}
            aria-label={t('Başlangıç')}
          />
          <span>–</span>
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => e.target.value && setTo(e.target.value)}
            aria-label={t('Bitiş')}
          />
        </label>
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
                <Split data={byType} empty={t('Bu tarihlerde ders yok.')} />
              </section>
              <section className="panel">
                <h4 className="panel-title">{t('Spor')}</h4>
                <Split data={bySport} empty={t('Bu tarihlerde ders yok.')} />
              </section>
            </div>
          )}

          <h3 className="section-title">{t('Ders listesi')}</h3>

          {rows.length === 0 ? (
            <p className="mybookings-empty">{t('Bu tarihlerde ders yok.')}</p>
          ) : (
            <div className="lessonlist">
              {days.map(([day, lessons]) => (
                <section key={day} className="lessonlist-day">
                  <h4 className="lessonlist-date">
                    {fromDateKey(day).toLocaleDateString(locale(), {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                    })}
                    <span className="cell-dim">
                      {' · '}
                      {lessons.length} {t('ders')} ·{' '}
                      {lessons.reduce((sum, l) => sum + l.durationHours, 0)} {t('saat')}
                    </span>
                  </h4>
                  <ul>
                    {lessons.map((r) => {
                      const end = new Date(
                        new Date(r.startsAt).getTime() + r.durationHours * 3_600_000,
                      );
                      return (
                        <li key={r.id} className={`lessonlist-item is-${lessonClass(r)}`}>
                          <span className="lessonlist-time">
                            {formatTime(r.startsAt)} – {formatTime(end.toISOString())}
                          </span>
                          <span className="lessonlist-who">
                            {r.isGuest ? (
                              <span className="cell-dim">{t('Misafir')}</span>
                            ) : (
                              (r.customerName ?? '—')
                            )}
                            {!r.isGuest && r.customerPhone && (
                              <a className="cell-dim" href={`tel:${r.customerPhone}`}>
                                {r.customerPhone}
                              </a>
                            )}
                          </span>
                          <span className={`tag tag--${lessonClass(r)}`}>{describeLesson(r)}</span>
                          {r.status === 'pending' && (
                            <span className="status status--pending">{t('Ön rezervasyon')}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
