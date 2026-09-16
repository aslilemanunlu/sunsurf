import { useEffect, useRef, useState } from 'react';
import { useT } from '../lib/i18n';
import { auth } from '../neon';

type Props = {
  name: string;
  email: string;
};

/**
 * Our own account menu rather than Neon's UserButton, whose dropdown never
 * opened here and which would not have been wired to our profile dialog anyway.
 */
export default function AccountMenu({ name, email }: Props) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const initials = (name || email)
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toLocaleUpperCase('tr') ?? '')
    .join('');

  return (
    <div className="account-menu" ref={wrap}>
      <button
        className="account-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="account-avatar" aria-hidden="true">
          {initials}
        </span>
        <span className="account-name">{name || email}</span>
      </button>

      {open && (
        <div className="account-pop" role="menu">
          <div className="account-who">
            <strong>{name || '—'}</strong>
            <span>{email}</span>
          </div>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setPasswordOpen(true);
            }}
          >
            {t('Şifre değiştir')}
          </button>
          <button
            role="menuitem"
            className="danger"
            onClick={async () => {
              setOpen(false);
              await auth.signOut();
            }}
          >
            {t('Çıkış yap')}
          </button>
        </div>
      )}

      {passwordOpen && <PasswordDialog onClose={() => setPasswordOpen(false)} />}
    </div>
  );
}

function PasswordDialog({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const canSave = current.length >= 6 && next.length >= 8 && !busy;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await auth.changePassword({ currentPassword: current, newPassword: next });
      if (res?.error) throw new Error(res.error.message ?? t('Şifre değiştir'));
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pw-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="pw-title">{t('Şifre değiştir')}</h3>

        {error && <p className="dialog-error">{error}</p>}
        {done ? (
          <>
            <p className="admin-hint">{t('Şifreniz değiştirildi.')}</p>
            <div className="dialog-actions">
              <button className="btn" onClick={onClose}>
                {t('Kapat')}
              </button>
            </div>
          </>
        ) : (
          <>
            <label className="field">
              <span>{t('Mevcut şifre')}</span>
              <input
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
              />
            </label>
            <label className="field">
              <span>{t('Yeni şifre')}</span>
              <input
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                autoComplete="new-password"
              />
              <small className="field-hint">{t('En az 8 karakter.')}</small>
            </label>
            <div className="dialog-actions">
              <button className="btn btn--ghost" onClick={onClose}>
                {t('Vazgeç')}
              </button>
              <button className="btn" onClick={save} disabled={!canSave}>
                {busy ? t('Kaydediliyor…') : t('Kaydet')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
