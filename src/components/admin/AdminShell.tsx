import { useState } from 'react';
import { useT } from '../../lib/i18n';
import type { Instructor, Viewer } from '../../types';
import Dashboard from './Dashboard';
import CustomersPage from './CustomersPage';
import BookingsPage from './BookingsPage';
import KidsCampPage from './KidsCampPage';
import StaffPage from './StaffPage';
import AccountsPage from './AccountsPage';
import PaymentsPage from './PaymentsPage';

type Page = 'dashboard' | 'bookings' | 'customers' | 'payments' | 'kids' | 'staff' | 'accounts';

const NAV: { key: Page; label: string }[] = [
  { key: 'dashboard', label: 'Ana Sayfa' },
  { key: 'bookings', label: 'Rezervasyonlar' },
  { key: 'customers', label: 'Müşteriler' },
  { key: 'payments', label: 'Ödemeler' },
  { key: 'kids', label: 'Çocuk Kampı' },
  { key: 'staff', label: 'Hocalar' },
  { key: 'accounts', label: 'Hesaplar ve yetkiler' },
];

type Props = {
  viewer: Viewer;
  instructors: Instructor[];
  onBackToCalendar: () => void;
  onChanged: () => void;
};

export default function AdminShell({ viewer, instructors, onBackToCalendar, onChanged }: Props) {
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
                {t(n.label)}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="admin-content">
        {page === 'dashboard' && <Dashboard />}
        {page === 'bookings' && <BookingsPage instructors={instructors} onChanged={onChanged} />}
        {page === 'customers' && <CustomersPage onChanged={onChanged} />}
        {page === 'payments' && <PaymentsPage onChanged={onChanged} />}
        {page === 'kids' && <KidsCampPage onChanged={onChanged} />}
        {page === 'staff' && <StaffPage onChanged={onChanged} />}
        {page === 'accounts' && <AccountsPage viewer={viewer} onChanged={onChanged} />}
      </div>
    </div>
  );
}
