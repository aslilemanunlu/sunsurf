import { useEffect } from 'react';
import type { Agreement } from '../../types';
import { useT } from '../../lib/i18n';
import type { OpenPackage } from '../../api/client';
import {
  EQUIPMENT_LABEL,
  KIND_LABEL,
  UNIT_LABEL,
  formatMoney,
  planLabel,
  planOf,
} from '../../lib/agreements';
import { initials } from '../../lib/initials';

type Props = {
  agreement: Agreement;
  /** Set for a lesson package: how many were sold, used and are left. */
  pack: OpenPackage | null;
  onClose: () => void;
  onPay: () => void;
  onSettle: () => void;
  onDelete: () => void;
  /** Opens the customer's own card, which is where their details live. */
  onOpenCustomer: () => void;
};

/**
 * One agreement, in the order somebody asks about it: what is left of it, then
 * what is owed on it.
 *
 * The lessons and the money are two different counts and are kept apart on
 * purpose — a paid-up package can still have lessons left, and a used-up one
 * can still be owed for.
 */
export default function AgreementDetail({
  agreement: a,
  pack,
  onClose,
  onPay,
  onSettle,
  onDelete,
  onOpenCustomer,
}: Props) {
  const { t } = useT();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const plan = t(planLabel(a.kind, a.plan) ?? KIND_LABEL[a.kind]);
  const unit = planOf(a.kind, a.plan)?.unit;

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="dialog dialog--wide"
        role="dialog"
        aria-modal="true"
        aria-label={a.customerName}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="drawer-head">
          <div className="drawer-hero">
            <span className="avatar avatar--lg" aria-hidden="true">
              {initials(a.customerName)}
            </span>
            <div>
              <h3>{a.customerName}</h3>
              <p className="cell-dim">
                {plan}
                {a.units !== null && unit ? ` · ${a.units} ${t(UNIT_LABEL[unit])}` : ''}
                {a.equipmentLevel ? ` · ${EQUIPMENT_LABEL[a.equipmentLevel]}` : ''}
                {a.label ? ` · ${a.label}` : ''}
              </p>
            </div>
          </div>
          <button className="link-btn" onClick={onClose} aria-label={t('Kapat')}>
            ✕
          </button>
        </header>

        {pack && (
          <div className="tiles">
            <article className="tile">
              <p className="tile-value">{pack.sold}</p>
              <p className="tile-label">{t('paketteki ders')}</p>
            </article>
            <article className="tile">
              <p className="tile-value">{pack.used}</p>
              <p className="tile-label">{t('kullanılan')}</p>
            </article>
            <article className="tile tile--accent">
              <p className="tile-value">{pack.remaining}</p>
              <p className="tile-label">{t('kalan hak')}</p>
            </article>
          </div>
        )}

        {a.kind === 'kids_camp' && a.campDays !== null && (
          <div className="tiles">
            <article className="tile tile--accent">
              <p className="tile-value">{a.campDays}</p>
              <p className="tile-label">{t('gün geldi')}</p>
            </article>
          </div>
        )}

        <dl className="money">
          <div>
            <dt>{t('Anlaşılan tutar')}</dt>
            <dd>{formatMoney(a.agreedAmount)}</dd>
          </div>
          <div>
            <dt>{t('Tahsil edilen')}</dt>
            <dd className="paid">{formatMoney(a.received)}</dd>
          </div>
          {a.writtenOff > 0 && (
            <div>
              <dt>{t('Silinen')}</dt>
              <dd className="cell-dim">{formatMoney(a.writtenOff)}</dd>
            </div>
          )}
          <div>
            <dt>{t('Kalan bakiye')}</dt>
            <dd className={a.balance > 0 ? 'owing' : 'paid'}>{formatMoney(a.balance)}</dd>
          </div>
        </dl>

        {a.note && <p className="admin-hint">{a.note}</p>}

        {pack && (
          <p className="notebox">
            <strong>{t('Bir ders bir hak düşer, kaç saat sürdüğü fark etmez.')}</strong>
            <span>{t('Ders silinirse hak pakete geri döner.')}</span>
          </p>
        )}

        <div className="dialog-actions">
          <button className="link-btn" onClick={onOpenCustomer}>
            {t('Müşteri kartı')}
          </button>
          <span className="spacer" />
          <button className="link-btn danger" onClick={onDelete}>
            {t('Sil')}
          </button>
          {a.balance > 0 && (
            <button className="btn btn--ghost" onClick={onSettle}>
              {t('Bakiyeyi 0’la')}
            </button>
          )}
          <button className="btn" onClick={onPay}>
            {t('Ödeme ekle')}
          </button>
        </div>
      </div>
    </div>
  );
}
