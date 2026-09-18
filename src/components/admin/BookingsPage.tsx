import { useCallback, useEffect, useMemo, useState } from 'react';
import { useT } from '../../lib/i18n';
import type { BookingStatus, CrmCustomer, Instructor, ManagedBooking } from '../../types';
import * as api from '../../api/client';
import { addDays, todayKey, fromDateKey, formatTime } from '../../lib/date';
import { locale } from '../../lib/i18n';
import { describeLesson, lessonClass, SPORT_LABEL } from '../../lib/lessons';
import { downloadCsv } from '../../lib/csv';
import MultiSelect from './MultiSelect';
import CustomerDrawer from './CustomerDrawer';

/**
 * A booking is either on the calendar or it is not. Nothing is written down
 * tentatively any more, so 'pending' only survives on rows written before that
 * and reads the same as approved.
 */
const STATUS_LABEL: Record<BookingStatus, string> = {
  pending: 'Onaylı',
  approved: 'Onaylı',
  rejected: 'İptal edilen / silinen',
};

const STATUSES: { value: BookingStatus; label: string }[] = [
  { value: 'approved', label: 'Onaylı' },
  { value: 'rejected', label: 'İptal edilen / silinen' },
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
  /**
   * Every filter takes several answers, and an empty one means everything.
   *
   * The exception is the status, which starts on the lessons that actually
   * happened: a cancelled booking is not what somebody opens this page to see,
   * but unticking is one click when they want it.
   */
  const [pickedStatuses, setPickedStatuses] = useState<string[]>(['approved']);
  const [pickedInstructors, setPickedInstructors] = useState<string[]>([]);
  const [pickedSports, setPickedSports] = useState<string[]>([]);
  /** A guest lesson is taught time that belongs to nobody; often asked apart. */
  const [pickedWho, setPickedWho] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  /** The customer records, so a name in the table can open its own card. */
  const [people, setPeople] = useState<CrmCustomer[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const end = fromDateKey(to);
      end.setDate(end.getDate() + 1);
      const [list, crm] = await Promise.all([
        api.listBookingsBetween(fromDateKey(from).toISOString(), end.toISOString()),
        api.listCrmCustomers().catch(() => [] as CrmCustomer[]),
      ]);
      setRows(list);
      setPeople(crm);
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
      if (pickedStatuses.length > 0 && !pickedStatuses.includes(r.status)) return false;
      if (pickedInstructors.length > 0 && !pickedInstructors.includes(r.instructorId)) return false;
      if (pickedSports.length > 0 && !pickedSports.includes(r.sport ?? '')) return false;
      if (pickedWho.length > 0 && !pickedWho.includes(r.isGuest ? 'guest' : 'customer')) {
        return false;
      }
      if (!q) return true;
      return (
        r.id.toLowerCase().includes(q) ||
        (r.customerName ?? '').toLocaleLowerCase('tr').includes(q) ||
        (r.customerEmail ?? '').toLocaleLowerCase('tr').includes(q)
      );
    });
  }, [rows, pickedStatuses, pickedInstructors, pickedSports, pickedWho, search]);

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

  const open = people.find((c) => c.customerId === openId) ?? null;

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
        <MultiSelect
          label={t('Duruma göre filtrele')}
          allLabel={t('Tüm durumlar')}
          options={STATUSES.map((s) => ({ value: s.value, label: t(s.label) }))}
          picked={pickedStatuses}
          onChange={setPickedStatuses}
        />

        <MultiSelect
          label={t('Hoca')}
          allLabel={t('Tüm hocalar')}
          options={instructors.map((i) => ({ value: i.id, label: i.name }))}
          picked={pickedInstructors}
          onChange={setPickedInstructors}
        />

        <MultiSelect
          label={t('Spor')}
          allLabel={t('Tüm dersler')}
          options={[
            { value: 'windsurf', label: SPORT_LABEL.windsurf },
            { value: 'wingfoil', label: SPORT_LABEL.wingfoil },
            { value: '', label: t('Çocuk kampı') },
          ]}
          picked={pickedSports}
          onChange={setPickedSports}
        />

        <MultiSelect
          label={t('Kim')}
          allLabel={t('Müşteri ve misafir')}
          options={[
            { value: 'customer', label: t('Müşteri dersleri') },
            { value: 'guest', label: t('Misafir dersleri') },
          ]}
          picked={pickedWho}
          onChange={setPickedWho}
        />

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
                      ) : r.customerId ? (
                        <button className="link-btn" onClick={() => setOpenId(r.customerId)}>
                          {r.customerName ?? r.customerEmail ?? '—'}
                        </button>
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
                      {r.status !== 'rejected' && (
                        <button
                          className="link-btn danger"
                          onClick={() => decide(r.id, 'rejected')}
                          disabled={busyId === r.id}
                        >
                          {t('İptal et')}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <CustomerDrawer
          customer={open}
          onClose={() => setOpenId(null)}
          onChanged={() => {
            void load();
            onChanged();
          }}
        />
      )}
    </section>
  );
}
