import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Agreement, AgreementKind, CustomerRef } from '../../types';
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
import PaymentDialog from './PaymentDialog';

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
  const [kind, setKind] = useState<AgreementKind | 'all'>('all');
  const [onlyOwing, setOnlyOwing] = useState(false);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState<Agreement | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, people] = await Promise.all([api.listAgreements(), api.listCustomers()]);
      setRows(list);
      setCustomers(people);
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

  const shown = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr');
    return rows.filter((a) => {
      if (kind !== 'all' && a.kind !== kind) return false;
      if (onlyOwing && a.balance <= 0) return false;
      if (!q) return true;
      return (
        a.customerName.toLocaleLowerCase('tr').includes(q) ||
        (a.label ?? '').toLocaleLowerCase('tr').includes(q) ||
        (a.customerPhone ?? '').includes(q)
      );
    });
  }, [rows, kind, onlyOwing, search]);

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
    const question = t('{n} kalan bakiye sıfırlansın mı? Bu tutar tahsilat olarak sayılmaz.').replace(
      '{n}',
      formatMoney(a.balance),
    );
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

  return (
    <section>
      <div className="admin-bar">
        <h2 className="admin-title">{t('Ödemeler')}</h2>
        <span className="admin-count">
          {shown.length} / {rows.length}
        </span>
        <button className="btn" onClick={() => setAdding(true)}>
          {t('Anlaşma Ekle')}
        </button>
      </div>

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
        <div className="segmented" role="group" aria-label={t('Türe göre filtrele')}>
          <button
            className={`segment${kind === 'all' ? ' is-active' : ''}`}
            onClick={() => setKind('all')}
            aria-pressed={kind === 'all'}
          >
            {t('Tümü')}
          </button>
          {KINDS.map((k) => (
            <button
              key={k}
              className={`segment${kind === k ? ' is-active' : ''}`}
              onClick={() => setKind(k)}
              aria-pressed={kind === k}
            >
              {t(KIND_LABEL[k])}
            </button>
          ))}
        </div>

        <label className="check check--inline">
          <input
            type="checkbox"
            checked={onlyOwing}
            onChange={(e) => setOnlyOwing(e.target.checked)}
          />
          {t('Sadece borcu olanlar')}
        </label>

        <input
          className="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('Müşteri ara')}
          aria-label={t('Ara')}
        />
      </div>

      {loading ? (
        <p className="admin-hint">{t('Yükleniyor…')}</p>
      ) : shown.length === 0 ? (
        <p className="mybookings-empty">{t('Kayıtlı anlaşma yok.')}</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('Müşteri')}</th>
                <th>{t('Tür')}</th>
                <th>{t('Detay')}</th>
                <th className="num">{t('Anlaşılan')}</th>
                <th className="num">{t('Ödenen')}</th>
                <th className="num">{t('Kalan')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((a) => (
                <tr key={a.id} className={a.balance > 0 ? 'is-owing' : undefined}>
                  <td>
                    {a.customerName}
                    {a.customerPhone && <div className="cell-dim">{a.customerPhone}</div>}
                  </td>
                  <td>
                    <span
                      className={`tag tag--${
                        a.kind === 'kids_camp' ? 'kids' : a.kind === 'rental' ? 'group' : 'individual'
                      }`}
                    >
                      {t(KIND_LABEL[a.kind])}
                    </span>
                  </td>
                  <td>
                    {t(planLabel(a.kind, a.plan) ?? '—')}
                    {a.units !== null && (
                      <>
                        {' · '}
                        {a.units}
                        {planOf(a.kind, a.plan)?.unit
                          ? ` ${t(UNIT_LABEL[planOf(a.kind, a.plan)!.unit!])}`
                          : ''}
                      </>
                    )}
                    {a.equipmentLevel && (
                      <div className="cell-dim">{EQUIPMENT_LABEL[a.equipmentLevel]}</div>
                    )}
                    {a.label && <div className="cell-dim">{a.label}</div>}
                    {a.kind === 'kids_camp' && a.campDays !== null && (
                      <div className="cell-dim">
                        {a.campDays} {t('gün geldi')}
                      </div>
                    )}
                    {a.writtenOff > 0 && (
                      <div className="cell-dim">
                        {t('Silinen')}: {formatMoney(a.writtenOff)}
                      </div>
                    )}
                  </td>
                  <td className="num">{formatMoney(a.agreedAmount)}</td>
                  <td className="num">{formatMoney(a.received)}</td>
                  <td className={`num${a.balance > 0 ? ' owing' : ''}`}>
                    {formatMoney(a.balance)}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="btn btn--small"
                        onClick={() => setPaying(a)}
                        disabled={busyId === a.id}
                      >
                        {t('Ödeme')}
                      </button>
                      {a.balance > 0 && (
                        <button
                          className="link-btn"
                          onClick={() => settle(a)}
                          disabled={busyId === a.id}
                        >
                          {t('Bakiyeyi 0’la')}
                        </button>
                      )}
                      <button
                        className="link-btn danger"
                        onClick={() => remove(a)}
                        disabled={busyId === a.id}
                      >
                        {t('Sil')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
    </section>
  );
}
