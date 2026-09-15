import { useEffect, useMemo, useState } from 'react';
import { useT } from '../../lib/i18n';
import type { DirectoryUser, Instructor, Role } from '../../types';
import * as api from '../../api/client';
import { locale } from '../../lib/i18n';
import InstructorForm from './InstructorForm';

const ROLE_LABEL: Record<Role, string> = {
  admin: 'Yönetici',
  instructor: 'Hoca',
  customer: 'Öğrenci',
};

const FILTERS: { value: Role | 'all'; label: string }[] = [
  { value: 'all', label: 'Tümü' },
  { value: 'instructor', label: 'Hoca' },
  { value: 'customer', label: 'Öğrenci' },
  { value: 'admin', label: 'Yönetici' },
];

type Props = {
  instructors: Instructor[];
  onChanged: () => void;
};

export default function UsersPage({ instructors, onChanged }: Props) {
  const { t } = useT();
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<Role | 'all'>('all');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setUsers(await api.listUsers());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const shown = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr');
    return users.filter((u) => {
      if (role !== 'all' && u.role !== role) return false;
      if (!q) return true;
      return (
        (u.name ?? '').toLocaleLowerCase('tr').includes(q) ||
        u.email.toLocaleLowerCase('tr').includes(q)
      );
    });
  }, [users, role, search]);

  async function update(u: DirectoryUser, next: Role, instructorId: string | null) {
    setBusyId(u.userId);
    try {
      await api.setUserRole(u.userId, next, instructorId);
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
        <h2 className="admin-title">{t('Kullanıcılar')}</h2>
        <button className="btn" onClick={() => setAddOpen(true)}>
          {t('Hoca Ekle')}
        </button>
      </div>

      {error && <p className="dialog-error">{error}</p>}

      <div className="filters">
        <div className="segmented" role="group" aria-label={t('Role göre filtrele')}>
          {FILTERS.map((f) => (
            <button
              key={f.value}
              className={`segment${role === f.value ? ' is-active' : ''}`}
              onClick={() => setRole(f.value)}
              aria-pressed={role === f.value}
            >
              {t(f.label)}
            </button>
          ))}
        </div>
        <input
          className="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('İsim veya e-posta ara')}
          aria-label={t('Ara')}
        />
      </div>

      {loading ? (
        <p className="admin-hint">{t('Yükleniyor…')}</p>
      ) : shown.length === 0 ? (
        <p className="mybookings-empty">{t('Bu filtreye uyan kullanıcı yok.')}</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('İsim')}</th>
                <th>{t('E-posta')}</th>
                <th>{t('Telefon')}</th>
                <th>{t('Rol')}</th>
                <th>{t('Kayıt')}</th>
                <th>{t('Hoca profili')}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((u) => (
                <tr key={u.userId}>
                  <td>{u.name ?? '—'}</td>
                  <td className="cell-dim">{u.email}</td>
                  <td className="cell-dim">{u.phone ?? '—'}</td>
                  <td>
                    <select
                      value={u.role}
                      disabled={busyId === u.userId}
                      onChange={(e) => update(u, e.target.value as Role, u.instructorId)}
                    >
                      {(['customer', 'instructor', 'admin'] as Role[]).map((r) => (
                        <option key={r} value={r}>
                          {t(ROLE_LABEL[r])}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="cell-dim">
                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString(locale()) : '—'}
                  </td>
                  <td>
                    {u.role === 'instructor' ? (
                      <select
                        value={u.instructorId ?? ''}
                        disabled={busyId === u.userId}
                        onChange={(e) => update(u, 'instructor', e.target.value || null)}
                      >
                        <option value="">{t('— seçin —')}</option>
                        {instructors.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="cell-dim">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {addOpen && (
        <InstructorForm
          onClose={() => setAddOpen(false)}
          onSaved={() => {
            setAddOpen(false);
            onChanged();
          }}
        />
      )}
    </section>
  );
}
