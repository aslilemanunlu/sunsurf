import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CampAttendance, CampAttendanceTotal, CampRegistration } from '../../types';
import { locale, useT } from '../../lib/i18n';
import * as api from '../../api/client';
import { fromDateKey, todayKey } from '../../lib/date';
import { downloadCsv } from '../../lib/csv';
import CampRegistrationForm from './CampRegistrationForm';
import AttendanceSheet from './AttendanceSheet';

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
  /** Who is on the register for this day — not who is registered for the season. */
  const [here, setHere] = useState<CampAttendance[]>([]);
  const [totals, setTotals] = useState<CampAttendanceTotal[]>([]);
  const [recent, setRecent] = useState<CampAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  /** Children ticked on the day's list, for taking several off at once. */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** The season table is the detail behind the totals, not the first thing seen. */
  const [listOpen, setListOpen] = useState(false);
  /**
   * Registrations the sheet has just created for children nobody had a form
   * for. They are offered one straight afterwards, while the parent is still
   * standing there.
   */
  const [needForms, setNeedForms] = useState<string[]>([]);
  /** The registration whose full form is open, when one is. */
  const [formFor, setFormFor] = useState<CampRegistration | null>(null);

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
      setHere(today);
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

  // a selection belongs to the day it was made on
  useEffect(() => {
    setSelected(new Set());
  }, [day, season]);

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

  function pick(registrationId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(registrationId)) next.delete(registrationId);
      else next.add(registrationId);
      return next;
    });
  }

  /**
   * Takes everybody ticked off this day's register.
   *
   * A ticked child with no mark has nothing to remove, so they are skipped
   * rather than counted — the confirmation says how many marks will actually go.
   */
  async function removeSelected() {
    const marked = [...selected].filter((id) => marks.get(id));
    if (marked.length === 0) {
      setSelected(new Set());
      setError(t('Seçilen çocukların bu gün için yoklaması yok.'));
      return;
    }
    if (
      !window.confirm(
        t('{n} çocuğun bu günkü yoklaması silinsin mi?').replace('{n}', String(marked.length)),
      )
    ) {
      return;
    }
    setError(null);
    try {
      for (const id of marked) await api.setCampAttendance(id, day, null);
      setSelected(new Set());
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      await load();
    }
  }

  /** Takes one child off one day, from the day-by-day list. */
  async function removeMark(registrationId: string, onDay: string, childName: string) {
    if (!window.confirm(t('{n} için bu günün yoklaması silinsin mi?').replace('{n}', childName))) {
      return;
    }
    setError(null);
    try {
      await api.setCampAttendance(registrationId, onDay, null);
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  /** Wipes a whole day, for the day that was taken by mistake. */
  async function removeDay(onDay: string) {
    const label = fromDateKey(onDay).toLocaleDateString(locale(), {
      day: 'numeric',
      month: 'long',
    });
    if (!window.confirm(t('{d} günündeki tüm yoklama silinsin mi?').replace('{d}', label))) {
      return;
    }
    setError(null);
    try {
      await api.clearCampDay(season, onDay);
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const byRegistration = useMemo(() => new Map(roll.map((r) => [r.registrationId, r])), [roll]);

  const counts = useMemo(() => {
    const values = [...marks.values()];
    return {
      full: values.filter((m) => m === 'full').length,
      half: values.filter((m) => m === 'half').length,
    };
  }, [marks]);

  /**
   * Only the children who actually came.
   *
   * The totals view carries every registration, so a child who was signed up
   * and never turned up would sit in the season list on nought days — a name
   * saying nothing, in the one place that is about days attended.
   */
  const came = useMemo(() => totals.filter((r) => r.fullDays + r.halfDays > 0), [totals]);

  /** The season in four numbers; the per-child table is behind a toggle. */
  const seasonStats = useMemo(() => {
    return {
      children: came.length,
      full: came.reduce((s, r) => s + r.fullDays, 0),
      half: came.reduce((s, r) => s + r.halfDays, 0),
      days: came.reduce((s, r) => s + r.totalDays, 0),
    };
  }, [came]);

  /** Every day that has marks, newest first — the season at a glance. */
  const byDay = useMemo(() => {
    const map = new Map<string, CampAttendance[]>();
    for (const a of recent) map.set(a.day, [...(map.get(a.day) ?? []), a]);
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [recent]);

  /** The new children, once the reload has brought their registrations back. */
  const waitingForForms = useMemo(
    () => roll.filter((r) => needForms.includes(r.registrationId)),
    [roll, needForms],
  );

  function exportSeason() {
    downloadCsv(
      `cocuk-kampi-yoklama-${season}`,
      [t('Çocuk'), t('Tam gün'), t('Yarım gün'), t('Toplam gün')],
      came.map((r) => [r.childName, r.fullDays, r.halfDays, r.totalDays]),
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
          disabled={came.length === 0}
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
            {counts.full} {t('tam')} · {counts.half} {t('yarım')}
          </span>
          <button className="btn btn--small" onClick={() => setSheetOpen(true)}>
            + {t('Yoklama ekle')}
          </button>
        </div>

        {loading ? (
          <p className="admin-hint">{t('Yükleniyor…')}</p>
        ) : here.length === 0 ? (
          <p className="cell-dim">
            {t('Bu gün için yoklama yok. “Yoklama ekle” ile gelen çocukları işaretleyin.')}
          </p>
        ) : (
          <ul className="register">
            {here.map((a) => {
              const child = byRegistration.get(a.registrationId);
              const current = marks.get(a.registrationId) ?? null;
              return (
                <li key={a.registrationId} className={current ? 'is-here' : undefined}>
                  <input
                    type="checkbox"
                    className="register-pick"
                    checked={selected.has(a.registrationId)}
                    onChange={() => pick(a.registrationId)}
                    aria-label={t('Seç')}
                  />
                  {/* the tick is the state, so a full row reads from across a beach */}
                  <span className={'tick' + (current ? ' is-on' : '')} aria-hidden="true">
                    {current ? '✓' : ''}
                  </span>
                  <span className="register-name">
                    <span className="register-title">
                      {a.childName}
                      {child?.age != null && <span className="cell-dim"> · {child.age}</span>}
                    </span>
                    <span className="register-sub">
                      {child?.guardianPhone
                        ? t('Veli') + ': ' + child.guardianPhone
                        : t(current === 'half' ? 'Yarım gün' : 'Tam gün')}
                    </span>
                    {child?.allergyNote && (
                      <span className="register-alert">
                        {t('Alerji')}: {child.allergyNote}
                      </span>
                    )}
                  </span>
                  <span className="segmented">
                    {MARKS.map((m) => (
                      <button
                        key={m.value}
                        className={'segment' + (current === m.value ? ' is-active' : '')}
                        disabled={busy === a.registrationId}
                        onClick={() => mark(a.registrationId, m.value)}
                        aria-pressed={current === m.value}
                      >
                        {t(m.label)}
                      </button>
                    ))}
                  </span>
                  <button
                    className="iconbtn"
                    disabled={busy === a.registrationId}
                    onClick={() => mark(a.registrationId, null)}
                    title={t('Yoklamadan kaldır')}
                    aria-label={t('Yoklamadan kaldır')}
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {selected.size > 0 && (
          <div className="bulkbar">
            <span>
              {selected.size} {t('çocuk seçildi')}
            </span>
            <button className="link-btn" onClick={() => setSelected(new Set())}>
              {t('Seçimi bırak')}
            </button>
            <button className="btn btn--small btn--danger" onClick={removeSelected}>
              {t('Seçilenleri kaldır')}
            </button>
          </div>
        )}

        <p className="admin-hint">
          {t(
            'Bu liste o gün gelenlerdir. Kamp kaydı olan bir çocuk, siz yoklamaya eklemeden burada görünmez.',
          )}
        </p>
      </section>

      <section className="panel">
        <div className="admin-bar">
          <h4 className="panel-title">{t('Sezon toplamı')}</h4>
          {came.length > 0 && (
            <button className="link-btn" onClick={() => setListOpen((v) => !v)}>
              {t(listOpen ? 'Liste görünümünü kapat' : 'Liste görünümünü aç')}
            </button>
          )}
        </div>

        {came.length === 0 ? (
          <p className="cell-dim">{t('Henüz yoklama yok.')}</p>
        ) : (
          <>
            <div className="stat-grid stat-grid--compact">
              <article className="stat stat--accent">
                <header className="stat-head">
                  <span className="stat-title">{t('Kampa gelen çocuk')}</span>
                </header>
                <p className="stat-value">{seasonStats.children}</p>
              </article>
              <article className="stat stat--individual">
                <header className="stat-head">
                  <span className="stat-title">{t('Tam gün')}</span>
                </header>
                <p className="stat-value">{seasonStats.full}</p>
              </article>
              <article className="stat stat--group">
                <header className="stat-head">
                  <span className="stat-title">{t('Yarım gün')}</span>
                </header>
                <p className="stat-value">{seasonStats.half}</p>
              </article>
              <article className="stat stat--kids">
                <header className="stat-head">
                  <span className="stat-title">{t('Toplam gün')}</span>
                </header>
                <p className="stat-value">{seasonStats.days}</p>
              </article>
            </div>

            {listOpen && (
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
                    {came.map((r) => (
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
          </>
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
                  <button className="link-btn" onClick={() => setDay(d)}>
                    {t('Bu güne git')}
                  </button>
                  <button className="link-btn danger" onClick={() => removeDay(d)}>
                    {t('Günü sil')}
                  </button>
                </h4>
                <ul>
                  {entries.map((a) => (
                    <li key={a.id} className="lessonlist-item attrow">
                      <span className="lessonlist-who">{a.childName}</span>
                      <span className={`tag tag--${a.kind === 'full' ? 'individual' : 'group'}`}>
                        {t(a.kind === 'full' ? 'Tam gün' : 'Yarım gün')}
                      </span>
                      <button
                        className="link-btn danger"
                        onClick={() => removeMark(a.registrationId, a.day, a.childName)}
                        title={t('Sil')}
                      >
                        {t('Sil')}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </section>

      {sheetOpen && (
        <AttendanceSheet
          season={season}
          initialDay={day}
          registered={roll}
          onClose={(created) => {
            setSheetOpen(false);
            // a child registered from the sheet exists even if it was cancelled
            if (created.length > 0) {
              setNeedForms(created);
              void load();
              onChanged();
            }
          }}
          onDone={(takenDay, created) => {
            setSheetOpen(false);
            setDay(takenDay);
            setNeedForms(created);
            void load();
            onChanged();
          }}
        />
      )}

      {waitingForForms.length > 0 && !formFor && (
        <div className="overlay" onClick={() => setNeedForms([])}>
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="newkids-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="newkids-title">{t('Yeni çocuklar eklendi')}</h3>
            <p className="admin-hint">
              {t('Kamp formlarını şimdi doldurabilirsin: veli, telefon, alerji ve belgeler.')}
            </p>
            <ul className="register">
              {waitingForForms.map((r) => (
                <li key={r.registrationId}>
                  <span className="register-name">{r.childName}</span>
                  <button className="btn btn--small" onClick={() => setFormFor(r)}>
                    {t('Form oluştur')}
                  </button>
                </li>
              ))}
            </ul>
            <div className="dialog-actions">
              <button className="btn btn--ghost" onClick={() => setNeedForms([])}>
                {t('Sonra')}
              </button>
            </div>
          </div>
        </div>
      )}

      {formFor && (
        <CampRegistrationForm
          season={season}
          registration={formFor}
          onClose={() => {
            // whatever was filled in, this child no longer needs asking about
            setNeedForms((prev) => prev.filter((id) => id !== formFor.registrationId));
            setFormFor(null);
          }}
          onSaved={() => {
            void load();
            onChanged();
          }}
        />
      )}
    </section>
  );
}
