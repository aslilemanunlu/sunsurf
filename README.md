# Windfoil

A day-by-day booking app for windsurf and wingfoil classes with local instructors.

Backed by [Neon](https://neon.com): Postgres through the **Data API** (PostgREST over HTTPS) and
accounts through **Managed Better Auth**. There is no server of our own — the browser talks to Neon
directly, and Postgres row-level security decides who may read and write what.

Anyone can browse the schedule signed out. Booking and cancelling need an account.

There is no pricing anywhere, by design.

## Setup

### 1. Neon

1. Create a project at [pg.new](https://pg.new).
2. **Auth** → *Enable Neon Auth*. Copy the **Auth Base URL**.
3. **Postgres database → Data API** → point JWT auth at Managed Better Auth, then *Enable Data API*.
   Copy the **Data API URL** (it ends in `/rest/v1`).
4. Copy the ordinary Postgres **connection string** from the project dashboard.

### 2. Environment

```bash
cp .env.example .env
```

Fill in the three values. `DATABASE_URL` has no `VITE_` prefix on purpose — that prefix is what
lets Vite put a value in the browser bundle, and the connection string must never go there.

### 3. Schema and data

```bash
npm install
npm run migrate   # applies db/*.sql in order
npm run seed      # the starter instructors
```

Run these *after* enabling Auth and the Data API, since the SQL depends on the `anonymous` and
`authenticated` roles and the `auth.user_id()` function they provide. You can paste the files into
the Neon SQL Editor instead if you prefer.

Both scripts are safe to re-run and **never overwrite your edits**: every insert is
`on conflict do nothing`, so renamed instructors and existing bookings are left alone.

### 3b. Refresh the Data API schema cache — required after any migration

The Data API caches the schema, so new tables and views return
`PGRST205 Could not find the table … in the schema cache` until it is refreshed. There is no SQL
way to trigger it (`NOTIFY pgrst` is not honoured). Do one of:

- **Console** → Postgres database → Data API → Advanced settings → **Save**
- **CLI** → `neon data-api refresh-schema --database neondb`
- **API** → `PATCH` the Data API config with an empty body

### 4. Run

```bash
npm run dev
```

http://localhost:5173. `npm run build` typechecks and builds to `dist/`.

## Deploying

The app is a static bundle — Neon holds the data and runs the auth, so there is no server to host.

The two `VITE_` variables are **baked into the bundle at build time**, so they must exist on the host
*before* it builds. That is fine: both are public endpoints, protected by the JWT and the RLS
policies, not by being secret. `DATABASE_URL` is the opposite — it is a live credential, it is only
used by the local seed and migrate scripts, and it must never be added to the host.

### Vercel

`vercel.json` is already set up (build command, output directory, and an SPA fallback rewrite).

```bash
npx vercel            # first run links the project and asks you to log in
npx vercel --prod
```

In the Vercel dashboard, under Settings → Environment Variables, add `VITE_NEON_AUTH_URL` and
`VITE_NEON_DATA_API_URL` for every environment you build, then redeploy so the values are compiled in.

### Netlify instead

Delete `vercel.json` and add a `netlify.toml`:

```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### Then, in Neon — required

Add the deployed origin under **Auth → Configuration → Domains**, with the protocol and no trailing
slash (`https://windfoil.vercel.app`). Without it, auth redirects and email verification links fail
on the live site. For preview deployments add a wildcard such as `https://*-yourname.vercel.app`.

Localhost is allowlisted by default, which is why `npm run dev` needs no domain configuration.

Before opening it to real users, walk Neon's [auth production checklist](https://neon.com/docs/auth/production-checklist):
the shared email sender is rate-limited and should be replaced with your own SMTP, email
verification is off by default, and there is a "Allow Localhost" toggle worth turning off once you
no longer need it.

## What it does

- **One day at a time.** Arrows, a 7-day strip, and a jump back to today. No week or month view.
- **Every instructor is a column**, every hour from 07:00 to 21:00 is a row.
- **Availability is not stored.** Each instructor is open 08:00–20:00 every day. An hour is
  unavailable only because a booking exists for it, or because the instructor closed it.
- **Booking** a free hour takes one click; if the instructor teaches both sports you pick which.
  One booking per instructor per hour.
- **Roles**: `admin`, `instructor`, `customer`. Signing up makes you a customer. An admin promotes
  people from the Kullanıcılar panel and links an instructor account to an instructor row.
- **Instructors** see only their own column, can close an hour and reopen it, and see who booked.

The interface is in Turkish.

## Structure

```
db/*.sql              tables, views, grants, RLS policies — applied in order
scripts/migrate.mjs   applies db/*.sql (npm run migrate)
scripts/seed.mjs      the starter instructors (npm run seed) — nothing else to seed
src/
  types.ts            Sport, Role, Instructor, Viewer, Booking, Block
  lib/date.ts         local-date helpers (YYYY-MM-DD keys, Turkish formatting)
  lib/hours.ts        the working-hours rules the whole calendar derives from
  neon.ts             the Neon client — auth + Data API, anonymous reads allowed
  api/client.ts       ← all data access goes through here
  components/         DayNav, SportFilter, DayCalendar, BookingDialog, MyBookings, AdminPanel
  App.tsx             state + wiring
```

## How the security works

Authorisation lives in the database, not in the client.

| table | select | insert / delete |
| --- | --- | --- |
| `instructors` | everyone, signed out included | nobody |
| `instructor_blocks` | everyone — customers must see closed hours | only `instructor_id = my_instructor_id()` |
| `bookings` | only the owner | only as yourself |
| `user_roles` | your own row, or everything if admin | admin only |

`bookings.user_id` and `user_roles` are never sent by the client: `user_id` defaults to
`auth.user_id()`, which comes from the JWT. An instructor cannot touch another instructor's calendar
because `my_instructor_id()` also derives from the JWT, so it cannot be spoofed.

Three `security definer` views expose exactly as much as each caller needs and no more:

- **`busy_hours`** — which hours are taken, across all instructors, *without* saying by whom. Booking
  rows stay private to their owner, so this is how the calendar can grey out a taken hour.
- **`instructor_bookings`** — an instructor's own bookings with the customer's name and email.
  Returns nothing for anyone who is not that instructor.
- **`admin_users`** — the user directory, empty unless `app_role() = 'admin'`. Lets the admin panel
  work without granting anyone access to the `neon_auth` schema.

**Roles are deliberately not stored in `neon_auth."user".role`.** That column exists, but the Data
API switches to a Postgres role named by the JWT's `role` claim — writing `admin` there could try to
`SET ROLE admin`, which does not exist, and lock the account out. App roles live in `user_roles` and
the `neon_auth` schema is never written to.

## Notes and limits

- Managed Better Auth and `@neondatabase/auth-ui` are both **beta** at the time of writing.
- `bookings.user_id` is `text`, because that is what `auth.user_id()` returns from the JWT, while
  `neon_auth."user".id` is a `uuid`. So there is no foreign key between them and joins need
  `u.id::text = b.user_id`. Deleting a user therefore leaves their bookings behind.
- Neon's auth UI ships a Tailwind preflight that resets headings and lists page-wide. `styles.css`
  is imported after it and restores what the app assumes — keep that import order.
- The auth UI navigates between its screens by URL. This app has no routes, so `App.tsx` passes the
  provider a `navigate` and `Link` that map those hrefs to a view name and keep it in the dialog.
- Every migration needs a Data API schema-cache refresh (step 3b) before the app can see the new
  tables and views.
- Hours are stored as `timestamptz` and rendered in the browser's timezone. Everyone involved being
  in the same timezone is an assumption, not something the schema enforces.
- Capacity is one person per instructor per hour, enforced by `unique (instructor_id, starts_at)`.
- Closing an hour and booking it are independent: an instructor can close an hour that is already
  booked, and it does not cancel the booking.
- Still out of scope: multi-hour lessons, waitlists, payments, weather.
