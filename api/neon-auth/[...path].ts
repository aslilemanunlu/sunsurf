/**
 * Forwards auth requests to Neon, so the session cookie comes from this site.
 *
 * Why this exists: Neon's auth server lives on its own domain, so the cookie it
 * sets is a third-party cookie for this site — and Safari discards those.
 * Signing in then succeeds on the server while the browser keeps nothing, which
 * looks exactly like a wrong password.
 *
 * Why it is a function and not a `vercel.json` rewrite: a rewrite forwards the
 * browser's `Host` header, and Neon answers `{"error":"Invalid hostname
 * header"}`. The Host has to be the one Neon expects, and a rewrite cannot
 * change it. This can.
 *
 * It also strips `Domain=` from anything Neon sets, so the cookie binds to
 * whatever host this is deployed on rather than to Neon's. That is the whole
 * point of the exercise — without it the browser would reject the cookie again,
 * for the same reason as before.
 */
export const config = { runtime: 'edge' };

const UPSTREAM = process.env.VITE_NEON_AUTH_URL ?? process.env.NEON_AUTH_URL ?? '';

/** Hop-by-hop headers, and the ones the upstream must set for itself. */
const DROP = new Set([
  'host',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'content-length',
  'x-forwarded-host',
  'x-vercel-id',
  'x-vercel-forwarded-for',
]);

/**
 * `Domain=neon…` would send the browser back to rejecting the cookie, so it
 * goes. Everything else — Path, Secure, HttpOnly, SameSite, Max-Age — is left
 * exactly as Neon wrote it.
 */
function unpinDomain(cookie: string): string {
  return cookie
    .split(';')
    .filter((part) => !/^\s*domain=/i.test(part))
    .join(';');
}

export default async function handler(request: Request): Promise<Response> {
  if (!UPSTREAM) {
    return new Response(JSON.stringify({ error: 'VITE_NEON_AUTH_URL is not set' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }

  const incoming = new URL(request.url);
  const suffix = incoming.pathname.replace(/^\/(api\/)?neon-auth/, '');
  const target = new URL(UPSTREAM.replace(/\/$/, '') + suffix + incoming.search);

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!DROP.has(key.toLowerCase())) headers.set(key, value);
  });
  // Neon checks this, which is the reason a plain rewrite fails.
  headers.set('host', target.host);

  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    redirect: 'manual',
    // @ts-expect-error - undici needs this to stream a request body
    duplex: 'half',
  });

  const out = new Headers(upstream.headers);
  out.delete('set-cookie');
  const cookies =
    typeof upstream.headers.getSetCookie === 'function'
      ? upstream.headers.getSetCookie()
      : [upstream.headers.get('set-cookie')].filter((c): c is string => c !== null);
  for (const cookie of cookies) out.append('set-cookie', unpinDomain(cookie));

  return new Response(upstream.body, { status: upstream.status, headers: out });
}
