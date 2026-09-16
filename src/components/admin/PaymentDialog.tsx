import { useEffect, useState } from 'react';
import type { Agreement, Payment } from '../../types';
import { locale, useT } from '../../lib/i18n';
import * as api from '../../api/client';
import { KIND_LABEL, formatMoney, planLabel } from '../../lib/agreements';

type Props = {
  agreement: Agreement;
  onClose: () => void;
  onChanged: () => void;
};

/** Money taken against one agreement, and everything taken before. */
export default function PaymentDialog({ agreement, onClose, onChanged }: Props) {
  const { t } = useT();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Kept locally so the figures move as payments are added. */
  const [balance, setBalance] = useState(agreement.balance);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const refresh = async () => {
    const rows = await api.listPayments(agreement.id);
    setPayments(rows);
    setBalance(agreement.agreedAmount - rows.reduce((s, p) => s + p.amount, 0));
  };

  useEffect(() => {
    refresh().catch((e) => setError(e instanceof Error ? e.message : String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agreement.id]);

  const value = Number(amount.replace(',', '.'));
  const canSave = !busy && amount.trim() !== '' && Number.isFinite(value) && value > 0;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.addPayment({ agreementId: agreement.id, amount: value, note });
      setAmount('');
      setNote('');
      await refresh();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm(t('Bu ödeme kaydı silinsin mi?'))) return;
    setBusy(true);
    try {
      await api.deletePayment(id);
      await refresh();
      onChanged();
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
        aria-labelledby="payment-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="payment-title">{t('Ödeme')}</h3>

        <div className="dialog-summary">
          <p className="dialog-instructor">{agreement.customerName}</p>
          <p className="dialog-when">
            {t(KIND_LABEL[agreement.kind])} · {t(planLabel(agreement.kind, agreement.plan) ?? '—')}
            {agreement.label ? ` · ${agreement.label}` : ''}
          </p>
        </div>

        {error && <p className="dialog-error">{error}</p>}

        <div className="money-summary">
          <div>
            <span>{t('Anlaşılan')}</span>
            <strong>{formatMoney(agreement.agreedAmount)}</strong>
          </div>
          <div>
            <span>{t('Kalan')}</span>
            <strong className={balance > 0 ? 'owing' : undefined}>{formatMoney(balance)}</strong>
          </div>
        </div>

        <div className="money-row">
          <label className="field">
            <span>{t('Tutar')}</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0"
              autoFocus
            />
          </label>
          <label className="field">
            <span>
              {t('Not')} ({t('opsiyonel')})
            </span>
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>

        {balance > 0 && (
          <button
            type="button"
            className="link-btn"
            onClick={() => setAmount(String(balance))}
            disabled={busy}
          >
            {t('Kalanın tamamı')}: {formatMoney(balance)}
          </button>
        )}

        <div className="dialog-actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {t('Kapat')}
          </button>
          <button type="button" className="btn" onClick={save} disabled={!canSave}>
            {busy ? t('Kaydediliyor…') : t('Ödemeyi kaydet')}
          </button>
        </div>

        <section className="drawer-block">
          <h4 className="panel-title">{t('Geçmiş')}</h4>
          {payments.length === 0 ? (
            <p className="cell-dim">{t('Henüz ödeme yok.')}</p>
          ) : (
            <ul className="history">
              {payments.map((p) => (
                <li key={p.id}>
                  <span className="cell-dim">
                    {new Date(p.paidAt).toLocaleDateString(locale())}
                  </span>
                  <strong>{formatMoney(p.amount)}</strong>
                  {p.kind === 'writeoff' && <span className="tag tag--group">{t('Silindi')}</span>}
                  {p.note && <span className="cell-dim">{p.note}</span>}
                  <button className="link-btn danger" onClick={() => remove(p.id)} disabled={busy}>
                    {t('Sil')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
