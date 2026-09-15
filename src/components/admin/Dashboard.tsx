import { useEffect, useState } from 'react';
import { useT } from '../../lib/i18n';
import * as api from '../../api/client';
import { locale } from '../../lib/i18n';

type Card = {
  key: keyof api.DashboardStats;
  title: string;
  icon: string;
  tone: string;
  suffix?: string;
};

const CARDS: Card[] = [
  { key: 'users', title: 'Toplam Kullanıcı', icon: '👥', tone: 'accent' },
  { key: 'instructors', title: 'Toplam Hoca', icon: '🏄', tone: 'individual' },
  { key: 'students', title: 'Toplam Öğrenci', icon: '🎓', tone: 'group' },
  { key: 'bookings', title: 'Toplam Rezervasyon', icon: '📋', tone: 'kids' },
  { key: 'hoursThisMonth', title: 'Bu Ay Verilen Ders', icon: '⏱', tone: 'accent', suffix: 'saat' },
];

export default function Dashboard() {
  const { t } = useT();
  const [stats, setStats] = useState<api.DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getDashboardStats()
      .then((s) => !cancelled && setStats(s))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section>
      <h2 className="admin-title">{t('Ana Sayfa')}</h2>

      {error && <p className="dialog-error">{error}</p>}

      <div className="stat-grid">
        {CARDS.map((c) => (
          <article key={c.key} className={`stat stat--${c.tone}`}>
            <header className="stat-head">
              <span className="stat-title">{t(c.title)}</span>
              <span className="stat-icon" aria-hidden="true">
                {c.icon}
              </span>
            </header>
            <p className="stat-value">
              {stats ? stats[c.key].toLocaleString(locale()) : '—'}
              {c.suffix && stats ? <span className="stat-suffix"> {t(c.suffix)}</span> : null}
            </p>
          </article>
        ))}
      </div>

      <p className="admin-hint">
        {t(
          'Öğrenci sayısı, rolü eğitmen ya da yönetici olmayan kullanıcıları sayar. Bu ay verilen ders, bu ay başlayan onaylı rezervasyonların toplam saatidir.',
        )}
      </p>
    </section>
  );
}
