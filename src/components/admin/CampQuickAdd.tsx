import { useEffect, useMemo, useState } from 'react';
import type { CampRegistration } from '../../types';
import { locale, useT } from '../../lib/i18n';
import * as api from '../../api/client';
import { fromDateKey } from '../../lib/date';

type Props = {
  season: number;
  /** The day being taken, already chosen on the register behind this dialog. */
  day: string;
  /** Children already on this season's list, so they are not offered twice. */
  registered: CampRegistration[];
  onClose: () => void;
  onSaved: () => void;
  /** The full form, for the day somebody actually needs the consent pages. */
  onDetailed: () => void;
};

/**
 * A child on the register in two choices: who, and how much of the day.
 *
 * The full registration form asks for a guardian, phone numbers, a date of
 * birth and photographed pages — all of it true, none of it what you have time
 * for when a child is standing in front of you. So this writes the season's
 * registration with just the name and marks the day; the rest of the form can
 * be filled in later from Kayıtlar, and for a returning child it is already
 * there because last season's details are copied over.
 */
export default function CampQuickAdd({
  season,
  day,
  registered,
  onClose,
  onSaved,
  onDetailed,
}: Props) {
  const { t } = useT();
  const [past, setPast] = useState<CampRegistration[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'full' | 'half'>('full');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    api
      .listPastCampChildren()
      .then((p) => !cancelled && setPast(p))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  /** Everyone who has been to camp before and is not already on this list. */
  const returning = useMemo(() => {
    const here = new Set(registered.map((r) => r.customerId));
    return past.filter((p) => !here.has(p.customerId));
  }, [past, registered]);

  const chosen = returning.find((r) => r.customerId === customerId) ?? null;
  const canSave = chosen !== null || name.trim().length > 1;

  async function save() {
    // Same rule as the long form: a typed name that is already on file is
    // usually the same child, and asking now beats merging two records later.
    if (!chosen) {
      const same = await api.findCustomerByName(name.trim());
      if (
        same &&
        !window.confirm(
          t('“{n}” adında bir müşteri zaten var. Yine de yeni bir kayıt açılsın mı?').replace(
            '{n}',
            same.name,
          ),
        )
      ) {
        return;
      }
    }

    setBusy(true);
    setError(null);
    try {
      const form: api.CampForm = chosen
        ? {
            childName: chosen.childName,
            birthDate: chosen.birthDate,
            allergyNote: chosen.allergyNote ?? '',
            guardianName: chosen.guardianName ?? '',
            guardianPhone: chosen.guardianPhone ?? '',
            emergency1Name: chosen.emergency1Name ?? '',
            emergency1Phone: chosen.emergency1Phone ?? '',
            emergency2Name: chosen.emergency2Name ?? '',
            emergency2Phone: chosen.emergency2Phone ?? '',
          }
        : {
            childName: name.trim(),
            birthDate: null,
            allergyNote: '',
            guardianName: '',
            guardianPhone: '',
            emergency1Name: '',
            emergency1Phone: '',
            emergency2Name: '',
            emergency2Phone: '',
          };

      const registrationId = await api.registerForCamp({
        customerId: chosen?.customerId ?? null,
        season,
        form,
      });
      await api.setCampAttendance(registrationId, day, kind);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="camp-quick-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="camp-quick-title">
          {t('Çocuk ekle')} ·{' '}
          {fromDateKey(day).toLocaleDateString(locale(), { day: 'numeric', month: 'long' })}
        </h3>

        {error && <p className="dialog-error">{error}</p>}

        <label className="field">
          <span>{t('Çocuk')}</span>
          <select
            value={customerId}
            onChange={(e) => {
              setCustomerId(e.target.value);
              if (e.target.value) setName('');
            }}
            autoFocus
          >
            <option value="">{t('— yeni çocuk —')}</option>
            {returning.map((r) => (
              <option key={r.customerId} value={r.customerId}>
                {r.childName}
              </option>
            ))}
          </select>
        </label>

        {!customerId && (
          <label className="field">
            <span>{t('Adı soyadı')}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && canSave && !busy && void save()}
              placeholder={t('Çocuğun adı')}
            />
          </label>
        )}

        <div className="field">
          <span>{t('Gün tipi')}</span>
          <div className="segmented segmented--block" role="group">
            <button
              className={`segment${kind === 'full' ? ' is-active' : ''}`}
              onClick={() => setKind('full')}
              aria-pressed={kind === 'full'}
            >
              {t('Tam gün')}
            </button>
            <button
              className={`segment${kind === 'half' ? ' is-active' : ''}`}
              onClick={() => setKind('half')}
              aria-pressed={kind === 'half'}
            >
              {t('Yarım gün')}
            </button>
          </div>
        </div>

        <div className="dialog-actions">
          <button className="link-btn" onClick={onDetailed} disabled={busy}>
            {t('Detaylı form')}
          </button>
          <span className="spacer" />
          <button className="btn btn--ghost" onClick={onClose} disabled={busy}>
            {t('Vazgeç')}
          </button>
          <button className="btn" onClick={save} disabled={busy || !canSave}>
            {busy ? t('Kaydediliyor…') : t('Kaydet')}
          </button>
        </div>

        <small className="field-hint">
          {t('Veli, alerji ve form sayfaları sonradan Kayıtlar sekmesinden eklenebilir.')}
        </small>
      </div>
    </div>
  );
}
