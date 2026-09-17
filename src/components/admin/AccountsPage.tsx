import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AccessLevel, DirectoryUser, Viewer } from '../../types';
import { locale, useT } from '../../lib/i18n';
import * as api from '../../api/client';
import InstructorForm from './InstructorForm';

type Props = { viewer: Viewer; onChanged: () => void };

/**
 * Two questions, not one.
 *
 * "How much of the office may this person run" has three answers — yönetici,
 * admin, or none — and they exclude each other, which is why they are one
 * dropdown. "Do they teach" is separate: a yönetici can be on the water too.
 * So teaching is its own column, the instructor profile, and an account is an
 * instructor when it has one.
 */
type Management = 'owner' | 'admin' | 'none';

const MANAGEMENT: { value: Management; label: string }[] = [
  { value: 'owner', label: 'Yönetici' },
  { value: 'admin', label: 'Admin' },
  { value: 'none', label: '—' },
];

function managementOf(u: DirectoryUser): Management {
  if (u.role !== 'admin') return 'none';
  return u.isOwner ? 'owner' : 'admin';
}

/** What the two answers make, in the columns the database keeps. */
function roleFor(m: Management, instructorId: string | null): 'admin' | 'instructor' | 'customer' {
  if (m !== 'none') return 'admin';
  return instructorId ? 'instructor' : 'customer';
}

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

  /** What the admin sends. No link to a token — there is no token. */
  const message = (invitedEmail: string) =>
    [
      t('Sun Surf Alaçatı sistemine eklendiniz.'),
      '',
      `1. ${window.location.origin}`,
      `2. ${t('“Giriş yap” → “Kayıt ol”')}`,
      `3. ${t('E-posta')}: ${invitedEmail}`,
      `4. ${t('Şifrenizi kendiniz belirleyin.')}`,
      '',
      t('İlk girişinizde yetkiniz otomatik tanımlanacak.'),
    ].join('\n');
  const [rows, setRows] = useState<DirectoryUser[]>([]);
  const [instructors, setInstructors] = useState<api.InstructorAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<AccessLevel | 'all'>('all');
  const [busy, setBusy] = useState<string | null>(null);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [level, setLevel] = useState<Management>('none');
  const [instructorId, setInstructorId] = useState('');
  /**
   * Somebody is being made an instructor and there is no record to point at.
   * Sending them off to another page to make one is how the half-finished
   * invitation gets abandoned, so the form opens here and the new record is
   * selected when it closes.
   */
  const [makingProfile, setMakingProfile] = useState<null | { for: string | null }>(null);
  /** The last address invited, so the panel can hand over what to send. */
  const [justInvited, setJustInvited] = useState<string | null>(null);

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

  async function setAccess(u: DirectoryUser, management: Management, instructorId: string | null) {
    if (!u.userId) return;
    setBusy(u.email);
    setError(null);
    try {
      await api.setUserRole(u.userId, roleFor(management, instructorId), instructorId);
      // owner is a second, narrower question and only a yönetici may answer it
      if (viewer.isOwner) await api.setOwner(u.userId, management === 'owner');
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
      if (level === 'none' && !instructorId) {
        setError(t('Yönetim yetkisi ya da hoca profili seçin; ikisi de boşsa davetin bir anlamı yok.'));
        return;
      }
      await api.inviteStaff({
        email,
        level: level === 'none' ? 'instructor' : level,
        instructorId: instructorId || null,
      });
      setJustInvited(email.trim().toLowerCase());
      setEmail('');
      setInstructorId('');
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
          <p className="alertline">
            {t(
              'Bu davet e-posta göndermez. Kişiye siz haber vereceksiniz: adresi kaydettikten sonra aşağıdaki mesajı kopyalayıp gönderin.',
            )}
          </p>
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
              <span>{t('Yönetim yetkisi')}</span>
              <select value={level} onChange={(e) => setLevel(e.target.value as Management)}>
                {MANAGEMENT.filter((m) => m.value !== 'owner' || viewer.isOwner).map((m) => (
                  <option key={m.value} value={m.value}>
                    {t(m.label)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="field">
              <span>
                {t('Hoca profili')} ({t('ders veriyorsa')})
              </span>
              <select value={instructorId} onChange={(e) => setInstructorId(e.target.value)}>
                <option value="">{t('— hoca değil —')}</option>
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

          <div className="row-actions">
            <button className="btn" onClick={invite} disabled={!emailOk || busy === 'invite'}>
              {busy === 'invite' ? t('Kaydediliyor…') : t('Davet et')}
            </button>
            <button
              className="link-btn"
              onClick={() => {
                setInviteOpen(false);
                setJustInvited(null);
              }}
            >
              {t('Kapat')}
            </button>
          </div>

          {justInvited && (
            <div className="handover">
              <h4 className="panel-title">
                {t('{e} davet edildi. Şimdi haber verin:').replace('{e}', justInvited)}
              </h4>
              <div className="row-actions">
                <a
                  className="btn btn--small"
                  href={`https://wa.me/?text=${encodeURIComponent(message(justInvited))}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t('WhatsApp ile paylaş')}
                </a>
                <a
                  className="btn btn--ghost btn--small"
                  href={`mailto:${encodeURIComponent(justInvited)}?subject=${encodeURIComponent(
                    t('Sun Surf Alaçatı — hesabınız hazır'),
                  )}&body=${encodeURIComponent(message(justInvited))}`}
                >
                  {t('E-posta ile gönder')}
                </a>
              </div>
              <small className="field-hint">
                {t('Kendi uygulamanız açılır, mesaj hazır gelir; gönderen siz olursunuz.')}
              </small>
            </div>
          )}
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
                <th>{t('Yönetim yetkisi')}</th>
                <th>{t('Hoca profili')}</th>
                <th>{t('Kayıt')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((u) => {
                const management = managementOf(u);
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
                        <span>{management === 'none' ? '—' : t(LEVEL_LABEL[management])}</span>
                      ) : (
                        <select
                          value={management}
                          disabled={locked || (management === 'owner' && !viewer.isOwner)}
                          onChange={(e) =>
                            setAccess(u, e.target.value as Management, u.instructorId)
                          }
                        >
                          {MANAGEMENT.filter((m) => m.value !== 'owner' || viewer.isOwner).map(
                            (m) => (
                              <option key={m.value} value={m.value}>
                                {t(m.label)}
                              </option>
                            ),
                          )}
                        </select>
                      )}
                    </td>
                    <td>
                      {u.pending ? (
                        <span className="cell-dim">{u.instructorName ?? '—'}</span>
                      ) : (
                        <>
                          <select
                            value={u.instructorId ?? ''}
                            disabled={locked}
                            onChange={(e) => setAccess(u, management, e.target.value || null)}
                          >
                            <option value="">{t('— hoca değil —')}</option>
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
              if (u) await setAccess(u, managementOf(u), newId);
            } else {
              setInstructorId(newId);
            }
          }}
        />
      )}
    </section>
  );
}
