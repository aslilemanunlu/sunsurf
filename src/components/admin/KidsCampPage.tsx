import { useCallback, useEffect, useMemo, useState } from 'react';
import type { KidsCampEntry } from '../../types';
import { locale, useT } from '../../lib/i18n';
import * as api from '../../api/client';
import { addDays, formatTime, fromDateKey, todayKey } from '../../lib/date';

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
  const [from, setFrom] = useState(addDays(todayKey(), -30));
  const [to, setTo] = useState(addDays(todayKey(), 60));
  const [rows, setRows] = useState<KidsCampEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const end = fromDateKey(to);
      end.setDate(end.getDate() + 1);
      setRows(await api.listKidsCamp(fromDateKey(from).toISOString(), end.toISOString()));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

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

  async function decide(id: string, next: 'approved' | 'rejected') {
    setBusyId(id);
    try {
      await api.decideBooking(id, next);
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section>
      <h2 className="admin-title">{t('Çocuk Kampı')}</h2>

      {error && <p className="dialog-error">{error}</p>}

      <div className="filters">
        <label className="range">
          <input
            type="date"
            value={from}
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
      </div>

      {loading ? (
        <p className="admin-hint">{t('Yükleniyor…')}</p>
      ) : rows.length === 0 ? (
        <p className="mybookings-empty">{t('Bu tarihlerde çocuk kampı kaydı yok.')}</p>
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

          <section className="panel">
            <h4 className="panel-title">{t('Kamp kayıtları')}</h4>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('Tarih / saat')}</th>
                    <th>{t('İsim')}</th>
                    <th>{t('Telefon')}</th>
                    <th>{t('Hoca')}</th>
                    <th>{t('Süre')}</th>
                    <th>{t('Durum')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.bookingId}>
                      <td>
                        {new Date(r.startsAt).toLocaleDateString(locale())}
                        <div className="cell-dim">{formatTime(r.startsAt)}</div>
                      </td>
                      <td>{r.name ?? t('İsimsiz')}</td>
                      <td className="cell-dim">{r.phone ?? '—'}</td>
                      <td>{r.instructorName ?? '—'}</td>
                      <td>
                        {r.durationHours} {t('saat')}
                      </td>
                      <td>
                        <span className={`status status--${r.status}`}>
                          {t(
                            r.status === 'approved'
                              ? 'Onaylı'
                              : r.status === 'pending'
                                ? 'Beklemede'
                                : 'Reddedildi',
                          )}
                        </span>
                      </td>
                      <td>
                        {r.status === 'pending' && (
                          <div className="row-actions">
                            <button
                              className="btn btn--small"
                              onClick={() => decide(r.bookingId, 'approved')}
                              disabled={busyId === r.bookingId}
                            >
                              {t('Onayla')}
                            </button>
                            <button
                              className="link-btn danger"
                              onClick={() => decide(r.bookingId, 'rejected')}
                              disabled={busyId === r.bookingId}
                            >
                              {t('Reddet')}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </section>
  );
}
