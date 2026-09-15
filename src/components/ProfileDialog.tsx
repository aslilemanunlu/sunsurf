import { useState } from 'react';
import { useT } from '../lib/i18n';
import type { Interest, Profile } from '../types';

const INTERESTS: { value: Interest; label: string }[] = [
  { value: 'rental', label: 'Ekipman kiralama' },
  { value: 'wingfoil', label: 'Wingfoil dersi' },
  { value: 'windsurf', label: 'Windsurf dersi' },
];

type Props = {
  /** Existing profile when editing, null right after sign-up. */
  profile: Profile | null;
  /** From the auth account, used to prefill the name. */
  accountName: string;
  saving: boolean;
  error: string | null;
  onSave: (input: { fullName: string; phone: string; interests: Interest[] }) => void;
  onClose: () => void;
};

/**
 * Neon's sign-up form collects name, email and password. This is the second
 * step: phone and interests, which live in our own profiles table. Booking is
 * blocked without it — the database enforces that, not just this dialog.
 */
export default function ProfileDialog({
  profile,
  accountName,
  saving,
  error,
  onSave,
  onClose,
}: Props) {
  const { t } = useT();
  const [fullName, setFullName] = useState(profile?.fullName ?? accountName ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [interests, setInterests] = useState<Interest[]>(profile?.interests ?? []);

  const trimmedName = fullName.trim();
  const trimmedPhone = phone.trim();
  // deliberately loose: enough digits to be a real number, no format policing
  const phoneLooksReal = trimmedPhone.replace(/\D/g, '').length >= 10;
  const canSave = trimmedName.length > 1 && phoneLooksReal && !saving;

  function toggle(value: Interest) {
    setInterests((prev) =>
      prev.includes(value) ? prev.filter((i) => i !== value) : [...prev, value],
    );
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="profile-title">{t(profile ? 'Profilini düzenle' : 'Profilini tamamla')}</h3>
        <p className="admin-hint">
          {t('Rezervasyon yapabilmek için telefon numaranız gerekiyor — eğitmenin size ulaşabilmesi için.')}
        </p>

        {error && <p className="dialog-error">{error}</p>}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSave) onSave({ fullName: trimmedName, phone: trimmedPhone, interests });
          }}
        >
          <label className="field">
            <span>{t('İsim soyisim')}</span>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
          </label>

          <label className="field">
            <span>{t('Telefon numarası')}</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0532 000 00 00"
              inputMode="tel"
              autoComplete="tel"
            />
            {trimmedPhone.length > 0 && !phoneLooksReal && (
              <small className="field-hint">{t('En az 10 rakam girin.')}</small>
            )}
          </label>

          <fieldset className="field checks">
            <span>{t('İlgi alanınız')}</span>
            {INTERESTS.map((i) => (
              <label key={i.value} className="check">
                <input
                  type="checkbox"
                  checked={interests.includes(i.value)}
                  onChange={() => toggle(i.value)}
                />
                {t(i.label)}
              </label>
            ))}
          </fieldset>

          <div className="dialog-actions">
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              {t('Sonra')}
            </button>
            <button type="submit" className="btn" disabled={!canSave}>
              {saving ? t('Kaydediliyor…') : t('Kaydet')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
