import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CampRegistration, KidsCampEntry } from '../../types';
import { locale, useT } from '../../lib/i18n';
import * as api from '../../api/client';
import CampRegistrationForm from './CampRegistrationForm';

/** Seasons the roll can be filtered by, newest first. */
function seasons(): number[] {
  const now = new Date().getFullYear();
  return [now + 2, now + 1, now, now - 1, now - 2];
}

type Props = { onChanged: () => void };

/**
 * The camp roll.
 *
 * A camp is booked like any other lesson, so this is the same data the bookings
 * page holds — but a camp is run as a group of children over days, and whoever
 * runs it needs the parents' phone numbers in one place, not one booking at a
 * time. The bottom half collapses the bookings into one row per child.
 */
export default function KidsCampPage({ onChanged }: Props) {
  const { t } = useT();

  const [rows, setRows] = useState<KidsCampEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [season, setSeason] = useState(new Date().getFullYear());
  const [roll, setRoll] = useState<CampRegistration[]>([]);
  const [adding, setAdding] = useState(false);
  const [openReg, setOpenReg] = useState<CampRegistration | null>(null);

  /** A season is its calendar year; the bookings follow the same filter. */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const start = new Date(season, 0, 1).toISOString();
      const end = new Date(season + 1, 0, 1).toISOString();
      setRows(await api.listKidsCamp(start, end));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [season]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Who is signed up for the season, which is not the same as who is booked. */
  const loadRoll = useCallback(async () => {
    try {
      setRoll(await api.listCampRegistrations(season));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [season]);

  useEffect(() => {
    void loadRoll();
  }, [loadRoll]);

  async function removeRegistration(r: CampRegistration) {
    if (!window.confirm(t('{n} kaydı silinsin mi?').replace('{n}', r.childName))) return;
    try {
      await api.deleteCampRegistration(r.registrationId);
      await loadRoll();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  /** One row per child, with every date they are booked for. */
  const children = useMemo(() => {
    const map = new Map<
      string,
      {
        customerId: string;
        name: string | null;
        email: string | null;
        phone: string | null;
        guardianName: string | null;
        guardianPhone: string | null;
        allergyNote: string | null;
        age: number | null;
        days: string[];
        hours: number;
        pending: number;
      }
    >();
    for (const r of rows) {
      if (r.status === 'rejected') continue;
      if (!r.customerId) continue;
      const row = map.get(r.customerId) ?? {
        customerId: r.customerId,
        name: r.name,
        email: r.email,
        phone: r.phone,
        guardianName: r.guardianName,
        guardianPhone: r.guardianPhone,
        allergyNote: r.allergyNote,
        age: r.age,
        days: [],
        hours: 0,
        pending: 0,
      };
      row.days.push(new Date(r.startsAt).toLocaleDateString(locale()));
      row.hours += r.durationHours;
      if (r.status === 'pending') row.pending += 1;
      map.set(r.customerId, row);
    }
    return [...map.values()].sort((a, b) => b.hours - a.hours);
  }, [rows]);

  return (
    <section>
      <h2 className="admin-title">{t('Çocuk Kampı')}</h2>

      {error && <p className="dialog-error">{error}</p>}

      <section className="panel">
        <div className="admin-bar">
          <h4 className="panel-title">{t('Sezon kayıtları')}</h4>
          <select
            value={season}
            onChange={(e) => setSeason(Number(e.target.value))}
            aria-label={t('Sezon')}
          >
            {seasons().map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <span className="admin-count">{roll.length}</span>
          <button className="btn" onClick={() => setAdding(true)}>
            {t('Kamp Kaydı Ekle')}
          </button>
        </div>

        {roll.length === 0 ? (
          <p className="cell-dim">{t('Bu sezonda kayıtlı çocuk yok.')}</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('Çocuk')}</th>
                  <th>{t('Veli')}</th>
                  <th>{t('Acil durumda aranacak')}</th>
                  <th>{t('Dikkat')}</th>
                  <th>{t('Form')}</th>
                  <th className="num">{t('Gün')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {roll.map((r) => (
                  <tr key={r.registrationId}>
                    <td>
                      <button className="link-btn" onClick={() => setOpenReg(r)}>
                        {r.childName}
                      </button>
                      {r.age !== null && <span className="cell-dim"> · {r.age}</span>}
                    </td>
                    <td className="cell-dim">
                      {r.guardianName ?? '—'}
                      {r.guardianPhone && (
                        <div>
                          <a href={`tel:${r.guardianPhone}`}>{r.guardianPhone}</a>
                        </div>
                      )}
                    </td>
                    <td className="cell-dim">
                      {[
                        [r.emergency1Name, r.emergency1Phone],
                        [r.emergency2Name, r.emergency2Phone],
                      ]
                        .filter(([n]) => n)
                        .map(([n, p]) => `${n}${p ? ` (${p})` : ''}`)
                        .join(' · ') || '—'}
                    </td>
                    <td>
                      {r.allergyNote ? (
                        <span className="alert-tag">{r.allergyNote}</span>
                      ) : (
                        <span className="cell-dim">—</span>
                      )}
                    </td>
                    <td>
                      {r.documents > 0 ? (
                        <span className="status status--approved">{r.documents}</span>
                      ) : (
                        <span className="status status--pending">{t('Yok')}</span>
                      )}
                    </td>
                    <td className="num">{r.days}</td>
                    <td>
                      <div className="row-actions">
                        <button className="link-btn" onClick={() => setOpenReg(r)}>
                          {t('Düzenle')}
                        </button>
                        <button className="link-btn danger" onClick={() => removeRegistration(r)}>
                          {t('Sil')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {loading ? (
        <p className="admin-hint">{t('Yükleniyor…')}</p>
      ) : rows.length === 0 ? (
        <p className="mybookings-empty">{t('Bu sezonda çocuk kampı rezervasyonu yok.')}</p>
      ) : (
        <>
          <section className="panel">
            <h4 className="panel-title">
              {t('Kampa kayıtlı çocuklar')} · {children.length}
            </h4>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('İsim')}</th>
                    <th>{t('Veli')}</th>
                    <th>{t('Dikkat')}</th>
                    <th>{t('Gün')}</th>
                    <th>{t('Saat')}</th>
                    <th>{t('Tarihler')}</th>
                  </tr>
                </thead>
                <tbody>
                  {children.map((c) => (
                    <tr key={c.customerId}>
                      <td>
                        {c.name ?? t('İsimsiz')}
                        {c.age !== null && <span className="cell-dim"> · {c.age}</span>}
                        {c.pending > 0 && (
                          <span className="status status--pending"> {t('Beklemede')}</span>
                        )}
                      </td>
                      <td className="cell-dim">
                        {c.guardianName ?? '—'}
                        {c.guardianPhone && (
                          <div>
                            <a href={`tel:${c.guardianPhone}`}>{c.guardianPhone}</a>
                          </div>
                        )}
                      </td>
                      <td>
                        {c.allergyNote ? (
                          <span className="alert-tag">{c.allergyNote}</span>
                        ) : (
                          <span className="cell-dim">—</span>
                        )}
                      </td>
                      <td>{c.days.length}</td>
                      <td>{c.hours}</td>
                      <td className="cell-dim">{c.days.join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

        </>
      )}
      {(adding || openReg) && (
        <CampRegistrationForm
          season={season}
          registration={openReg}
          onClose={() => {
            setAdding(false);
            setOpenReg(null);
          }}
          onSaved={async (registrationId) => {
            setAdding(false);
            const fresh = await api.listCampRegistrations(season).catch(() => null);
            if (fresh) setRoll(fresh);
            // Adding the photograph is the next thing anybody does, and it can
            // only happen once the registration exists — so the dialog stays
            // open on it instead of sending them back to find the child again.
            if (registrationId && fresh) {
              setOpenReg(fresh.find((x) => x.registrationId === registrationId) ?? null);
            }
            onChanged();
          }}
        />
      )}
    </section>
  );
}
