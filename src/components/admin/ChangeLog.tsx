import { useCallback, useEffect, useMemo, useState } from 'react';
import { locale, useT } from '../../lib/i18n';
import * as api from '../../api/client';
import { downloadCsv } from '../../lib/csv';
import MultiSelect from './MultiSelect';

const AREA_LABEL: Record<api.AuditArea, string> = {
  booking: 'Rezervasyon',
  camp: 'Çocuk kampı',
  package: 'Paket',
  payment: 'Ödeme',
  access: 'Hesap ve yetki',
  customer: 'Müşteri kaydı',
};

const AREA_TONE: Record<api.AuditArea, string> = {
  booking: 'individual',
  camp: 'kids',
  package: 'group',
  payment: 'group',
  access: 'individual',
  customer: 'kids',
};

const ACTION_LABEL: Record<api.AuditEntry['action'], string> = {
  create: 'eklendi',
  update: 'değiştirildi',
  cancel: 'iptal edildi',
  delete: 'silindi',
};

const DAYS = [7, 30, 90];

/**
 * Who did what, for the yönetici.
 *
 * The rows come from triggers, not from the app: anything the browser is
 * trusted to write, the browser can also decline to write. Nothing older than
 * 90 days is here — the database deletes it, which is what was asked for, so
 * this is not a place to look up last season.
 */
export default function ChangeLog() {
  const { t } = useT();
  const [rows, setRows] = useState<api.AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(90);
  const [areas, setAreas] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.listAuditLog(days));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr');
    return rows.filter((r) => {
      if (areas.length > 0 && !areas.includes(r.area)) return false;
      if (!q) return true;
      return [r.subject, r.detail, r.actorEmail]
        .filter(Boolean)
        .some((x) => (x as string).toLocaleLowerCase('tr').includes(q));
    });
  }, [rows, areas, search]);

  /** Grouped by day, because that is how somebody retraces a mistake. */
  const byDay = useMemo(() => {
    const map = new Map<string, api.AuditEntry[]>();
    for (const r of shown) {
      const key = new Date(r.happenedAt).toLocaleDateString(locale(), {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return [...map.entries()];
  }, [shown]);

  function exportLog() {
    downloadCsv(
      `degisiklik-kaydi-${days}g`,
      [t('Tarih'), t('Kim'), t('Bölüm'), t('İşlem'), t('Konu'), t('Detay')],
      shown.map((r) => [
        new Date(r.happenedAt).toLocaleString(locale()),
        r.actorEmail ?? '',
        t(AREA_LABEL[r.area]),
        t(ACTION_LABEL[r.action]),
        r.subject ?? '',
        r.detail ?? '',
      ]),
    );
  }

  return (
    <section>
      <div className="admin-bar">
        <h2 className="admin-title">{t('Değişiklik kaydı')}</h2>
        <span className="admin-count">
          {shown.length} / {rows.length}
        </span>
        <button
          className="btn btn--ghost btn--small"
          onClick={exportLog}
          disabled={shown.length === 0}
        >
          {t('Excel’e aktar')}
        </button>
      </div>

      {error && <p className="dialog-error">{error}</p>}

      <div className="filters">
        <div className="segmented" role="group" aria-label={t('Dönem')}>
          {DAYS.map((d) => (
            <button
              key={d}
              className={`segment${days === d ? ' is-active' : ''}`}
              onClick={() => setDays(d)}
              aria-pressed={days === d}
            >
              {t('Son {n} gün').replace('{n}', String(d))}
            </button>
          ))}
        </div>

        <MultiSelect
          label={t('Bölüm')}
          allLabel={t('Tüm bölümler')}
          options={(Object.keys(AREA_LABEL) as api.AuditArea[]).map((a) => ({
            value: a,
            label: t(AREA_LABEL[a]),
          }))}
          picked={areas}
          onChange={setAreas}
        />

        <input
          className="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('İsim, e-posta veya detay ara')}
          aria-label={t('Ara')}
        />
      </div>

      {loading ? (
        <p className="admin-hint">{t('Yükleniyor…')}</p>
      ) : shown.length === 0 ? (
        <p className="mybookings-empty">{t('Bu aralıkta kayıt yok.')}</p>
      ) : (
        <div className="lessonlist">
          {byDay.map(([day, entries]) => (
            <section key={day} className="lessonlist-day">
              <h4 className="lessonlist-date">
                {day}
                <span className="cell-dim">
                  {' · '}
                  {entries.length} {t('kayıt')}
                </span>
              </h4>
              <ul>
                {entries.map((r) => (
                  <li key={r.id} className={`lessonlist-item is-${AREA_TONE[r.area]}`}>
                    <span className="lessonlist-time">
                      {new Date(r.happenedAt).toLocaleTimeString(locale(), {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <span className="lessonlist-who">
                      <strong>{r.subject ?? '—'}</strong>
                      <span className="cell-dim">{r.detail}</span>
                      <span className="cell-dim">{r.actorEmail ?? t('bilinmiyor')}</span>
                    </span>
                    <span className={`tag tag--${AREA_TONE[r.area]}`}>
                      {t(AREA_LABEL[r.area])} · {t(ACTION_LABEL[r.action])}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <p className="admin-hint">
        {t(
          '90 günden eski kayıtlar silinir. Kayıtları veritabanı yazar; uygulamadan değiştirilemez ve yalnızca yönetici görür.',
        )}
      </p>
    </section>
  );
}
