import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CampAttendance, CampAttendanceTotal, CampRegistration } from '../../types';
import { locale, useT } from '../../lib/i18n';
import * as api from '../../api/client';
import { fromDateKey, todayKey } from '../../lib/date';
import { downloadCsv } from '../../lib/csv';
import CampRegistrationForm from './CampRegistrationForm';

type Props = {
  season: number;
  onSeason: (year: number) => void;
  onChanged: () => void;
};

type Mark = 'full' | 'half' | null;

const MARKS: { value: Exclude<Mark, null>; label: string }[] = [
  { value: 'full', label: 'Tam gün' },
  { value: 'half', label: 'Yarım gün' },
];

/**
 * The register: who came today, and for how much of the day.
 *
 * Three taps per child at most, because it is filled in on a beach with twenty
 * children waiting. A child with no mark simply did not come — there is no
 * "absent" to record, and an absence table would have to be filled in for
 * everybody every day to stay true.
 *
 * Names come from the season's registrations. Somebody who turns up without one
 * gets registered from here rather than from another page.
 */
export default function CampAttendancePage({ season, onSeason, onChanged }: Props) {
  const { t } = useT();
  const [day, setDay] = useState(todayKey());
  const [roll, setRoll] = useState<CampRegistration[]>([]);
  const [marks, setMarks] = useState<Map<string, Mark>>(new Map());
  const [totals, setTotals] = useState<CampAttendanceTotal[]>([]);
  const [recent, setRecent] = useState<CampAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [children, today, sums, all] = await Promise.all([
        api.listCampRegistrations(season),
        api.listCampAttendance(season, day),
        api.listCampTotals(season),
        api.listCampAttendance(season),
      ]);
      setRoll(children);
      setMarks(new Map(today.map((a) => [a.registrationId, a.kind as Mark])));
      setTotals(sums);
      setRecent(all);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [season, day]);

  useEffect(() => {
    void load();
  }, [load]);

  async function mark(registrationId: string, next: Mark) {
    setBusy(registrationId);
    setError(null);
    // the row moves under the finger before the round trip finishes
    setMarks((prev) => new Map(prev).set(registrationId, next));
    try {
      await api.setCampAttendance(registrationId, day, next);
      const [sums, all] = await Promise.all([
        api.listCampTotals(season),
        api.listCampAttendance(season),
      ]);
      setTotals(sums);
      setRecent(all);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      await load(); // put the row back to whatever the database actually says
    } finally {
      setBusy(null);
    }
  }

  const here = useMemo(() => {
    const values = [...marks.values()];
    return {
      full: values.filter((m) => m === 'full').length,
      half: values.filter((m) => m === 'half').length,
    };
  }, [marks]);

  /** Every day that has marks, newest first — the season at a glance. */
  const byDay = useMemo(() => {
    const map = new Map<string, CampAttendance[]>();
    for (const a of recent) map.set(a.day, [...(map.get(a.day) ?? []), a]);
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [recent]);

  function exportSeason() {
    downloadCsv(
      `cocuk-kampi-yoklama-${season}`,
      [t('Çocuk'), t('Tam gün'), t('Yarım gün'), t('Toplam gün')],
      totals.map((r) => [r.childName, r.fullDays, r.halfDays, r.totalDays]),
    );
  }

  return (
    <section>
      <div className="admin-bar">
        <h2 className="admin-title">{t('Yoklama')}</h2>
        <select
          value={season}
          onChange={(e) => onSeason(Number(e.target.value))}
          aria-label={t('Sezon')}
        >
          {[2, 1, 0, -1, -2].map((d) => {
            const y = new Date().getFullYear() + d;
            return (
              <option key={y} value={y}>
                {y}
              </option>
            );
          })}
        </select>
        <input
          type="date"
          value={day}
          onChange={(e) => e.target.value && setDay(e.target.value)}
          aria-label={t('Gün seç')}
        />
        <button className="btn btn--ghost btn--small" onClick={() => setDay(todayKey())}>
          {t('Bugün')}
        </button>
        <button
          className="btn btn--ghost btn--small"
          onClick={exportSeason}
          disabled={totals.length === 0}
        >
          {t('Excel’e aktar')}
        </button>
      </div>

      {error && <p className="dialog-error">{error}</p>}

      <section className="panel">
        <div className="admin-bar">
          <h4 className="panel-title">
            {fromDateKey(day).toLocaleDateString(locale(), {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </h4>
          <span className="admin-count">
            {here.full} {t('tam')} · {here.half} {t('yarım')}
          </span>
          <button className="btn btn--small" onClick={() => setAdding(true)}>
            {t('Kamp Kaydı Ekle')}
          </button>
        </div>

        {loading ? (
          <p className="admin-hint">{t('Yükleniyor…')}</p>
        ) : roll.length === 0 ? (
          <p className="cell-dim">{t('Bu sezonda kayıtlı çocuk yok.')}</p>
        ) : (
          <ul className="register">
            {roll.map((r) => {
              const current = marks.get(r.registrationId) ?? null;
              return (
                <li key={r.registrationId} className={current ? 'is-here' : undefined}>
                  <span className="register-name">
                    {r.childName}
                    {r.age !== null && <span className="cell-dim"> · {r.age}</span>}
                    {r.allergyNote && <span className="alert-tag">{r.allergyNote}</span>}
                  </span>
                  <span className="segmented">
                    {MARKS.map((m) => (
                      <button
                        key={m.value}
                        className={`segment${current === m.value ? ' is-active' : ''}`}
                        disabled={busy === r.registrationId}
                        onClick={() => mark(r.registrationId, current === m.value ? null : m.value)}
                        aria-pressed={current === m.value}
                      >
                        {t(m.label)}
                      </button>
                    ))}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="admin-hint">
          {t(
            'İşaretlenmeyen çocuk o gün gelmemiş sayılır. Aynı düğmeye tekrar basmak işareti kaldırır.',
          )}
        </p>
      </section>

      <section className="panel">
        <h4 className="panel-title">{t('Sezon toplamı')}</h4>
        {totals.length === 0 ? (
          <p className="cell-dim">{t('Henüz yoklama yok.')}</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('Çocuk')}</th>
                  <th className="num">{t('Tam gün')}</th>
                  <th className="num">{t('Yarım gün')}</th>
                  <th className="num">{t('Toplam gün')}</th>
                </tr>
              </thead>
              <tbody>
                {totals.map((r) => (
                  <tr key={r.registrationId}>
                    <td>{r.childName}</td>
                    <td className="num">{r.fullDays}</td>
                    <td className="num">{r.halfDays}</td>
                    <td className="num">{r.totalDays}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h4 className="panel-title">{t('Gün gün')}</h4>
        {byDay.length === 0 ? (
          <p className="cell-dim">{t('Henüz yoklama yok.')}</p>
        ) : (
          <div className="lessonlist">
            {byDay.map(([d, entries]) => (
              <section key={d} className="lessonlist-day">
                <h4 className="lessonlist-date">
                  {fromDateKey(d).toLocaleDateString(locale(), {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })}
                  <span className="cell-dim">
                    {' · '}
                    {entries.length} {t('çocuk')}
                  </span>
                </h4>
                <ul>
                  {entries.map((a) => (
                    <li key={a.id} className="lessonlist-item">
                      <span className="lessonlist-who">{a.childName}</span>
                      <span className={`tag tag--${a.kind === 'full' ? 'individual' : 'group'}`}>
                        {t(a.kind === 'full' ? 'Tam gün' : 'Yarım gün')}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </section>

      {adding && (
        <CampRegistrationForm
          season={season}
          registration={null}
          onClose={() => setAdding(false)}
          onSaved={() => {
            void load();
            onChanged();
          }}
        />
      )}
    </section>
  );
}
