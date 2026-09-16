import { useEffect, useState } from 'react';
import type { CampDocument, CampRegistration } from '../../types';
import { useT } from '../../lib/i18n';
import * as api from '../../api/client';
import { shrinkToDataUrl } from '../../lib/image';

type Props = {
  season: number;
  /** Set when an existing registration is being looked at rather than created. */
  registration: CampRegistration | null;
  onClose: () => void;
  /** Carries the new registration's id, so the caller can stay on it. */
  onSaved: (registrationId?: string) => void;
};

/**
 * Signing a child up for a season.
 *
 * Names are one field each, not first and last: that is how they are written on
 * the form the parent hands over, and splitting them only creates two fields to
 * get wrong.
 *
 * The emergency contacts default to the guardian, because for most children the
 * first person to ring is the person who signed the form.
 */
export default function CampRegistrationForm({ season, registration, onClose, onSaved }: Props) {
  const { t } = useT();
  const editing = registration !== null;

  const [child, setChild] = useState(registration?.childName ?? '');
  const [birthDate, setBirthDate] = useState(registration?.birthDate ?? '');
  const [allergy, setAllergy] = useState(registration?.allergyNote ?? '');
  const [gName, setGName] = useState(registration?.guardianName ?? '');
  const [gPhone, setGPhone] = useState(registration?.guardianPhone ?? '');
  const [e1Name, setE1Name] = useState(registration?.emergency1Name ?? '');
  const [e1Phone, setE1Phone] = useState(registration?.emergency1Phone ?? '');
  const [e2Name, setE2Name] = useState(registration?.emergency2Name ?? '');
  const [e2Phone, setE2Phone] = useState(registration?.emergency2Phone ?? '');
  const [note, setNote] = useState(registration?.note ?? '');

  const [docs, setDocs] = useState<CampDocument[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!registration) return;
    let cancelled = false;
    api
      .listCampDocuments(registration.registrationId)
      .then((d) => !cancelled && setDocs(d))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [registration]);

  /** The first person to ring is usually whoever signed the form. */
  function sameAsGuardian(slot: 1 | 2) {
    if (slot === 1) {
      setE1Name(gName);
      setE1Phone(gPhone);
    } else {
      setE2Name(gName);
      setE2Phone(gPhone);
    }
  }

  const details = {
    birthDate: birthDate || null,
    allergyNote: allergy,
    guardianName: gName,
    guardianPhone: gPhone,
    emergency1Name: e1Name,
    emergency1Phone: e1Phone,
    emergency2Name: e2Name,
    emergency2Phone: e2Phone,
  };

  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        await api.updateCustomer(registration.customerId, { fullName: child, ...details });
        onSaved();
      } else {
        const id = await api.registerForCamp({ childName: child, season, details, note });
        onSaved(id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function addFile(file: File) {
    if (!registration) return;
    setBusy(true);
    setError(null);
    try {
      const data = await shrinkToDataUrl(file);
      await api.addCampDocument(registration.registrationId, data, file.name);
      setDocs(await api.listCampDocuments(registration.registrationId));
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function removeFile(id: string) {
    if (!registration) return;
    if (!window.confirm(t('Bu form silinsin mi?'))) return;
    setBusy(true);
    try {
      await api.deleteCampDocument(id);
      setDocs(await api.listCampDocuments(registration.registrationId));
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="dialog dialog--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="camp-reg-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="camp-reg-title">
          {editing ? t('Kamp kaydı') : t('Kamp Kaydı Ekle')} · {season}
        </h3>

        {error && <p className="dialog-error">{error}</p>}

        <div className="money-row">
          <label className="field">
            <span>{t('Çocuğun adı soyadı')}</span>
            <input value={child} onChange={(e) => setChild(e.target.value)} autoFocus />
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
            <span>{t('Veli adı soyadı')}</span>
            <input value={gName} onChange={(e) => setGName(e.target.value)} />
          </label>
          <label className="field">
            <span>{t('Veli telefonu')}</span>
            <input value={gPhone} onChange={(e) => setGPhone(e.target.value)} inputMode="tel" />
          </label>
        </div>

        <label className="field">
          <span>
            {t('Alerji')} ({t('opsiyonel')})
          </span>
          <input value={allergy} onChange={(e) => setAllergy(e.target.value)} />
        </label>

        <fieldset className="field">
          <span>{t('Acil durumda aranacak')}</span>

          <div className="money-row">
            <input value={e1Name} onChange={(e) => setE1Name(e.target.value)} placeholder={t('İsim')} />
            <input
              value={e1Phone}
              onChange={(e) => setE1Phone(e.target.value)}
              placeholder={t('Telefon')}
              inputMode="tel"
            />
          </div>
          <button type="button" className="link-btn" onClick={() => sameAsGuardian(1)}>
            {t('Veli ile aynı')}
          </button>

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
          <button type="button" className="link-btn" onClick={() => sameAsGuardian(2)}>
            {t('Veli ile aynı')}
          </button>
        </fieldset>

        {!editing && (
          <label className="field">
            <span>
              {t('Not')} ({t('opsiyonel')})
            </span>
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        )}

        <section className="drawer-block">
          <h4 className="panel-title">{t('Form')}</h4>
          {editing ? (
            <>
              <label className="filedrop">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) void addFile(file);
                  }}
                />
                <span>{busy ? t('Yükleniyor…') : t('Formun fotoğrafını ekle')}</span>
              </label>
              {docs.length === 0 ? (
                <p className="cell-dim">{t('Henüz form eklenmemiş.')}</p>
              ) : (
                <ul className="docgrid">
                  {docs.map((d) => (
                    <li key={d.id}>
                      <a href={d.data} target="_blank" rel="noreferrer">
                        <img src={d.data} alt={d.filename ?? t('Form')} />
                      </a>
                      <button className="link-btn danger" onClick={() => removeFile(d.id)}>
                        {t('Sil')}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="cell-dim">
              {t('Kaydet dedikten sonra bu pencere açık kalır ve formu ekleyebilirsiniz.')}
            </p>
          )}
        </section>

        <div className="dialog-actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {editing ? t('Kapat') : t('Vazgeç')}
          </button>
          <button
            type="button"
            className="btn"
            onClick={save}
            disabled={busy || child.trim().length < 2}
          >
            {busy ? t('Kaydediliyor…') : t('Kaydet')}
          </button>
        </div>
      </div>
    </div>
  );
}
