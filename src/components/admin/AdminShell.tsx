import { useState } from 'react';
import type { AdminPage } from '../../lib/route';
import { useT } from '../../lib/i18n';
import type { Instructor, Viewer } from '../../types';
import Dashboard from './Dashboard';
import CustomersPage from './CustomersPage';
import BookingsPage from './BookingsPage';
import KidsCampPage from './KidsCampPage';
import CampAttendancePage from './CampAttendancePage';
import StaffPage from './StaffPage';
import AccountsPage from './AccountsPage';
import PaymentsPage from './PaymentsPage';
import Guide from './Guide';
import ChangeLog from './ChangeLog';

/** The pages, and the paths that name them, live in lib/route. */
type Page = AdminPage;

type Item = {
  key: Page;
  label: string;
  children?: { key: Page; label: string; ownerOnly?: boolean }[];
};

/**
 * The order is the working day: what happened, who is teaching, what is booked,
 * what is owed, who the customers are — then the camp, then the settings
 * nobody touches twice a season.
 */
const NAV: Item[] = [
  { key: 'dashboard', label: 'Ana Sayfa' },
  { key: 'staff', label: 'Hocalar' },
  { key: 'bookings', label: 'Rezervasyonlar' },
  { key: 'payments', label: 'Ödemeler / Paketler' },
  { key: 'customers', label: 'Müşteriler' },
  {
    key: 'camp-registrations',
    label: 'Çocuk Kampı',
    children: [
      { key: 'camp-registrations', label: 'Kayıtlar' },
      { key: 'camp-attendance', label: 'Yoklama' },
    ],
  },
  { key: 'accounts', label: 'Hesaplar ve yetkiler' },
  {
    key: 'guide',
    label: 'Kullanım kılavuzu',
    children: [
      { key: 'guide', label: 'Kılavuz' },
      { key: 'changelog', label: 'Değişiklik kaydı', ownerOnly: true },
    ],
  },
];

type Props = {
  viewer: Viewer;
  instructors: Instructor[];
  /** Which page, decided by the address bar rather than by this component. */
  page: Page;
  onPage: (page: Page) => void;
  onBackToCalendar: () => void;
  onChanged: () => void;
};

export default function AdminShell({
  viewer,
  instructors,
  page,
  onPage,
  onBackToCalendar,
  onChanged,
}: Props) {
  const { t } = useT();
  /**
   * The camp's two screens share one season: switching from the register to the
   * registrations should not land on a different summer.
   */
  const [season, setSeason] = useState(new Date().getFullYear());

  return (
    <div className="admin">
      <nav className="admin-nav" aria-label={t('Yönetim menüsü')}>
        <button className="link-btn admin-back" onClick={onBackToCalendar}>
          ← {t('Takvime dön')}
        </button>
        <ul>
          {NAV.map((n) => {
            const children = n.children?.filter((c) => !c.ownerOnly || viewer.isOwner) ?? [];
            const open =
              children.length > 0 ? children.some((c) => c.key === page) : page === n.key;
            return (
              <li key={n.label}>
                <button
                  className={`admin-navitem${open ? ' is-active' : ''}`}
                  onClick={() => onPage(n.key)}
                  aria-current={open ? 'page' : undefined}
                >
                  {t(n.label)}
                </button>

                {children.length > 0 && (
                  <ul className="admin-subnav">
                    {children.map((c) => (
                      <li key={c.key}>
                        <button
                          className={`admin-navitem admin-navitem--sub${
                            page === c.key ? ' is-active' : ''
                          }`}
                          onClick={() => onPage(c.key)}
                          aria-current={page === c.key ? 'page' : undefined}
                        >
                          {t(c.label)}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="admin-content">
        {page === 'dashboard' && <Dashboard />}
        {page === 'staff' && <StaffPage onChanged={onChanged} />}
        {page === 'bookings' && <BookingsPage instructors={instructors} onChanged={onChanged} />}
        {page === 'payments' && <PaymentsPage onChanged={onChanged} />}
        {page === 'customers' && <CustomersPage onChanged={onChanged} />}
        {page === 'camp-registrations' && (
          <KidsCampPage season={season} onSeason={setSeason} onChanged={onChanged} />
        )}
        {page === 'camp-attendance' && (
          <CampAttendancePage season={season} onSeason={setSeason} onChanged={onChanged} />
        )}
        {page === 'accounts' && <AccountsPage viewer={viewer} onChanged={onChanged} />}
        {page === 'guide' && <Guide viewer={viewer} />}
        {page === 'changelog' && viewer.isOwner && <ChangeLog />}
      </div>
    </div>
  );
}
