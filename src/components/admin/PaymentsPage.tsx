import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Agreement, CrmCustomer, CustomerRef } from '../../types';
import { useT } from '../../lib/i18n';
import * as api from '../../api/client';
import {
  EQUIPMENT_LABEL,
  KINDS,
  KIND_LABEL,
  PLANS,
  UNIT_LABEL,
  formatMoney,
  planLabel,
  planOf,
} from '../../lib/agreements';
import AgreementForm from './AgreementForm';
import AgreementDetail from './AgreementDetail';
import PaymentDialog from './PaymentDialog';
import CustomerDrawer from './CustomerDrawer';
import MultiSelect from './MultiSelect';
import { initials } from '../../lib/initials';

type Props = { onChanged: () => void };

/**
 * What everyone owes.
 *
 * One list, not four: a lesson pack, a month of storage and a week's rental are
 * the same question — agreed, paid, left — and a customer can hold all three at
 * once. The kind only decides what the detail column says.
 */
export default function PaymentsPage({ onChanged }: Props) {
  const { t } = useT();
  const [rows, setRows] = useState<Agreement[]>([]);
  const [customers, setCustomers] = useState<CustomerRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Empty means everything: a filter nobody has touched hides nothing. */
  const [kinds, setKinds] = useState<string[]>([]);
  const [pickedCustomers, setPickedCustomers] = useState<string[]>([]);
  const [onlyOwing, setOnlyOwing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState<Agreement | null>(null);
  const [open, setOpen] = useState<Agreement | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** How many lessons are left on each package. */
  const [packs, setPacks] = useState<Map<string, api.OpenPackage>>(new Map());
  /** The customer records, so a name here can open its own card. */
  const [people, setPeople] = useState<CrmCustomer[]>([]);
  const [openCustomerId, setOpenCustomerId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, refs, open, crm] = await Promise.all([
        api.listAgreements(),
        api.listCustomers(),
        api.listAllOpenPackages().catch(() => new Map<string, api.OpenPackage>()),
        api.listCrmCustomers().catch(() => [] as CrmCustomer[]),
      ]);
      setRows(list);
      setCustomers(refs);
      setPacks(open);
      setPeople(crm);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(
    () =>
      rows.filter((a) => {
        if (kinds.length > 0 && !kinds.includes(a.kind)) return false;
        if (onlyOwing && a.balance <= 0) return false;
        if (pickedCustomers.length > 0 && !pickedCustomers.includes(a.customerId)) return false;
        return true;
      }),
    [rows, kinds, onlyOwing, pickedCustomers],
  );

  /** Only people who actually have an agreement; the rest are noise here. */
  const withAgreements = useMemo(() => {
    const seen = new Map<string, string>();
    for (const a of rows) seen.set(a.customerId, a.customerName);
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }, [rows]);

  /** Totals follow the filter: the number you are looking at is the one shown. */
  const totals = useMemo(() => {
    const agreed = shown.reduce((s, a) => s + a.agreedAmount, 0);
    const received = shown.reduce((s, a) => s + a.received, 0);
    const written = shown.reduce((s, a) => s + a.writtenOff, 0);
    const balance = shown.reduce((s, a) => s + Math.max(0, a.balance), 0);
    const owing = new Set(shown.filter((a) => a.balance > 0).map((a) => a.customerId)).size;
    return { agreed, received, written, balance, owing };
  }, [shown]);

  async function settle(a: Agreement) {
    if (a.balance <= 0) return;
    const question = t(
      '{n} kalan bakiye sıfırlansın mı? Bu tutar tahsilat olarak sayılmaz.',
    ).replace('{n}', formatMoney(a.balance));
    if (!window.confirm(question)) return;
    setBusyId(a.id);
    try {
      await api.addPayment({ agreementId: a.id, amount: a.balance, kind: 'writeoff' });
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(a: Agreement) {
    if (!window.confirm(t('Bu anlaşma ve ödemeleri silinsin mi?'))) return;
    setBusyId(a.id);
    try {
      await api.deleteAgreement(a.id);
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  const openCustomer = people.find((c) => c.customerId === openCustomerId) ?? null;

  return (
    <section>
      <div className="admin-bar">
        <h2 className="admin-title">{t('Paket ve bakiye')}</h2>
        <span className="admin-count">
          {shown.length} / {rows.length}
        </span>
        <button className="btn" onClick={() => setAdding(true)}>
          {t('Anlaşma Ekle')}
        </button>
      </div>

      <p className="admin-hint">{t('Kim kaç ders aldı, kaç dersi kaldı, ne kadar bakiyesi var')}</p>

      {error && <p className="dialog-error">{error}</p>}

      <div className="stat-grid stat-grid--compact">
        <article className="stat stat--accent">
          <header className="stat-head">
            <span className="stat-title">{t('Kalan bakiye')}</span>
          </header>
          <p className="stat-value">{formatMoney(totals.balance)}</p>
        </article>
        <article className="stat stat--kids">
          <header className="stat-head">
            <span className="stat-title">{t('Tahsil edilen')}</span>
          </header>
          <p className="stat-value">{formatMoney(totals.received)}</p>
        </article>
        <article className="stat stat--individual">
          <header className="stat-head">
            <span className="stat-title">{t('Anlaşılan')}</span>
          </header>
          <p className="stat-value">{formatMoney(totals.agreed)}</p>
        </article>
        <article className="stat stat--group">
          <header className="stat-head">
            <span className="stat-title">{t('Borçlu müşteri')}</span>
          </header>
          <p className="stat-value">{totals.owing}</p>
        </article>
      </div>

      <div className="filters">
        <MultiSelect
          label={t('Türe göre filtrele')}
          allLabel={t('Tüm türler')}
          options={KINDS.map((k) => ({ value: k as string, label: t(KIND_LABEL[k]) }))}
          picked={kinds}
          onChange={setKinds}
        />

        <label className="check check--inline">
          <input
            type="checkbox"
            checked={onlyOwing}
            onChange={(e) => setOnlyOwing(e.target.checked)}
          />
          {t('Sadece borcu olanlar')}
        </label>

        <MultiSelect
          label={t('Müşteri')}
          allLabel={t('Tüm müşteriler')}
          options={withAgreements.map((c) => ({ value: c.id, label: c.name }))}
          picked={pickedCustomers}
          onChange={setPickedCustomers}
        />
      </div>

      {loading ? (
        <p className="admin-hint">{t('Yükleniyor…')}</p>
      ) : shown.length === 0 ? (
        <p className="mybookings-empty">{t('Kayıtlı anlaşma yok.')}</p>
      ) : (
        <ul className="paks">
          {shown.map((a) => {
            const pack = packs.get(a.id) ?? null;
            // Lessons if it is a package, money otherwise: the bar always shows
            // how much of the thing has been used up.
            const done =
              pack && pack.sold > 0
                ? pack.used / pack.sold
                : a.agreedAmount > 0
                  ? a.received / a.agreedAmount
                  : 0;
            const detail = t(planLabel(a.kind, a.plan) ?? KIND_LABEL[a.kind]);
            const unit = planOf(a.kind, a.plan)?.unit;

            return (
              <li key={a.id} className={'pak' + (a.balance > 0 ? ' is-owing' : '')}>
                <button className="pak-open" onClick={() => setOpen(a)}>
                  <span className="avatar" aria-hidden="true">
                    {initials(a.customerName)}
                  </span>
                  <span className="pak-lines">
                    <span className="pak-name">{a.customerName}</span>
                    <span className="pak-sub">
                      {detail}
                      {a.units !== null && unit ? ' · ' + a.units + ' ' + t(UNIT_LABEL[unit]) : ''}
                      {a.equipmentLevel ? ' · ' + EQUIPMENT_LABEL[a.equipmentLevel] : ''}
                      {a.label ? ' · ' + a.label : ''}
                      {pack ? ' · ' + pack.used + ' ' + t('ders kullanıldı') : ''}
                      {a.kind === 'kids_camp' && a.campDays !== null
                        ? ' · ' + a.campDays + ' ' + t('gün geldi')
                        : ''}
                    </span>
                    <span className="pakbar" aria-hidden="true">
                      <span
                        className="pakbar-fill"
                        style={{ width: Math.min(100, Math.max(2, done * 100)) + '%' }}
                      />
                    </span>
                    <span className="pak-foot">
                      {pack ? (
                        <strong className={pack.remaining > 0 ? 'left' : 'cell-dim'}>
                          {pack.remaining} {t('ders kaldı')}
                        </strong>
                      ) : (
                        <span className="cell-dim">
                          {t('Tahsil edilen')}: {formatMoney(a.received)}
                        </span>
                      )}
                      <span className={a.balance > 0 ? 'owing' : 'paid'}>
                        {a.balance > 0 ? t('Bakiye') + ': ' + formatMoney(a.balance) : t('Ödendi')}
                      </span>
                    </span>
                  </span>
                </button>

                <span className="row-actions">
                  <button
                    className="btn btn--small"
                    onClick={() => setPaying(a)}
                    disabled={busyId === a.id}
                  >
                    {t('Ödeme')}
                  </button>
                  <button className="link-btn" onClick={() => setOpenCustomerId(a.customerId)}>
                    {t('Müşteri kartı')}
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <p className="admin-hint">
        {t(
          'Bakiyeyi sıfırlamak, kalan tutarı silindi olarak kaydeder — tahsil edilen toplamına eklenmez.',
        )}
      </p>

      {adding && (
        <AgreementForm
          customers={customers}
          plans={PLANS}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            void load();
            onChanged();
          }}
        />
      )}

      {paying && (
        <PaymentDialog
          agreement={paying}
          onClose={() => setPaying(null)}
          onChanged={() => {
            void load();
            onChanged();
          }}
        />
      )}

      {open && (
        <AgreementDetail
          agreement={open}
          pack={packs.get(open.id) ?? null}
          onClose={() => setOpen(null)}
          onPay={() => {
            setPaying(open);
            setOpen(null);
          }}
          onSettle={() => {
            const a = open;
            setOpen(null);
            void settle(a);
          }}
          onDelete={() => {
            const a = open;
            setOpen(null);
            void remove(a);
          }}
          onOpenCustomer={() => {
            setOpenCustomerId(open.customerId);
            setOpen(null);
          }}
        />
      )}

      {openCustomer && (
        <CustomerDrawer
          customer={openCustomer}
          onClose={() => setOpenCustomerId(null)}
          onChanged={() => {
            void load();
            onChanged();
          }}
        />
      )}
    </section>
  );
}
