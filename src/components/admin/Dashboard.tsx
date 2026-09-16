import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Instructor, LessonType, ManagedBooking } from '../../types';
import { locale, useT } from '../../lib/i18n';
import * as api from '../../api/client';
import { addDays, fromDateKey, toDateKey, todayKey } from '../../lib/date';
import { BarRows, Columns, Split, type Slice } from './Charts';

type Card = {
  key: keyof api.DashboardStats;
  title: string;
  tone: string;
  suffix?: string;
};

const CARDS: Card[] = [
  { key: 'students', title: 'Toplam Müşteri', tone: 'accent' },
  { key: 'instructors', title: 'Toplam Hoca', tone: 'individual' },
  { key: 'bookings', title: 'Toplam Rezervasyon', tone: 'kids' },
  { key: 'hoursThisMonth', title: 'Bu Ay Verilen Ders', tone: 'accent', suffix: 'saat' },
];

function startOfMonth(): string {
  const d = new Date();
  return toDateKey(new Date(d.getFullYear(), d.getMonth(), 1));
}

/**
 * The shortcuts, as the dates they stand for.
 *
 * They write into the same two date fields the reader can edit, rather than
 * being a mode of their own — so "this month, but starting on the 3rd" is one
 * click and one edit instead of a different control.
 */
const PRESETS: { label: string; range: () => [string, string] }[] = [
  { label: 'Son 7 gün', range: () => [addDays(todayKey(), -6), todayKey()] },
  { label: 'Bu ay', range: () => [startOfMonth(), todayKey()] },
  { label: 'Son 90 gün', range: () => [addDays(todayKey(), -89), todayKey()] },
];

/** Days between two keys, inclusive. */
function daysBetween(from: string, to: string): number {
  return Math.round((fromDateKey(to).getTime() - fromDateKey(from).getTime()) / 86_400_000) + 1;
}

export default function Dashboard() {
  const { t } = useT();
  const [stats, setStats] = useState<api.DashboardStats | null>(null);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [rows, setRows] = useState<ManagedBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(todayKey());
  const [pickedInstructors, setPickedInstructors] = useState<string[]>([]);
  const [pickedTypes, setPickedTypes] = useState<LessonType[]>([]);
  /**
   * Guest lessons are real hours the school taught, but a guest is not a
   * customer — counting them in by default would flatter every number about
   * how busy the school is with people who come back.
   */
  const [withGuests, setWithGuests] = useState(false);


  const [rangeFrom, rangeTo] = [from, to];

  useEffect(() => {
    let cancelled = false;
    api
      .getDashboardStats()
      .then((s) => !cancelled && setStats(s))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    api
      .listInstructors()
      .then((i) => !cancelled && setInstructors(i))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const end = fromDateKey(rangeTo);
      end.setDate(end.getDate() + 1);
      setRows(
        await api.listBookingsBetween(fromDateKey(rangeFrom).toISOString(), end.toISOString()),
      );
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [rangeFrom, rangeTo]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Nothing picked means everything: an empty filter is not an empty result. */
  const counted = useMemo(
    () =>
      rows.filter(
        (r) =>
            r.status !== 'rejected' &&
          (withGuests || !r.isGuest) &&
          (pickedInstructors.length === 0 || pickedInstructors.includes(r.instructorId)) &&
          (pickedTypes.length === 0 || pickedTypes.includes(r.lessonType)),
      ),
    [rows, withGuests, pickedInstructors, pickedTypes],
  );

  const totals = useMemo(() => {
    const hours = counted.reduce((s, r) => s + r.durationHours, 0);
    const people = counted.reduce((s, r) => s + (r.groupSize ?? 1), 0);
    const pending = counted.filter((r) => r.status === 'pending').length;
    return { lessons: counted.length, hours, people, pending };
  }, [counted]);

  /** Hours per instructor, busiest first. */
  const byInstructor = useMemo<Slice[]>(() => {
    const map = new Map<string, number>();
    for (const r of counted) {
      map.set(r.instructorName, (map.get(r.instructorName) ?? 0) + r.durationHours);
    }
    return [...map.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [counted]);

  /**
   * Lessons over time. A long range is bucketed by week, otherwise the columns
   * become slivers and the labels a smear.
   */
  const overTime = useMemo<Slice[]>(() => {
    const span = daysBetween(rangeFrom, rangeTo);
    const weekly = span > 45;
    const buckets = new Map<string, number>();
    const label = (key: string) =>
      fromDateKey(key).toLocaleDateString(locale(), { day: 'numeric', month: 'short' });

    for (let i = 0; i < span; i++) {
      const key = addDays(rangeFrom, i);
      const bucket = weekly ? addDays(rangeFrom, Math.floor(i / 7) * 7) : key;
      if (!buckets.has(bucket)) buckets.set(bucket, 0);
    }
    for (const r of counted) {
      const key = toDateKey(new Date(r.startsAt));
      const offset = Math.round(
        (fromDateKey(key).getTime() - fromDateKey(rangeFrom).getTime()) / 86_400_000,
      );
      if (offset < 0 || offset >= span) continue;
      const bucket = weekly ? addDays(rangeFrom, Math.floor(offset / 7) * 7) : key;
      buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
    }
    return [...buckets.entries()].map(([key, value]) => ({ label: label(key), value }));
  }, [counted, rangeFrom, rangeTo]);

  const byType = useMemo<Slice[]>(() => {
    const count = (type: string) => counted.filter((r) => r.lessonType === type).length;
    return [
      { label: t('Bireysel'), value: count('individual'), tone: 'individual' },
      { label: t('Grup'), value: count('group'), tone: 'group' },
      { label: t('Çocuk kampı'), value: count('kids_camp'), tone: 'kids' },
    ];
  }, [counted, t]);

  const byStatus = useMemo<Slice[]>(() => {
    const count = (s: string) => rows.filter((r) => r.status === s).length;
    return [
      { label: t('Onaylı'), value: count('approved'), tone: 'approved' },
      { label: t('Beklemede'), value: count('pending'), tone: 'pending' },
      { label: t('Reddedildi'), value: count('rejected'), tone: 'rejected' },
    ];
  }, [rows, t]);

  /** The per-instructor table behind the bars. */
  const table = useMemo(() => {
    const map = new Map<
      string,
      { name: string; lessons: number; hours: number; individual: number; group: number; kids: number }
    >();
    for (const r of counted) {
      const row = map.get(r.instructorId) ?? {
        name: r.instructorName,
        lessons: 0,
        hours: 0,
        individual: 0,
        group: 0,
        kids: 0,
      };
      row.lessons += 1;
      row.hours += r.durationHours;
      if (r.lessonType === 'individual') row.individual += 1;
      else if (r.lessonType === 'group') row.group += 1;
      else row.kids += 1;
      map.set(r.instructorId, row);
    }
    return [...map.values()].sort((a, b) => b.hours - a.hours);
  }, [counted]);

  const guestCount = useMemo(
    () => rows.filter((r) => r.isGuest && r.status !== 'rejected').length,
    [rows],
  );

  const rangeLabel = `${fromDateKey(rangeFrom).toLocaleDateString(locale())} – ${fromDateKey(
    rangeTo,
  ).toLocaleDateString(locale())}`;

  return (
    <section>
      <h2 className="admin-title">{t('Ana Sayfa')}</h2>

      {error && <p className="dialog-error">{error}</p>}

      <div className="stat-grid">
        {CARDS.map((c) => (
          <article key={c.key} className={`stat stat--${c.tone}`}>
            <header className="stat-head">
              <span className="stat-title">{t(c.title)}</span>
            </header>
            <p className="stat-value">
              {stats ? stats[c.key].toLocaleString(locale()) : '—'}
              {c.suffix && stats ? <span className="stat-suffix"> {t(c.suffix)}</span> : null}
            </p>
          </article>
        ))}
      </div>

      <h3 className="admin-subtitle">{t('Raporlama')}</h3>

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

        <label className="check check--inline">
          <input
            type="checkbox"
            checked={withGuests}
            onChange={(e) => setWithGuests(e.target.checked)}
          />
          {t('Misafir derslerini dahil et')}
          {guestCount > 0 && <span className="cell-dim"> ({guestCount})</span>}
        </label>

        <label className="range">
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            aria-label={t('Başlangıç')}
          />
          <span>–</span>
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
            aria-label={t('Bitiş')}
          />
        </label>

        <div className="chipset">
          {instructors.map((i) => {
            const on = pickedInstructors.includes(i.id);
            return (
              <button
                key={i.id}
                type="button"
                className={`chip${on ? ' is-on chip--individual' : ''}`}
                onClick={() =>
                  setPickedInstructors((prev) =>
                    prev.includes(i.id) ? prev.filter((x) => x !== i.id) : [...prev, i.id],
                  )
                }
                aria-pressed={on}
              >
                {i.name}
              </button>
            );
          })}
        </div>

        <div className="chipset">
          {(
            [
              ['individual', 'Bireysel'],
              ['group', 'Grup'],
              ['kids_camp', 'Çocuk kampı'],
            ] as [LessonType, string][]
          ).map(([value, label]) => {
            const on = pickedTypes.includes(value);
            const tone = value === 'kids_camp' ? 'kids' : value === 'group' ? 'group' : 'individual';
            return (
              <button
                key={value}
                type="button"
                className={`chip${on ? ` is-on chip--${tone}` : ''}`}
                onClick={() =>
                  setPickedTypes((prev) =>
                    prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value],
                  )
                }
                aria-pressed={on}
              >
                {t(label)}
              </button>
            );
          })}
        </div>


      </div>

      <p className="admin-hint">{rangeLabel}</p>

      {loading ? (
        <p className="admin-hint">{t('Yükleniyor…')}</p>
      ) : (
        <>
          <div className="stat-grid stat-grid--compact">
            <article className="stat stat--accent">
              <header className="stat-head">
                <span className="stat-title">{t('Dönemdeki ders')}</span>
              </header>
              <p className="stat-value">{totals.lessons.toLocaleString(locale())}</p>
            </article>
            <article className="stat stat--individual">
              <header className="stat-head">
                <span className="stat-title">{t('Toplam saat')}</span>
              </header>
              <p className="stat-value">
                {totals.hours.toLocaleString(locale())}
                <span className="stat-suffix"> {t('saat')}</span>
              </p>
            </article>
            <article className="stat stat--group">
              <header className="stat-head">
                <span className="stat-title">{t('Toplam katılımcı')}</span>
              </header>
              <p className="stat-value">{totals.people.toLocaleString(locale())}</p>
            </article>
            <article className="stat stat--kids">
              <header className="stat-head">
                <span className="stat-title">{t('Onay bekleyen')}</span>
              </header>
              <p className="stat-value">{totals.pending.toLocaleString(locale())}</p>
            </article>
          </div>

          <div className="chart-grid">
            <section className="panel">
              <h4 className="panel-title">{t('Hoca başına verilen saat')}</h4>
              <BarRows
                data={byInstructor}
                suffix={` ${t('saat')}`}
                empty={t('Bu dönemde ders yok.')}
              />
            </section>

            <section className="panel">
              <h4 className="panel-title">{t('Zaman içinde ders sayısı')}</h4>
              <Columns data={overTime} empty={t('Bu dönemde ders yok.')} />
            </section>

            <section className="panel">
              <h4 className="panel-title">{t('Ders tipi dağılımı')}</h4>
              <Split data={byType} empty={t('Bu dönemde ders yok.')} />
            </section>

            <section className="panel">
              <h4 className="panel-title">{t('Talep durumu')}</h4>
              <Split data={byStatus} empty={t('Bu dönemde ders yok.')} />
            </section>
          </div>

          <section className="panel">
            <h4 className="panel-title">{t('Hoca bazında özet')}</h4>
            {table.length === 0 ? (
              <p className="chart-empty">{t('Bu dönemde ders yok.')}</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('Hoca')}</th>
                      <th>{t('Ders')}</th>
                      <th>{t('Saat')}</th>
                      <th>{t('Bireysel')}</th>
                      <th>{t('Grup')}</th>
                      <th>{t('Çocuk kampı')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {table.map((r) => (
                      <tr key={r.name}>
                        <td>{r.name}</td>
                        <td>{r.lessons}</td>
                        <td>{r.hours}</td>
                        <td>{r.individual}</td>
                        <td>{r.group}</td>
                        <td>{r.kids}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      <p className="admin-hint">
        {t(
          'Hesap sayısı giriş yapabilen kişileri gösterir — müşterilerin hesabı yoktur. Bu ay verilen ders, bu ay başlayan onaylı rezervasyonların toplam saatidir.',
        )}
      </p>
    </section>
  );
}
