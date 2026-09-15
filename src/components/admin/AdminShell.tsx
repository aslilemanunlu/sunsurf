import { useState } from 'react';
import { useT } from '../../lib/i18n';
import type { Instructor } from '../../types';
import Dashboard from './Dashboard';
import UsersPage from './UsersPage';
import BookingsPage from './BookingsPage';

type Page = 'dashboard' | 'users' | 'bookings';

const NAV: { key: Page; label: string; icon: string }[] = [
  { key: 'dashboard', label: 'Ana Sayfa', icon: '▦' },
  { key: 'users', label: 'Kullanıcılar', icon: '👥' },
  { key: 'bookings', label: 'Rezervasyonlar', icon: '📋' },
];

type Props = {
  instructors: Instructor[];
  onBackToCalendar: () => void;
  onChanged: () => void;
};

export default function AdminShell({ instructors, onBackToCalendar, onChanged }: Props) {
  const { t } = useT();
  const [page, setPage] = useState<Page>('dashboard');

  return (
    <div className="admin">
      <nav className="admin-nav" aria-label={t('Yönetim menüsü')}>
        <button className="link-btn admin-back" onClick={onBackToCalendar}>
          ← {t('Takvime dön')}
        </button>
        <ul>
          {NAV.map((n) => (
            <li key={n.key}>
              <button
                className={`admin-navitem${page === n.key ? ' is-active' : ''}`}
                onClick={() => setPage(n.key)}
                aria-current={page === n.key ? 'page' : undefined}
              >
                <span aria-hidden="true">{n.icon}</span>
                {t(n.label)}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="admin-content">
        {page === 'dashboard' && <Dashboard />}
        {page === 'users' && <UsersPage instructors={instructors} onChanged={onChanged} />}
        {page === 'bookings' && <BookingsPage instructors={instructors} onChanged={onChanged} />}
      </div>
    </div>
  );
}
