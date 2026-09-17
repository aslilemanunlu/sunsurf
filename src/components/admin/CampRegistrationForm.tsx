import { useEffect, useMemo, useState } from 'react';
import type { CampDocument, CampRegistration } from '../../types';
import { useT } from '../../lib/i18n';
import * as api from '../../api/client';
import { shrinkToDataUrl } from '../../lib/image';

type Props = {
  season: number;
  /** Set when an existing registration is being changed rather than created. */
  registration: CampRegistration | null;
  onClose: () => void;
  onSaved: () => void;
};

/** A photographed page waiting for the registration it belongs to. */
type Pending = { key: string; name: string; data: string };

const EMPTY: api.CampForm = {
  childName: '',
  birthDate: null,
  allergyNote: '',
  guardianName: '',
  guardianPhone: '',
  emergency1Name: '',
  emergency1Phone: '',
  emergency2Name: '',
  emergency2Phone: '',
};

function formOf(r: CampRegistration): api.CampForm {
  return {
    childName: r.childName,
    birthDate: r.birthDate,
    allergyNote: r.allergyNote ?? '',
    guardianName: r.guardianName ?? '',
    guardianPhone: r.guardianPhone ?? '',
    emergency1Name: r.emergency1Name ?? '',
    emergency1Phone: r.emergency1Phone ?? '',
    emergency2Name: r.emergency2Name ?? '',
    emergency2Phone: r.emergency2Phone ?? '',
  };
}

function download(dataUrl: string, filename: string) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/**
 * One season's form for one child.
 *
 * Everything written here belongs to this season's registration. A returning
 * child starts from last season's form — picked from the list — and saving
 * makes a new registration for the new season; last year's stays exactly as it
 * was signed.
 *
 * The form can be photographed before saving. It used to be the other way
 * round, which meant saving, then the dialog staying open for the upload —
 * and a dialog that stays open after "Kaydet" looks like one that did not save.
 */
export default function CampRegistrationForm({ season, registration, onClose, onSaved }: Props) {
  const { t } = useT();
  const editing = registration !== null;

  const [form, setForm] = useState<api.CampForm>(registration ? formOf(registration) : EMPTY);
  const [note, setNote] = useState(registration?.note ?? '');
  /** The child this is for, when they are already known. */
  const [customerId, setCustomerId] = useState<string | null>(registration?.customerId ?? null);

  const [past, setPast] = useState<CampRegistration[]>([]);

  const [docs, setDocs] = useState<CampDocument[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof api.CampForm) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    if (registration) {
      api
        .listCampDocuments(registration.registrationId)
        .then((d) => !cancelled && setDocs(d))
        .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    } else {
      api
        .listPastCampChildren()
        .then((p) => !cancelled && setPast(p))
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [registration]);

  /** Children from other seasons who are not already signed up for this one. */
  const returning = useMemo(() => past.filter((p) => p.season !== season), [past, season]);

  function pickReturning(id: string) {
    const r = returning.find((p) => p.customerId === id);
    if (!r) {
      setCustomerId(null);
      setForm(EMPTY);
      return;
    }
    setCustomerId(r.customerId);
    // last season's form as the starting point; saving writes a new one
    setForm(formOf(r));
  }

  /** The first person to ring is usually whoever signed the form. */
  function sameAsGuardian(slot: 1 | 2) {
    setForm((prev) =>
      slot === 1
        ? { ...prev, emergency1Name: prev.guardianName, emergency1Phone: prev.guardianPhone }
        : { ...prev, emergency2Name: prev.guardianName, emergency2Phone: prev.guardianPhone },
    );
  }

  async function queueFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const data = await shrinkToDataUrl(file);
      if (registration) {
        await api.addCampDocument(registration.registrationId, data, file.name);
        setDocs(await api.listCampDocuments(registration.registrationId));
      } else {
        setPending((prev) => [...prev, { key: `${Date.now()}-${file.name}`, name: file.name, data }]);
      }
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
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    // A new name that matches somebody already on file is usually the same
    // child typed again. Asking once is cheaper than merging duplicates later.
    if (!editing && !customerId) {
      const same = await api.findCustomerByName(form.childName);
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
      if (editing) {
        await api.updateCampRegistration(registration.registrationId, form);
      } else {
        const id = await api.registerForCamp({ customerId, season, form, note });
        for (const p of pending) await api.addCampDocument(id, p.data, p.name);
      }
      onSaved();
      onClose();
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
          {editing ? t('Kamp kaydı') : t('Kamp Kaydı Ekle')} · {registration?.season ?? season}
        </h3>

        {error && <p className="dialog-error">{error}</p>}

        {!editing && returning.length > 0 && (
          <label className="field">
            <span>{t('Önceki sezonlardan öğrenci')}</span>
            <select value={customerId ?? ''} onChange={(e) => pickReturning(e.target.value)}>
              <option value="">{t('— yeni öğrenci —')}</option>
              {returning.map((r) => (
                <option key={r.customerId} value={r.customerId}>
                  {r.childName} · {r.season}
                </option>
              ))}
            </select>
            {customerId && (
              <small className="field-hint">
                {t(
                  'Son formu açıldı; düzenleyip kaydettiğinizde {s} sezonu için yeni bir kayıt olur. Eski sezonun kaydı değişmez.',
                ).replace('{s}', String(season))}
              </small>
            )}
          </label>
        )}

        <div className="money-row">
          <label className="field">
            <span>{t('Çocuğun adı soyadı')}</span>
            <input value={form.childName} onChange={(e) => set('childName')(e.target.value)} autoFocus />
          </label>
          <label className="field">
            <span>
              {t('Doğum tarihi')} ({t('opsiyonel')})
            </span>
            <input
              type="date"
              value={form.birthDate ?? ''}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => set('birthDate')(e.target.value)}
            />
          </label>
        </div>

        <div className="money-row">
          <label className="field">
            <span>{t('Veli adı soyadı')}</span>
            <input value={form.guardianName} onChange={(e) => set('guardianName')(e.target.value)} />
          </label>
          <label className="field">
            <span>{t('Veli telefonu')}</span>
            <input
              value={form.guardianPhone}
              onChange={(e) => set('guardianPhone')(e.target.value)}
              inputMode="tel"
            />
          </label>
        </div>

        <label className="field">
          <span>
            {t('Alerji')} ({t('opsiyonel')})
          </span>
          <input value={form.allergyNote} onChange={(e) => set('allergyNote')(e.target.value)} />
        </label>

        <fieldset className="field">
          <span>{t('Acil durumda aranacak')}</span>

          <div className="money-row">
            <input
              value={form.emergency1Name}
              onChange={(e) => set('emergency1Name')(e.target.value)}
              placeholder={t('İsim')}
            />
            <input
              value={form.emergency1Phone}
              onChange={(e) => set('emergency1Phone')(e.target.value)}
              placeholder={t('Telefon')}
              inputMode="tel"
            />
          </div>
          <button type="button" className="link-btn" onClick={() => sameAsGuardian(1)}>
            {t('Veli ile aynı')}
          </button>

          <div className="money-row">
            <input
              value={form.emergency2Name}
              onChange={(e) => set('emergency2Name')(e.target.value)}
              placeholder={`${t('İsim')} 2`}
            />
            <input
              value={form.emergency2Phone}
              onChange={(e) => set('emergency2Phone')(e.target.value)}
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
          <label className="filedrop">
            <input
              type="file"
              accept="image/*"
              capture="environment"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void queueFile(file);
              }}
            />
            <span>{busy ? t('Yükleniyor…') : t('Formun fotoğrafını ekle')}</span>
          </label>

          {docs.length === 0 && pending.length === 0 ? (
            <p className="cell-dim">{t('Henüz form eklenmemiş.')}</p>
          ) : (
            <ul className="docgrid">
              {docs.map((d, i) => (
                <li key={d.id}>
                  <a href={d.data} target="_blank" rel="noreferrer">
                    <img src={d.data} alt={d.filename ?? t('Form')} />
                  </a>
                  <div className="row-actions">
                    <button
                      className="link-btn"
                      onClick={() =>
                        download(
                          d.data,
                          d.filename ?? `${form.childName || 'form'}-${registration?.season}-${i + 1}.jpg`,
                        )
                      }
                    >
                      {t('İndir')}
                    </button>
                    <button className="link-btn danger" onClick={() => removeFile(d.id)}>
                      {t('Sil')}
                    </button>
                  </div>
                </li>
              ))}
              {pending.map((p) => (
                <li key={p.key}>
                  <img src={p.data} alt={p.name} />
                  <div className="row-actions">
                    <span className="cell-dim">{t('Kaydedince eklenecek')}</span>
                    <button
                      className="link-btn danger"
                      onClick={() => setPending((prev) => prev.filter((x) => x.key !== p.key))}
                    >
                      {t('Sil')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="dialog-actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {t('Vazgeç')}
          </button>
          <button
            type="button"
            className="btn"
            onClick={save}
            disabled={busy || form.childName.trim().length < 2}
          >
            {busy ? t('Kaydediliyor…') : t('Kaydet')}
          </button>
        </div>
      </div>
    </div>
  );
}
