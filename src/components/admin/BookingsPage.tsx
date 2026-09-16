import { useCallback, useEffect, useMemo, useState } from 'react';
import { useT } from '../../lib/i18n';
import type { BookingStatus, Instructor, ManagedBooking } from '../../types';
import * as api from '../../api/client';
import { addDays, todayKey, fromDateKey, formatTime } from '../../lib/date';
import { locale } from '../../lib/i18n';
import { describeLesson, lessonClass, SPORT_LABEL } from '../../lib/lessons';
import { downloadCsv } from '../../lib/csv';
import MultiSelect from './MultiSelect';

const STATUS_LABEL: Record<BookingStatus, string> = {
  pending: 'Ön rezervasyon',
  approved: 'Onaylı',
  rejected: 'İptal edilen',
};

const STATUSES: { value: BookingStatus | 'all'; label: string }[] = [
  { value: 'approved', label: 'Onaylı' },
  { value: 'all', label: 'Tümü' },
  { value: 'rejected', label: 'İptal edilen' },
];

type Props = {
  instructors: Instructor[];
  onChanged: () => void;
};

export default function BookingsPage({ instructors, onChanged }: Props) {
  const { t } = useT();
  const [from, setFrom] = useState(addDays(todayKey(), -30));
  const [to, setTo] = useState(addDays(todayKey(), 30));
  const [rows, setRows] = useState<ManagedBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<BookingStatus | 'all'>('approved');
  const [pickedInstructors, setPickedInstructors] = useState<string[]>([]);
  const [sport, setSport] = useState<'all' | 'windsurf' | 'wingfoil'>('all');
  /** A guest lesson is taught time that belongs to nobody; often asked apart. */
  const [who, setWho] = useState<'all' | 'guest' | 'customer'>('all');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const end = fromDateKey(to);
      end.setDate(end.getDate() + 1);
      setRows(await api.listBookingsBetween(fromDateKey(from).toISOString(), end.toISOString()));
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

  const shown = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr');
    return rows.filter((r) => {
      if (status !== 'all' && r.status !== status) return false;
      if (pickedInstructors.length > 0 && !pickedInstructors.includes(r.instructorId)) return false;
      if (sport !== 'all' && r.sport !== sport) return false;
      if (who === 'guest' && !r.isGuest) return false;
      if (who === 'customer' && r.isGuest) return false;
      if (!q) return true;
      return (
        r.id.toLowerCase().includes(q) ||
        (r.customerName ?? '').toLocaleLowerCase('tr').includes(q) ||
        (r.customerEmail ?? '').toLocaleLowerCase('tr').includes(q)
      );
    });
  }, [rows, status, pickedInstructors, sport, who, search]);

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
      <div className="admin-bar">
        <h2 className="admin-title">{t('Rezervasyonlar')}</h2>
        <span className="admin-count">
          {shown.length} / {rows.length}
        </span>
        <button
          className="btn btn--ghost btn--small"
          onClick={() =>
            downloadCsv(
              `rezervasyonlar-${from}_${to}`,
              [
                t('Tarih'),
                t('Saat'),
                t('Hoca'),
                t('Müşteri'),
                t('Telefon'),
                t('Ders'),
                t('Süre'),
                t('Durum'),
              ],
              shown.map((r) => [
                new Date(r.startsAt).toLocaleDateString(locale()),
                formatTime(r.startsAt),
                r.instructorName,
                r.isGuest ? t('Misafir') : (r.customerName ?? ''),
                r.isGuest ? '' : (r.customerPhone ?? ''),
                describeLesson(r),
                r.durationHours,
                t(STATUS_LABEL[r.status]),
              ]),
            )
          }
          disabled={shown.length === 0}
        >
          {t('Excel’e aktar')}
        </button>
      </div>

      {error && <p className="dialog-error">{error}</p>}

      <div className="filters">
        <div className="segmented" role="group" aria-label={t('Duruma göre filtrele')}>
          {STATUSES.map((s) => (
            <button
              key={s.value}
              className={`segment${status === s.value ? ' is-active' : ''}`}
              onClick={() => setStatus(s.value)}
              aria-pressed={status === s.value}
            >
              {t(s.label)}
            </button>
          ))}
        </div>

        <MultiSelect
          label={t('Hoca')}
          allLabel={t('Tüm hocalar')}
          options={instructors.map((i) => ({ value: i.id, label: i.name }))}
          picked={pickedInstructors}
          onChange={setPickedInstructors}
        />

        <select
          value={sport}
          onChange={(e) => setSport(e.target.value as typeof sport)}
          aria-label={t('Spor')}
        >
          <option value="all">{t('Tüm dersler')}</option>
          <option value="windsurf">{SPORT_LABEL.windsurf}</option>
          <option value="wingfoil">{SPORT_LABEL.wingfoil}</option>
        </select>

        <select
          value={who}
          onChange={(e) => setWho(e.target.value as typeof who)}
          aria-label={t('Kim')}
        >
          <option value="all">{t('Tümü')}</option>
          <option value="customer">{t('Müşteri dersleri')}</option>
          <option value="guest">{t('Misafir dersleri')}</option>
        </select>

        <label className="range">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label={t('Başlangıç')} />
          <span>–</span>
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} aria-label={t('Bitiş')} />
        </label>

        <input
          className="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('İsim veya rezervasyon ID ara')}
          aria-label={t('Ara')}
        />
      </div>

      {loading ? (
        <p className="admin-hint">{t('Yükleniyor…')}</p>
      ) : shown.length === 0 ? (
        <p className="mybookings-empty">{t('Bu filtreye uyan rezervasyon yok.')}</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>{t('Öğrenci')}</th>
                <th>{t('Hoca')}</th>
                <th>{t('Ders')}</th>
                <th>{t('Tarih / saat')}</th>
                <th>{t('Süre')}</th>
                <th>{t('Durum')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const start = new Date(r.startsAt);
                const end = new Date(start.getTime() + r.durationHours * 60 * 60 * 1000);
                return (
                  <tr key={r.id}>
                    <td className="cell-mono" title={r.id}>
                      {r.id.slice(0, 8)}
                    </td>
                    <td>
                      {r.isGuest ? (
                        <span className="cell-dim">{t('Misafir')}</span>
                      ) : (
                        (r.customerName ?? r.customerEmail ?? '—')
                      )}
                      {r.customerPhone && <div className="cell-dim">{r.customerPhone}</div>}
                    </td>
                    <td>{r.instructorName}</td>
                    <td>
                      <span className={`tag tag--${lessonClass(r)}`}>{describeLesson(r)}</span>
                    </td>
                    <td>
                      {start.toLocaleDateString(locale())}
                      <div className="cell-dim">
                        {formatTime(r.startsAt)} – {formatTime(end.toISOString())}
                      </div>
                    </td>
                    <td>
                      {r.durationHours} {t('saat')}
                    </td>
                    <td>
                      {r.status === 'approved' ? (
                        <span className="cell-dim">—</span>
                      ) : (
                        <span className={`status status--${r.status}`}>
                          {t(STATUS_LABEL[r.status])}
                        </span>
                      )}
                    </td>
                    <td>
                      {r.status === 'pending' && (
                        <div className="row-actions">
                          <button
                            className="btn btn--small"
                            onClick={() => decide(r.id, 'approved')}
                            disabled={busyId === r.id}
                          >
                            {t('Onayla')}
                          </button>
                          <button
                            className="link-btn danger"
                            onClick={() => decide(r.id, 'rejected')}
                            disabled={busyId === r.id}
                          >
                            {t('Reddet')}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
