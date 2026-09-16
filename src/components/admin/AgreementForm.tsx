import { useEffect, useMemo, useState } from 'react';
import type { AgreementKind, CustomerRef } from '../../types';
import { useT } from '../../lib/i18n';
import * as api from '../../api/client';
import { KINDS, KIND_LABEL } from '../../lib/agreements';

type Props = {
  customers: CustomerRef[];
  plans: Record<AgreementKind, { value: string; label: string }[]>;
  onClose: () => void;
  onSaved: () => void;
};

/**
 * A new agreement, and optionally the money taken at the same moment — which is
 * the usual case at a desk: somebody buys a ten-lesson pack and pays half of it
 * there and then.
 */
export default function AgreementForm({ customers, plans, onClose, onSaved }: Props) {
  const { t } = useT();
  const [customerId, setCustomerId] = useState('');
  const [kind, setKind] = useState<AgreementKind>('lesson');
  const [plan, setPlan] = useState(plans.lesson[0].value);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [prepaid, setPrepaid] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // each kind sells different things, so the plan resets with it
  useEffect(() => {
    setPlan(plans[kind][0].value);
  }, [kind, plans]);

  const sorted = useMemo(
    () => [...customers].sort((a, b) => a.name.localeCompare(b.name, 'tr')),
    [customers],
  );

  const agreed = Number(amount.replace(',', '.'));
  const paid = prepaid.trim() === '' ? 0 : Number(prepaid.replace(',', '.'));
  const amountOk = amount.trim() !== '' && Number.isFinite(agreed) && agreed >= 0;
  const paidOk = Number.isFinite(paid) && paid >= 0 && paid <= (amountOk ? agreed : Infinity);
  const needsLabel = plan === 'other';
  const canSave =
    !saving && customerId !== '' && amountOk && paidOk && (!needsLabel || label.trim() !== '');

  async function addCustomer() {
    const name = newName.trim();
    if (name.length < 2) return;
    setSaving(true);
    setError(null);
    try {
      const id = await api.createCustomer({ fullName: name, phone: newPhone });
      setCustomerId(id);
      setAdding(false);
      setNewName('');
      setNewPhone('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const id = await api.createAgreement({
        customerId,
        kind,
        plan,
        label,
        agreedAmount: agreed,
        note,
      });
      if (paid > 0) {
        await api.addPayment({ agreementId: id, amount: paid });
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
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="agreement-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="agreement-title">{t('Anlaşma Ekle')}</h3>

        {error && <p className="dialog-error">{error}</p>}

        <div className="field">
          <span>{t('Müşteri')}</span>
          {adding ? (
            <div className="inline-add">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t('İsim soyisim')}
                autoFocus
              />
              <input
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder={t('Telefon')}
                inputMode="tel"
              />
              <div className="row-actions">
                <button
                  type="button"
                  className="btn btn--small"
                  onClick={addCustomer}
                  disabled={saving || newName.trim().length < 2}
                >
                  {t('Ekle')}
                </button>
                <button type="button" className="link-btn" onClick={() => setAdding(false)}>
                  {t('Vazgeç')}
                </button>
              </div>
            </div>
          ) : (
            <>
              <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">{t('— müşteri seçin —')}</option>
                {sorted.map((c) => (
                  <option key={c.customerId} value={c.customerId}>
                    {c.name}
                    {c.phone ? ` · ${c.phone}` : ''}
                  </option>
                ))}
              </select>
              <button type="button" className="link-btn" onClick={() => setAdding(true)}>
                {t('+ Yeni müşteri')}
              </button>
            </>
          )}
        </div>

        <div className="field">
          <span>{t('Tür')}</span>
          <div className="segmented segmented--block" role="group" aria-label={t('Tür')}>
            {KINDS.map((k) => (
              <button
                key={k}
                type="button"
                className={`segment${kind === k ? ' is-active' : ''}`}
                onClick={() => setKind(k)}
                aria-pressed={kind === k}
              >
                {t(KIND_LABEL[k])}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span>{t('Detay')}</span>
          <select value={plan} onChange={(e) => setPlan(e.target.value)}>
            {plans[kind].map((p) => (
              <option key={p.value} value={p.value}>
                {t(p.label)}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>
            {kind === 'kids_camp' ? t('Çocuğun ismi') : t('Açıklama')}
            {!needsLabel && kind !== 'kids_camp' ? ` (${t('opsiyonel')})` : ''}
          </span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={kind === 'kids_camp' ? t('Çocuğun ismi') : t('Detay yazın')}
          />
          {needsLabel && label.trim() === '' && (
            <small className="field-hint">{t('“Diğer” seçtiniz; ne olduğunu yazın.')}</small>
          )}
        </label>

        <div className="money-row">
          <label className="field">
            <span>{t('Anlaşılan tutar')}</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0"
            />
          </label>
          <label className="field">
            <span>{t('Şimdi ödenen')}</span>
            <input
              value={prepaid}
              onChange={(e) => setPrepaid(e.target.value)}
              inputMode="decimal"
              placeholder="0"
            />
          </label>
        </div>
        {!paidOk && (
          <small className="field-hint">{t('Ödenen tutar anlaşılan tutardan büyük olamaz.')}</small>
        )}

        <label className="field">
          <span>
            {t('Not')} ({t('opsiyonel')})
          </span>
          <input value={note} onChange={(e) => setNote(e.target.value)} />
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
