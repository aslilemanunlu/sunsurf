import { createClient } from '@neondatabase/neon-js';
import { BetterAuthReactAdapter } from '@neondatabase/neon-js/auth/react/adapters';

const authUrl = import.meta.env.VITE_NEON_AUTH_URL;
const dataApiUrl = import.meta.env.VITE_NEON_DATA_API_URL;

/** False until .env is filled in; `main.tsx` shows setup instructions instead of the app. */
export const isConfigured = Boolean(authUrl && dataApiUrl);

/**
 * One client for both halves of Neon: Managed Better Auth for sessions, and the
 * Data API for Postgres over HTTPS. Data API requests carry the session JWT
 * automatically, and the database's RLS policies do the authorisation.
 *
 * `allowAnonymous` is what lets signed-out visitors browse the calendar — without
 * it the client refuses to make a request until there is a session.
 *
 * Null when unconfigured. Nothing that touches it renders in that case.
 */
export const neon = isConfigured
  ? createClient({
      auth: {
        url: authUrl,
        adapter: BetterAuthReactAdapter(),
        allowAnonymous: true,
      },
      dataApi: { url: dataApiUrl },
    })
  : (null as unknown as ReturnType<typeof createClient>);

export const auth = isConfigured ? neon.auth : (null as unknown as (typeof neon)['auth']);
