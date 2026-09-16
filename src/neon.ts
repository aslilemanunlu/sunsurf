import { createClient } from '@neondatabase/neon-js';
import { BetterAuthReactAdapter } from '@neondatabase/neon-js/auth/react/adapters';

/**
 * Neon's auth server lives on its own domain, so the session cookie it sets is
 * a third-party cookie for this site — and Safari throws those away. Signing in
 * then succeeds on the server while the browser keeps nothing, which looks
 * exactly like a wrong password.
 *
 * Setting VITE_NEON_AUTH_PROXY_PATH (say `/neon-auth`) points the client at
 * this origin instead; `vercel.json` forwards that path to Neon. The cookie
 * then comes back from our own domain and is nobody's third party.
 *
 * Left unset, everything behaves as before — which is the point: if the proxy
 * misbehaves, clearing one variable puts it back.
 */
const proxyPath = import.meta.env.VITE_NEON_AUTH_PROXY_PATH as string | undefined;

/**
 * DISABLED while the proxy is not actually being served.
 *
 * Setting the variable pointed the client at a path Vercel answers with
 * index.html, which broke signing in completely — worse than the Safari problem
 * it was meant to solve. Until a request to the proxy is shown to reach Neon,
 * the direct URL is the only one used, whatever the variable says.
 */
const PROXY_READY = false;

const authUrl =
  PROXY_READY && proxyPath
    ? new URL(proxyPath, window.location.origin).toString().replace(/\/$/, '')
    : import.meta.env.VITE_NEON_AUTH_URL;

const dataApiUrl = import.meta.env.VITE_NEON_DATA_API_URL;

/** False until .env is filled in; `main.tsx` shows setup instructions instead of the app. */
export const isConfigured = Boolean(import.meta.env.VITE_NEON_AUTH_URL && dataApiUrl);

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
