import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AccessLevel, DirectoryUser, Viewer } from '../../types';
import { locale, useT } from '../../lib/i18n';
import * as api from '../../api/client';
import InstructorForm from './InstructorForm';

type Props = { viewer: Viewer; onChanged: () => void };

const LEVELS: { value: AccessLevel; label: string }[] = [
  { value: 'owner', label: 'Yönetici' },
  { value: 'admin', label: 'Admin' },
  { value: 'instructor', label: 'Hoca' },
  { value: 'none', label: 'Erişimi yok' },
];

/** Everything else is still reachable under "Tümü". */
const FILTERS: (AccessLevel | 'all')[] = ['all', 'owner', 'admin'];

const LEVEL_LABEL: Record<AccessLevel, string> = {
  owner: 'Yönetici',
  admin: 'Admin',
  instructor: 'Hoca',
  none: 'Erişimi yok',
};

/** One value out of the two columns the database keeps it in. */
function levelOf(u: DirectoryUser): AccessLevel {
  if (u.role === 'admin') return u.isOwner ? 'owner' : 'admin';
  if (u.role === 'instructor') return 'instructor';
  return 'none';
}

/**
 * Everybody who can sign in, in one list.
 *
 * Instructors used to have a table of their own, which meant looking in two
 * places to answer one question. An instructor record is a different thing from
 * an account — it can exist before anybody signs up — but the *access* question
 * is the same for all of them, so it is asked once here.
 *
 * Yönetici and Admin are one choice, not a role plus a flag. The database keeps
 * them as `role = 'admin'` and `is_owner`, because every policy in db/ already
 * reads the first and only one thing reads the second; a third role would mean
 * every one of them had to learn about it, and one would eventually be missed.
 */
export default function AccountsPage({ viewer, onChanged }: Props) {
  const { t } = useT();
  const [rows, setRows] = useState<DirectoryUser[]>([]);
  const [instructors, setInstructors] = useState<api.InstructorAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<AccessLevel | 'all'>('all');
  const [busy, setBusy] = useState<string | null>(null);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [level, setLevel] = useState<Exclude<AccessLevel, 'none'>>('instructor');
  const [instructorId, setInstructorId] = useState('');
  /**
   * Somebody is being made an instructor and there is no record to point at.
   * Sending them off to another page to make one is how the half-finished
   * invitation gets abandoned, so the form opens here and the new record is
   * selected when it closes.
   */
  const [makingProfile, setMakingProfile] = useState<null | { for: string | null }>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [users, list] = await Promise.all([api.listUsers(), api.listInstructorsAdmin()]);
      setRows(users);
      setInstructors(list);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(
    () => (filter === 'all' ? rows : rows.filter((u) => levelOf(u) === filter)),
    [rows, filter],
  );

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  async function setLevelFor(u: DirectoryUser, next: AccessLevel, linkTo?: string | null) {
    if (!u.userId) return;
    setBusy(u.email);
    setError(null);
    try {
      const role = next === 'instructor' ? 'instructor' : next === 'none' ? 'customer' : 'admin';
      await api.setUserRole(
        u.userId,
        role,
        next === 'instructor' ? (linkTo ?? u.instructorId) : null,
      );
      // owner is a second, narrower question and only a yönetici may answer it
      if (viewer.isOwner) await api.setOwner(u.userId, next === 'owner');
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function invite() {
    setBusy('invite');
    setError(null);
    try {
      await api.inviteStaff({ email, level, instructorId });
      setEmail('');
      setInstructorId('');
      setInviteOpen(false);
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function withdraw(u: DirectoryUser) {
    if (!window.confirm(t('{n} daveti geri alınsın mı?').replace('{n}', u.email))) return;
    setBusy(u.email);
    try {
      await api.cancelInvitation(u.email);
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section>
      <div className="admin-bar">
        <h2 className="admin-title">{t('Hesaplar ve yetkiler')}</h2>
        <span className="admin-count">
          {shown.length} / {rows.length}
        </span>
        <button className="btn" onClick={() => setInviteOpen((v) => !v)}>
          {t('Kullanıcı Ekle')}
        </button>
      </div>

      {error && <p className="dialog-error">{error}</p>}

      {inviteOpen && (
        <section className="panel">
          <h4 className="panel-title">{t('Kullanıcı Ekle')}</h4>
          <p className="admin-hint">
            {t(
              'Şifreyi siz belirlemiyorsunuz: davet ettiğiniz kişi bu e-posta ile kayıt olup kendi şifresini seçer, yetkisi ilk girişinde otomatik tanımlanır. Böylece kimse bir başkasının şifresini bilmek zorunda kalmaz.',
            )}
          </p>

          <div className="money-row">
            <label className="field">
              <span>{t('E-posta')}</span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                inputMode="email"
                placeholder="ornek@eposta.com"
              />
              {email.length > 0 && !emailOk && (
                <small className="field-hint">{t('Geçerli bir e-posta girin.')}</small>
              )}
            </label>

            <label className="field">
              <span>{t('Yetki')}</span>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value as Exclude<AccessLevel, 'none'>)}
              >
                {LEVELS.filter((l) => l.value !== 'none')
                  .filter((l) => l.value !== 'owner' || viewer.isOwner)
                  .map((l) => (
                    <option key={l.value} value={l.value}>
                      {t(l.label)}
                    </option>
                  ))}
              </select>
            </label>
          </div>

          {level === 'instructor' && (
            <label className="field">
              <span>{t('Hoca profili')}</span>
              <select value={instructorId} onChange={(e) => setInstructorId(e.target.value)}>
                <option value="">{t('— seçin —')}</option>
                {instructors.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="link-btn"
                onClick={() => setMakingProfile({ for: null })}
              >
                {t('+ Hoca profili oluştur')}
              </button>
            </label>
          )}

          <div className="row-actions">
            <button className="btn" onClick={invite} disabled={!emailOk || busy === 'invite'}>
              {busy === 'invite' ? t('Kaydediliyor…') : t('Davet et')}
            </button>
            <button className="link-btn" onClick={() => setInviteOpen(false)}>
              {t('Vazgeç')}
            </button>
          </div>
        </section>
      )}

      <div className="filters">
        <div className="segmented" role="group" aria-label={t('Yetkiye göre filtrele')}>
          <button
            className={`segment${filter === 'all' ? ' is-active' : ''}`}
            onClick={() => setFilter('all')}
            aria-pressed={filter === 'all'}
          >
            {t('Tümü')}
          </button>
          {FILTERS.filter((f) => f !== 'all').map((f) => (
            <button
              key={f}
              className={`segment${filter === f ? ' is-active' : ''}`}
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
            >
              {t(LEVEL_LABEL[f as AccessLevel])}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="admin-hint">{t('Yükleniyor…')}</p>
      ) : shown.length === 0 ? (
        <p className="mybookings-empty">{t('Bu filtreye uyan hesap yok.')}</p>
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
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((u) => {
                const current = levelOf(u);
                const locked = busy === u.email;
                return (
                  <tr key={u.userId ?? `invite-${u.email}`}>
                    <td>
                      {u.name ?? '—'}
                      {u.pending && (
                        <span className="status status--pending"> {t('Davet edildi')}</span>
                      )}
                    </td>
                    <td className="cell-dim">
                      {u.email}
                      {!u.pending && !u.emailVerified && (
                        <div className="status status--pending">{t('Doğrulanmadı')}</div>
                      )}
                    </td>
                    <td>
                      {u.pending ? (
                        <span>{t(LEVEL_LABEL[current])}</span>
                      ) : (
                        <select
                          value={current}
                          disabled={locked || (current === 'owner' && !viewer.isOwner)}
                          onChange={(e) => setLevelFor(u, e.target.value as AccessLevel)}
                        >
                          {LEVELS.filter((l) => l.value !== 'owner' || viewer.isOwner).map((l) => (
                            <option key={l.value} value={l.value}>
                              {t(l.label)}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td>
                      {current !== 'instructor' ? (
                        <span className="cell-dim">—</span>
                      ) : u.pending ? (
                        <span className="cell-dim">{u.instructorName ?? '—'}</span>
                      ) : (
                        <>
                          <select
                            value={u.instructorId ?? ''}
                            disabled={locked}
                            onChange={(e) => setLevelFor(u, 'instructor', e.target.value || null)}
                          >
                            <option value="">{t('— seçin —')}</option>
                            {instructors.map((i) => (
                              <option key={i.id} value={i.id}>
                                {i.name}
                              </option>
                            ))}
                          </select>
                          {!u.instructorId && (
                            <button
                              className="link-btn"
                              onClick={() => setMakingProfile({ for: u.userId })}
                            >
                              {t('+ Hoca profili oluştur')}
                            </button>
                          )}
                        </>
                      )}
                    </td>
                    <td className="cell-dim">
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString(locale()) : '—'}
                    </td>
                    <td>
                      {u.pending && (
                        <button className="link-btn danger" onClick={() => withdraw(u)}>
                          {t('Daveti geri al')}
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

      <p className="admin-hint">
        {t(
          'Yetkisi olmayan bir hesap yalnızca herkese açık takvimi okur. Şifresini unutan herkes giriş ekranından kendisi yenileyebilir.',
        )}
      </p>

      {makingProfile && (
        <InstructorForm
          instructor={null}
          onClose={() => setMakingProfile(null)}
          onSaved={async (newId) => {
            const target = makingProfile.for;
            setMakingProfile(null);
            await load();
            if (!newId) return;
            // link it to whoever the button was pressed for; in the invite panel
            // there is nobody yet, so it just becomes the chosen profile
            if (target) {
              const u = rows.find((r) => r.userId === target);
              if (u) await setLevelFor(u, 'instructor', newId);
            } else {
              setInstructorId(newId);
            }
          }}
        />
      )}
    </section>
  );
}
