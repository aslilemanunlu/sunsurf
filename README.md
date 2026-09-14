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
npm run migrate   # applies db/*.sql
npm run seed      # instructors + classes for today ±14 days
```

`npm run migrate` applies [`db/001_init.sql`](db/001_init.sql): the three tables, the grants for the
`anonymous` and `authenticated` roles, and the RLS policies. Run it *after* enabling Auth and the
Data API, since it depends on the roles and the `auth.user_id()` function they provide. You can
paste the file into the Neon SQL Editor instead if you prefer.

Both scripts are safe to re-run and **never overwrite your edits**. Slot ids are derived from the
date and every insert is `on conflict do nothing`, so re-seeding extends the window forward while
leaving renamed instructors, edited classes and existing bookings alone.

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

- **One day at a time.** Arrows, a 7-day strip, and a "jump to today" link. No week or month view.
- **A calendar grid**: one column per instructor teaching that day, hours 7 AM–8 PM down the side.
  Each class is a block positioned and sized by its real start time and duration, labelled
  Available, ✓ Booked, or Past, with a colour bar marking the sport.
- **A class is** an instructor, a sport (windsurf or wingfoil), a start time, and a duration.
- **Filter** by sport — columns narrow to the instructors teaching it.
- **Book** a class by clicking its block. Signed out, the same dialog asks you to sign in first.
- **Your classes** lists everything you have upcoming; clicking one jumps the calendar to that day.
- Days with no classes show an empty state with a jump to the next day that has some.

## Structure

```
db/001_init.sql       tables, grants, RLS policies
scripts/migrate.mjs   applies db/*.sql (npm run migrate)
scripts/seed.mjs      instructors + a rolling window of classes (npm run seed)
src/
  types.ts            Sport, Instructor, Slot, Booking
  lib/date.ts         local-date helpers (YYYY-MM-DD keys, formatting)
  neon.ts             the Neon client — auth + Data API, anonymous reads allowed
  api/client.ts       ← all data access goes through here
  components/         DayNav, SportFilter, DayCalendar, BookingDialog, MyBookings
  App.tsx             state + wiring
```

## How the security works

Authorisation lives in the database, not in the client. Three policies in `db/001_init.sql`:

- `instructors` and `slots` are readable by both `anonymous` and `authenticated`.
- `bookings` is readable, insertable and deletable only where `auth.user_id() = user_id`.

`bookings.user_id` defaults to `auth.user_id()`, which comes from the JWT, so the client never sends
it and cannot book on anybody else's behalf. Cancelling someone else's booking simply deletes zero
rows. Since a booking is visible only to its owner, a slot can't show how many people are on it —
that's the thing to revisit when capacity arrives.

## Notes and limits

- Managed Better Auth and `@neondatabase/auth-ui` are both **beta** at the time of writing.
- `bookings.user_id` is `text`, because that is what `auth.user_id()` returns from the JWT, while
  `neon_auth."user".id` is a `uuid`. So there is no foreign key between them and joins need
  `u.id::text = b.user_id`. Deleting a user therefore leaves their bookings behind.
- Neon's auth UI ships a Tailwind preflight that resets headings and lists page-wide. `styles.css`
  is imported after it and restores what the app assumes — keep that import order.
- The auth UI navigates between its screens by URL. This app has no routes, so `App.tsx` passes the
  provider a `navigate` and `Link` that map those hrefs to a view name and keep it in the dialog.
- The seed script writes times in the machine's local timezone and stores them as `timestamptz`.
  Seeding from a different timezone than you browse from will shift the schedule.
- Still out of scope: instructor-side scheduling, capacity and waitlists, payments, weather.
