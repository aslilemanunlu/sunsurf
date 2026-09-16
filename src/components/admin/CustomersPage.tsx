import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CrmCustomer, Segment } from '../../types';
import { locale, useT } from '../../lib/i18n';
import * as api from '../../api/client';
import { SEGMENTS, SEGMENT_LABEL, segmentTone } from '../../lib/segments';
import CustomerDrawer from './CustomerDrawer';
import CustomerForm from './CustomerForm';

type Props = { onChanged: () => void };

/**
 * The customer list.
 *
 * These are records the school types in, not accounts: nobody in here can sign
 * in, and the only way a row appears is that somebody at the desk added it —
 * here, or from the booking dialog while writing a lesson.
 */
export default function CustomersPage({ onChanged }: Props) {
  const { t } = useT();
  const [rows, setRows] = useState<CrmCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [segment, setSegment] = useState<Segment | 'all' | 'none'>('all');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.listCrmCustomers());
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
    return rows.filter((c) => {
      if (segment === 'none' && c.segments.length > 0) return false;
      if (segment !== 'all' && segment !== 'none' && !c.segments.includes(segment)) return false;
      if (!q) return true;
      return (
        c.name.toLocaleLowerCase('tr').includes(q) ||
        (c.email ?? '').toLocaleLowerCase('tr').includes(q) ||
        (c.phone ?? '').includes(q)
      );
    });
  }, [rows, segment, search]);

  async function remove(c: CrmCustomer) {
    if (!window.confirm(t('{n} kaydı silinsin mi?').replace('{n}', c.name))) return;
    try {
      await api.deleteCustomer(c.customerId);
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const open = rows.find((c) => c.customerId === openId) ?? null;

  return (
    <section>
      <div className="admin-bar">
        <h2 className="admin-title">{t('Müşteriler')}</h2>
        <span className="admin-count">
          {shown.length} / {rows.length}
        </span>
        <button className="btn" onClick={() => setAdding(true)}>
          {t('Müşteri Ekle')}
        </button>
      </div>

      {error && <p className="dialog-error">{error}</p>}

      <div className="filters">
        <div className="segmented" role="group" aria-label={t('Segment')}>
          <button
            className={`segment${segment === 'all' ? ' is-active' : ''}`}
            onClick={() => setSegment('all')}
            aria-pressed={segment === 'all'}
          >
            {t('Tümü')}
          </button>
          {SEGMENTS.map((s) => (
            <button
              key={s}
              className={`segment${segment === s ? ' is-active' : ''}`}
              onClick={() => setSegment(s)}
              aria-pressed={segment === s}
            >
              {t(SEGMENT_LABEL[s])}
            </button>
          ))}
          <button
            className={`segment${segment === 'none' ? ' is-active' : ''}`}
            onClick={() => setSegment('none')}
            aria-pressed={segment === 'none'}
          >
            {t('Segmenti olmayan')}
          </button>
        </div>

        <input
          className="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('İsim, e-posta veya telefon ara')}
          aria-label={t('Ara')}
        />
      </div>

      {loading ? (
        <p className="admin-hint">{t('Yükleniyor…')}</p>
      ) : shown.length === 0 ? (
        <p className="mybookings-empty">{t('Bu filtreye uyan müşteri yok.')}</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('İsim')}</th>
                <th>{t('İletişim')}</th>
                <th>{t('Segment')}</th>
                <th>{t('Ders')}</th>
                <th>{t('Son ders')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.customerId}>
                  <td>
                    <button className="link-btn" onClick={() => setOpenId(c.customerId)}>
                      {c.name}
                    </button>
                    {c.notes > 0 && (
                      <span className="note-badge" title={t('Not var')}>
                        {c.notes}
                      </span>
                    )}
                  </td>
                  <td className="cell-dim">
                    {c.phone ?? '—'}
                    {c.email && <div>{c.email}</div>}
                  </td>
                  <td>
                    {c.segments.length === 0 ? (
                      <span className="cell-dim">—</span>
                    ) : (
                      <span className="chipset chipset--tight">
                        {c.segments.map((s) => {
                          const tone = segmentTone(s);
                          return (
                            <span
                              key={s}
                              className={`chip is-static${tone ? ` chip--${tone}` : ''}`}
                            >
                              {t(SEGMENT_LABEL[s])}
                            </span>
                          );
                        })}
                      </span>
                    )}
                  </td>
                  <td>
                    {c.lessons}
                    {c.hours > 0 && (
                      <span className="cell-dim">
                        {' '}
                        · {c.hours} {t('saat')}
                      </span>
                    )}
                  </td>
                  <td className="cell-dim">
                    {c.lastLessonAt ? new Date(c.lastLessonAt).toLocaleDateString(locale()) : '—'}
                  </td>
                  <td>
                    <button className="link-btn danger" onClick={() => remove(c)}>
                      {t('Sil')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {adding && (
        <CustomerForm
          customer={null}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            void load();
            onChanged();
          }}
        />
      )}

      {open && (
        <CustomerDrawer
          customer={open}
          onClose={() => setOpenId(null)}
          onChanged={() => {
            void load();
            onChanged();
          }}
        />
      )}
    </section>
  );
}
