/**
 * The address bar, as the app's state.
 *
 * There is no router in this project and adding one for three screens would be
 * a dependency to feed for years. This is the whole thing instead: a path is
 * turned into what to render, and what is rendered is written back with the
 * History API. That is enough for the two things people actually want — the
 * back button, and a refresh that stays where it was.
 *
 * Unknown paths return null, which means "not one of ours": Neon's auth UI
 * navigates to /auth/… and must be left alone.
 */
export type AdminPage =
  | 'dashboard'
  | 'staff'
  | 'bookings'
  | 'payments'
  | 'customers'
  | 'camp-registrations'
  | 'camp-attendance'
  | 'accounts'
  | 'guide'
  | 'changelog';

export type Route =
  | { screen: 'calendar' }
  | { screen: 'mine' }
  | { screen: 'admin'; page: AdminPage };

/** Turkish, because the people reading the address bar are Turkish. */
const ADMIN_SLUG: Record<AdminPage, string> = {
  dashboard: '',
  staff: 'hocalar',
  bookings: 'rezervasyonlar',
  payments: 'odemeler',
  customers: 'musteriler',
  'camp-registrations': 'kamp-kayitlari',
  'camp-attendance': 'kamp-yoklama',
  accounts: 'hesaplar',
  guide: 'kilavuz',
  changelog: 'degisiklik-kaydi',
};

const ADMIN_ROOT = 'yonetim';
const MINE = 'derslerim';

export function routeToPath(route: Route): string {
  if (route.screen === 'mine') return `/${MINE}`;
  if (route.screen === 'calendar') return '/';
  const slug = ADMIN_SLUG[route.page];
  return slug ? `/${ADMIN_ROOT}/${slug}` : `/${ADMIN_ROOT}`;
}

export function routeFromPath(pathname: string): Route | null {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return { screen: 'calendar' };
  if (parts[0] === MINE) return { screen: 'mine' };
  if (parts[0] !== ADMIN_ROOT) return null;

  const slug = parts[1] ?? '';
  const page = (Object.keys(ADMIN_SLUG) as AdminPage[]).find((p) => ADMIN_SLUG[p] === slug);
  return { screen: 'admin', page: page ?? 'dashboard' };
}
