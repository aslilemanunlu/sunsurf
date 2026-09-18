import { useEffect, useMemo, useState } from 'react';
import type { AgreementKind, CustomerRef, EquipmentLevel } from '../../types';
import { useT } from '../../lib/i18n';
import * as api from '../../api/client';
import NameSearch from './NameSearch';
import {
  EQUIPMENT_LABEL,
  EQUIPMENT_LEVELS,
  KINDS,
  KIND_LABEL,
  UNIT_LABEL,
  planOf,
  type Plan,
} from '../../lib/agreements';

type Props = {
  customers: CustomerRef[];
  plans: Record<AgreementKind, Plan[]>;
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
  /** What has been typed into the name box, which is how one is found. */
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<AgreementKind>('lesson');
  const [plan, setPlan] = useState(plans.lesson[0].value);
  const [label, setLabel] = useState('');
  const [level, setLevel] = useState<EquipmentLevel>('beginner');
  const [units, setUnits] = useState('');
  const [amount, setAmount] = useState('');
  const [prepaid, setPrepaid] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const newNameOk = newName.trim().length >= 2;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // each kind sells different things, so the plan resets with it
  useEffect(() => {
    setPlan(plans[kind][0].value);
  }, [kind, plans]);

  const chosen = planOf(kind, plan);
  const unit = chosen?.unit;

  // and the default count follows the plan that gave it meaning
  useEffect(() => {
    setUnits(chosen?.options?.[0] !== undefined ? String(chosen.options[0]) : '');
  }, [chosen]);

  const sorted = useMemo(
    () => [...customers].sort((a, b) => a.name.localeCompare(b.name, 'tr')),
    [customers],
  );

  const agreed = Number(amount.replace(',', '.'));
  const paid = prepaid.trim() === '' ? 0 : Number(prepaid.replace(',', '.'));
  const amountOk = amount.trim() !== '' && Number.isFinite(agreed) && agreed >= 0;
  const paidOk = Number.isFinite(paid) && paid >= 0 && paid <= (amountOk ? agreed : Infinity);
  const needsLabel = plan === 'other';
  const unitValue = units.trim() === '' ? null : Number(units);
  const unitsOk = !unit || (unitValue !== null && Number.isFinite(unitValue) && unitValue > 0);
  // While the new-customer fields are open, a typed name counts as a chosen
  // customer: the record is created on save. Requiring a separate "Ekle" first
  // meant the main button sat there disabled with nothing saying why.
  const haveCustomer = adding ? newNameOk : customerId !== '';
  const canSave =
    !saving &&
    haveCustomer &&
    amountOk &&
    paidOk &&
    unitsOk &&
    (!needsLabel || label.trim() !== '');

  async function save() {
    if (adding) {
      const same = await api.findCustomerByName(newName);
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
    try {
      // The phone is optional here as everywhere else: a name is enough to owe
      // somebody money against.
      const forCustomer = adding
        ? await api.createCustomer({ fullName: newName, phone: newPhone })
        : customerId;

      const id = await api.createAgreement({
        customerId: forCustomer,
        kind,
        plan,
        equipmentLevel: kind === 'rental' ? level : null,
        units: unit ? unitValue : null,
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
                placeholder={`${t('Telefon')} (${t('opsiyonel')})`}
                inputMode="tel"
              />
              <small className="field-hint">
                {t('Telefon opsiyonel. Kaydet dediğinizde müşteri de oluşturulur.')}
              </small>
              <button type="button" className="link-btn" onClick={() => setAdding(false)}>
                {t('Listeden seç')}
              </button>
            </div>
          ) : (
            <>
              <NameSearch
                value={search}
                onChange={(text) => {
                  setSearch(text);
                  // editing the name lets go of whoever was picked
                  if (customerId) setCustomerId('');
                }}
                items={sorted.map((c) => ({
                  id: c.customerId,
                  name: c.name,
                  hint: c.phone,
                }))}
                onPick={(item) => {
                  setCustomerId(item.id);
                  setSearch(item.name);
                }}
                placeholder={t('İsim yazın, listeden seçin')}
                autoFocus
                hint={customerId ? 'Kayıtlı müşteri' : search.trim() ? 'Listeden seçin' : ''}
              />
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

        {kind === 'rental' && (
          <div className="field">
            <span>{t('Ekipman seviyesi')}</span>
            <div
              className="segmented segmented--block"
              role="group"
              aria-label={t('Ekipman seviyesi')}
            >
              {EQUIPMENT_LEVELS.map((l) => (
                <button
                  key={l}
                  type="button"
                  className={`segment${level === l ? ' is-active' : ''}`}
                  onClick={() => setLevel(l)}
                  aria-pressed={level === l}
                >
                  {EQUIPMENT_LABEL[l]}
                </button>
              ))}
            </div>
          </div>
        )}

        <label className="field">
          <span>{kind === 'rental' ? t('Süre') : t('Detay')}</span>
          <select value={plan} onChange={(e) => setPlan(e.target.value)}>
            {plans[kind].map((p) => (
              <option key={p.value} value={p.value}>
                {t(p.label)}
              </option>
            ))}
          </select>
        </label>

        {unit && (
          <div className="field">
            <span>{t('Adet')}</span>
            <div className="unit-row">
              {(chosen?.options ?? []).map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`segment${units === String(n) ? ' is-active' : ''}`}
                  onClick={() => setUnits(String(n))}
                  aria-pressed={units === String(n)}
                >
                  {n}
                </button>
              ))}
              {chosen?.free && (
                <input
                  type="number"
                  min={1}
                  value={units}
                  onChange={(e) => setUnits(e.target.value)}
                  aria-label={t('Adet')}
                />
              )}
            </div>
            <small className="field-hint">
              {t('Birim')}: {t(UNIT_LABEL[unit])}
            </small>
          </div>
        )}

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
