import { useState } from 'react';
import { useT } from '../../lib/i18n';
import type { Employment, Sport } from '../../types';
import * as api from '../../api/client';

const SPORTS: { value: Sport; label: string }[] = [
  { value: 'windsurf', label: 'Windsurf' },
  { value: 'wingfoil', label: 'Wingfoil' },
];

const EMPLOYMENT: { value: Employment; label: string }[] = [
  { value: 'salaried', label: 'Maaşlı' },
  { value: 'freelance', label: 'Freelance' },
  { value: 'other', label: 'Diğer' },
];

type Props = {
  onClose: () => void;
  onSaved: () => void;
};

/**
 * Creates an instructor profile for somebody who has not signed up yet. The
 * email is the matching key: when that person later registers with the same
 * address and verifies it, the database links the account automatically.
 */
export default function InstructorForm({ onClose, onSaved }: Props) {
  const { t } = useT();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [sports, setSports] = useState<Sport[]>(['windsurf']);
  const [employment, setEmployment] = useState<Employment>('freelance');
  const [employmentNote, setEmploymentNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSave = name.trim().length > 1 && emailOk && sports.length > 0 && !saving;

  function toggle(s: Sport) {
    setSports((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.createInstructor({ name, email, sports, phone, bio, employment, employmentNote });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-instructor"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="add-instructor">{t('Hoca ekle')}</h3>
        <p className="admin-hint">
          {t(
            'Hocanın kayıt olmasını beklemeden profil oluşturabilirsiniz; takvimde hemen görünür. Kayıt olup e-postasını doğruladığında hesabı bu profile otomatik bağlanır.',
          )}
        </p>

        {error && <p className="dialog-error">{error}</p>}

        <label className="field">
          <span>{t('İsim soyisim')}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </label>

        <label className="field">
          <span>{t('E-posta (eşleştirme anahtarı)')}</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            inputMode="email"
            autoComplete="off"
            placeholder="hoca@ornek.com"
          />
          {email.length > 0 && !emailOk && (
            <small className="field-hint">{t('Geçerli bir e-posta girin.')}</small>
          )}
        </label>

        <fieldset className="field checks">
          <span>{t('Uzmanlık alanı')}</span>
          {SPORTS.map((s) => (
            <label key={s.value} className="check">
              <input
                type="checkbox"
                checked={sports.includes(s.value)}
                onChange={() => toggle(s.value)}
              />
              {t(s.label)}
            </label>
          ))}
        </fieldset>

        <div className="field">
          <span>{t('Çalışma şekli')}</span>
          <div className="segmented segmented--block" role="group" aria-label={t('Çalışma şekli')}>
            {EMPLOYMENT.map((e) => (
              <button
                key={e.value}
                type="button"
                className={`segment${employment === e.value ? ' is-active' : ''}`}
                onClick={() => setEmployment(e.value)}
                aria-pressed={employment === e.value}
              >
                {t(e.label)}
              </button>
            ))}
          </div>
          {employment === 'other' && (
            <input
              value={employmentNote}
              onChange={(e) => setEmploymentNote(e.target.value)}
              placeholder={t('Nasıl çalışıyor?')}
            />
          )}
        </div>

        <label className="field">
          <span>{t('Telefon (opsiyonel)')}</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
        </label>

        <label className="field">
          <span>{t('Kısa tanıtım (opsiyonel)')}</span>
          <input value={bio} onChange={(e) => setBio(e.target.value)} />
        </label>

        <div className="dialog-actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {t('Vazgeç')}
          </button>
          <button type="button" className="btn" onClick={save} disabled={!canSave}>
            {saving ? t('Kaydediliyor…') : t('Kaydet')}
          </button>
        </div>
      </div>
    </div>
  );
}
