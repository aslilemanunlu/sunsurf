import { useEffect, useState } from 'react';
import type { CrmCustomer, CustomerDetails, Segment } from '../../types';
import { useT } from '../../lib/i18n';
import * as api from '../../api/client';
import { SEGMENTS, SEGMENT_LABEL, SOURCES, segmentTone } from '../../lib/segments';

type Props = {
  /** Null when adding somebody new. */
  customer: CrmCustomer | null;
  onClose: () => void;
  onSaved: () => void;
};

/**
 * The whole customer record.
 *
 * Only the name is required. Somebody who walks up ten minutes before a lesson
 * gives you a first name and nothing else, and a form that refuses that is a
 * form the desk stops using — the rest gets filled in later, or never.
 */
/** What staff write down again and again, one tap instead of typing. */
const COMMON_NOTES = [
  'Omuz sakatlığı',
  'Diz sakatlığı',
  'Bel/sırt sakatlığı',
  'Yüzme bilmiyor',
  'Astım',
  'Gözlük/lens',
];

/** The note is one text field; the chips are parts of it, separated by commas. */
function parts(note: string): string[] {
  return note
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function hasNote(note: string, one: string): boolean {
  return parts(note).some((x) => x.toLocaleLowerCase('tr') === one.toLocaleLowerCase('tr'));
}

function toggleNote(note: string, one: string): string {
  const list = parts(note);
  const next = hasNote(note, one)
    ? list.filter((x) => x.toLocaleLowerCase('tr') !== one.toLocaleLowerCase('tr'))
    : [...list, one];
  return next.join(', ');
}

export default function CustomerForm({ customer, onClose, onSaved }: Props) {
  const { t } = useT();
  const [name, setName] = useState(customer?.name ?? '');
  const [phone, setPhone] = useState(customer?.phone ?? '');
  const [email, setEmail] = useState(customer?.email ?? '');
  const [birthDate, setBirthDate] = useState(customer?.birthDate ?? '');
  const [source, setSource] = useState(customer?.source ?? '');
  const [segments, setSegments] = useState<Segment[]>(customer?.segments ?? []);
  const [injury, setInjury] = useState(customer?.injuryNote ?? '');
  const [allergy, setAllergy] = useState(customer?.allergyNote ?? '');
  const [e1Name, setE1Name] = useState(customer?.emergency1Name ?? '');
  const [e1Phone, setE1Phone] = useState(customer?.emergency1Phone ?? '');
  const [e2Name, setE2Name] = useState(customer?.emergency2Name ?? '');
  const [e2Phone, setE2Phone] = useState(customer?.emergency2Phone ?? '');
  const [gName, setGName] = useState(customer?.guardianName ?? '');
  const [gPhone, setGPhone] = useState(customer?.guardianPhone ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /** The guardian and allergy fields only matter for a child. */
  const isChild = segments.includes('kids_camp');

  function toggle(s: Segment) {
    setSegments((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  async function save() {
    if (!customer) {
      const same = await api.findCustomerByName(name);
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
    setSaving(true);
    setError(null);
    const details: CustomerDetails = {
      phone,
      email,
      birthDate: birthDate || null,
      source,
      injuryNote: injury,
      allergyNote: allergy,
      emergency1Name: e1Name,
      emergency1Phone: e1Phone,
      emergency2Name: e2Name,
      emergency2Phone: e2Phone,
      guardianName: gName,
      guardianPhone: gPhone,
      segments,
    };
    try {
      if (customer) {
        await api.updateCustomer(customer.customerId, { fullName: name, ...details });
      } else {
        await api.createCustomer({ fullName: name, ...details });
      }
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
        className="dialog dialog--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="customer-title">{customer ? t('Müşteriyi düzenle') : t('Müşteri Ekle')}</h3>

        {error && <p className="dialog-error">{error}</p>}

        <label className="field">
          <span>{t('İsim soyisim')}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>

        <div className="money-row">
          <label className="field">
            <span>
              {t('Telefon')} ({t('opsiyonel')})
            </span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
          </label>
          <label className="field">
            <span>
              {t('Doğum tarihi')} ({t('opsiyonel')})
            </span>
            <input
              type="date"
              value={birthDate}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setBirthDate(e.target.value)}
            />
          </label>
        </div>

        <div className="money-row">
          <label className="field">
            <span>
              {t('E-posta')} ({t('opsiyonel')})
            </span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" />
          </label>
          <label className="field">
            <span>
              {t('Nereden geldi?')} ({t('opsiyonel')})
            </span>
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              list="customer-sources"
              placeholder={t('Instagram, otel, tavsiye…')}
            />
            <datalist id="customer-sources">
              {SOURCES.map((s) => (
                <option key={s} value={t(s)} />
              ))}
            </datalist>
          </label>
        </div>

        <fieldset className="field">
          <span>{t('Neyle ilgileniyor?')}</span>
          <div className="chipset">
            {SEGMENTS.map((s) => {
              const on = segments.includes(s);
              const tone = segmentTone(s);
              return (
                <button
                  key={s}
                  type="button"
                  className={`chip${on ? ' is-on' : ''}${tone ? ` chip--${tone}` : ''}`}
                  onClick={() => toggle(s)}
                  aria-pressed={on}
                >
                  {t(SEGMENT_LABEL[s])}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="field">
          <span>
            {t('Sakatlık / dikkat edilmesi gereken')} ({t('opsiyonel')})
          </span>
          {/* The same four things come up every summer; the box is still free
              text for the fifth. */}
          <div className="chipset chipset--tight">
            {COMMON_NOTES.map((n) => {
              const on = hasNote(injury, n);
              return (
                <button
                  key={n}
                  type="button"
                  className={`chip${on ? ' is-on' : ''}`}
                  onClick={() => setInjury(toggleNote(injury, n))}
                  aria-pressed={on}
                >
                  {t(n)}
                </button>
              );
            })}
          </div>
          <input
            value={injury}
            onChange={(e) => setInjury(e.target.value)}
            placeholder={t('Suda bilinmesi gereken bir şey var mı?')}
          />
        </div>

        {isChild && (
          <>
            <label className="field">
              <span>
                {t('Alerji')} ({t('opsiyonel')})
              </span>
              <input value={allergy} onChange={(e) => setAllergy(e.target.value)} />
            </label>

            <div className="money-row">
              <label className="field">
                <span>{t('Veli adı')}</span>
                <input value={gName} onChange={(e) => setGName(e.target.value)} />
              </label>
              <label className="field">
                <span>{t('Veli telefonu')}</span>
                <input value={gPhone} onChange={(e) => setGPhone(e.target.value)} inputMode="tel" />
              </label>
            </div>
          </>
        )}

        <fieldset className="field">
          <span>{t('Acil durumda aranacak')}</span>
          <div className="money-row">
            <input
              value={e1Name}
              onChange={(e) => setE1Name(e.target.value)}
              placeholder={t('İsim')}
            />
            <input
              value={e1Phone}
              onChange={(e) => setE1Phone(e.target.value)}
              placeholder={t('Telefon')}
              inputMode="tel"
            />
          </div>
          <div className="money-row">
            <input
              value={e2Name}
              onChange={(e) => setE2Name(e.target.value)}
              placeholder={`${t('İsim')} 2`}
            />
            <input
              value={e2Phone}
              onChange={(e) => setE2Phone(e.target.value)}
              placeholder={`${t('Telefon')} 2`}
              inputMode="tel"
            />
          </div>
        </fieldset>

        <div className="dialog-actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {t('Vazgeç')}
          </button>
          <button
            type="button"
            className="btn"
            onClick={save}
            disabled={saving || name.trim().length < 2}
          >
            {saving ? t('Kaydediliyor…') : t('Kaydet')}
          </button>
        </div>
      </div>
    </div>
  );
}
