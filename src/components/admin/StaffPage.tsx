import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DirectoryUser, ManagedBooking, Role } from '../../types';
import { locale, useT } from '../../lib/i18n';
import * as api from '../../api/client';
import { SPORT_LABEL } from '../../lib/lessons';
import InstructorForm from './InstructorForm';

const ROLE_LABEL: Record<Role, string> = {
  admin: 'Yönetici',
  instructor: 'Hoca',
  customer: 'Erişimi yok',
};

type Props = { onChanged: () => void };

/** "2026-09" — the month a month picker gives back. */
function thisMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthBounds(key: string): [string, string] {
  const [y, m] = key.split('-').map(Number);
  return [new Date(y, m - 1, 1).toISOString(), new Date(y, m, 1).toISOString()];
}

/**
 * The staff list.
 *
 * "Linked" is the column that matters: an instructor profile can exist before
 * that person has an account, and until the two are joined they appear on the
 * calendar but cannot sign in and manage their own hours.
 */
export default function StaffPage({ onChanged }: Props) {
  const { t } = useT();
  const [rows, setRows] = useState<api.InstructorAdmin[]>([]);
  const [accounts, setAccounts] = useState<DirectoryUser[]>([]);
  const [worked, setWorked] = useState<ManagedBooking[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [month, setMonthKey] = useState(thisMonthKey());
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [from, to] = monthBounds(month);
      const [list, bookings, users] = await Promise.all([
        api.listInstructorsAdmin(),
        api.listBookingsBetween(from, to),
        api.listUsers(),
      ]);
      setRows(list);
      setWorked(bookings);
      setAccounts(users);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

/**
   * What each instructor worked in the chosen month.
   *
   * Hours and lesson count are different questions — a three-hour lesson is one
   * lesson — and the day list is what gets checked against when somebody
   * disagrees about a total.
   */
  const worksheet = useMemo(() => {
    const map = new Map<
      string,
      { hours: number; lessons: number; days: Map<string, { hours: number; lessons: number }> }
    >();
    for (const b of worked) {
      if (b.status === 'rejected') continue;
      const row = map.get(b.instructorId) ?? { hours: 0, lessons: 0, days: new Map() };
      row.hours += b.durationHours;
      row.lessons += 1;
      const key = new Date(b.startsAt).toLocaleDateString(locale());
      const day = row.days.get(key) ?? { hours: 0, lessons: 0 };
      day.hours += b.durationHours;
      day.lessons += 1;
      row.days.set(key, day);
      map.set(b.instructorId, row);
    }
    return map;
  }, [worked]);

  const hours = useMemo(() => {
    const map = new Map<string, number>();
    for (const [id, row] of worksheet) map.set(id, row.hours);
    return map;
  }, [worksheet]);

  const monthTotal = useMemo(
    () => [...worksheet.values()].reduce((s, r) => s + r.hours, 0),
    [worksheet],
  );

  async function changeRole(u: DirectoryUser, role: Role, instructorId: string | null) {
    setBusyId(u.userId);
    setError(null);
    try {
      await api.setUserRole(u.userId, role, role === 'instructor' ? instructorId : null);
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
        <h2 className="admin-title">{t('Hocalar')}</h2>
        <button className="btn" onClick={() => setAddOpen(true)}>
          {t('Hoca Ekle')}
        </button>
      </div>

      {error && <p className="dialog-error">{error}</p>}

      {loading ? (
        <p className="admin-hint">{t('Yükleniyor…')}</p>
      ) : rows.length === 0 ? (
        <p className="mybookings-empty">{t('Henüz hoca eklenmemiş.')}</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('İsim')}</th>
                <th>{t('Uzmanlık alanı')}</th>
                <th>{t('İletişim')}</th>
                <th>{t('Hesap')}</th>
                <th>{t('Bu ay')}</th>
                <th>{t('Eklendi')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id}>
                  <td>{i.name}</td>
                  <td>
                    <span className="chipset chipset--tight">
                      {i.sports.map((s) => (
                        <span key={s} className={`tag tag--${s}`}>
                          {SPORT_LABEL[s]}
                        </span>
                      ))}
                    </span>
                  </td>
                  <td className="cell-dim">
                    {i.email ?? '—'}
                    {i.phone && <div>{i.phone}</div>}
                  </td>
                  <td>
                    {i.linkedUserId ? (
                      <span className="status status--approved">{t('Bağlı')}</span>
                    ) : (
                      <span className="status status--pending">{t('Bekliyor')}</span>
                    )}
                  </td>
                  <td>
                    {hours.get(i.id) ?? 0} {t('saat')}
                  </td>
                  <td className="cell-dim">
                    {i.createdAt ? new Date(i.createdAt).toLocaleDateString(locale()) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="admin-hint">
        {t(
          'Bekliyor demek, hoca profili var ama henüz bir hesaba bağlanmamış demektir. Hoca kayıt olduktan sonra aşağıdaki listeden hesabını bu profile bağlayın.',
        )}
      </p>

      <section className="panel">
        <div className="admin-bar">
          <h4 className="panel-title">{t('Çalışma dökümü')}</h4>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonthKey(e.target.value || thisMonthKey())}
            aria-label={t('Ay')}
          />
          <span className="admin-count">
            {monthTotal} {t('saat')}
          </span>
        </div>

        {worksheet.size === 0 ? (
          <p className="cell-dim">{t('Bu ayda ders yok.')}</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('Hoca')}</th>
                  <th className="num">{t('Ders')}</th>
                  <th className="num">{t('Saat')}</th>
                  <th className="num">{t('Gün')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows
                  .filter((i) => worksheet.has(i.id))
                  .sort((a, b) => (hours.get(b.id) ?? 0) - (hours.get(a.id) ?? 0))
                  .map((i) => {
                    const w = worksheet.get(i.id)!;
                    const open = openId === i.id;
                    return (
                      <tr key={i.id}>
                        <td>
                          {i.name}
                          {open && (
                            <ul className="daylist">
                              {[...w.days.entries()].map(([day, d]) => (
                                <li key={day}>
                                  <span className="cell-dim">{day}</span>
                                  <span>
                                    {d.lessons} {t('ders')} · {d.hours} {t('saat')}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                        <td className="num">{w.lessons}</td>
                        <td className="num">{w.hours}</td>
                        <td className="num">{w.days.size}</td>
                        <td>
                          <button
                            className="link-btn"
                            onClick={() => setOpenId(open ? null : i.id)}
                          >
                            {open ? t('Gizle') : t('Günleri göster')}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h4 className="panel-title">{t('Hesaplar ve yetkiler')}</h4>
        <p className="admin-hint">
          {t(
            'Yalnızca hocalar ve yöneticiler giriş yapar. Yeni bir hesap, siz yetki verene kadar hiçbir şey yapamaz — sadece takvimi okur.',
          )}
        </p>
        {accounts.length === 0 ? (
          <p className="cell-dim">{t('Kayıtlı hesap yok.')}</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('İsim')}</th>
                  <th>{t('E-posta')}</th>
                  <th>{t('Yetki')}</th>
                  <th>{t('Hoca profili')}</th>
                  <th>{t('Kayıt')}</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((u) => (
                  <tr key={u.userId}>
                    <td>{u.name ?? '—'}</td>
                    <td className="cell-dim">
                      {u.email}
                      {!u.emailVerified && (
                        <div className="status status--pending">{t('Doğrulanmadı')}</div>
                      )}
                    </td>
                    <td>
                      <select
                        value={u.role}
                        disabled={busyId === u.userId}
                        onChange={(e) => changeRole(u, e.target.value as Role, u.instructorId)}
                      >
                        {(['customer', 'instructor', 'admin'] as Role[]).map((r) => (
                          <option key={r} value={r}>
                            {t(ROLE_LABEL[r])}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {u.role === 'instructor' ? (
                        <select
                          value={u.instructorId ?? ''}
                          disabled={busyId === u.userId}
                          onChange={(e) => changeRole(u, 'instructor', e.target.value || null)}
                        >
                          <option value="">{t('— seçin —')}</option>
                          {rows.map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="cell-dim">—</span>
                      )}
                    </td>
                    <td className="cell-dim">
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString(locale()) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {addOpen && (
        <InstructorForm
          onClose={() => setAddOpen(false)}
          onSaved={() => {
            setAddOpen(false);
            void load();
            onChanged();
          }}
        />
      )}
    </section>
  );
}
