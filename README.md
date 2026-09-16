# Sun Surf Alaçatı

The tool a windsurf and wingfoil school is run from: a day-by-day calendar, the customer records
behind it, and what everybody owes.

Backed by [Neon](https://neon.com): Postgres through the **Data API** (PostgREST over HTTPS) and
accounts through **Managed Better Auth**. There is no server of our own — the browser talks to Neon
directly, and Postgres row-level security decides who may read and write what.

**Nobody outside the school books anything.** The schedule is public and readable by anyone,
signed out included, but it is a thing to look at: lessons are written by staff. A customer is a
record somebody at the desk typed in — no password, no login, no way into the system.

Only instructors and admins sign in. A new account can do nothing at all until an admin gives it a
role.

The interface is in Turkish and English, switchable in the header.

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

**The calendar** — public, read-only

- **One day at a time.** Arrows, a 7-day strip, and a jump back to today. No week or month view.
- **Every instructor is a column**, every hour from 07:00 to 21:00 is a row.
- **Availability is not stored.** Each instructor is open 08:00–20:00 every day. An hour is
  unavailable only because a booking exists for it, or because staff closed it.
- A visitor sees the state of an hour and nothing else: free, booked, blocked, past — and kids
  camp, because that is the thing people ring up about. No name, no sport, no head count: the
  public view does not carry them at all.

**The calendar** — signed in as staff

- An **admin** sees every instructor's column with who each lesson is for; an **instructor** sees
  their own column and nobody else's.
- Click an hour to write a lesson, open a kids camp, block it, or delete what is there.
- **Drag down a column** to write a lesson across several hours at once. Mouse and pen only — on a
  phone that gesture scrolls the grid, and taking it over would make the calendar unusable there.
- **Repeat** a lesson daily, on weekdays, or weekly. Hours already taken are skipped and you are
  told how many landed.
- **Leave** closes a date range for an instructor in one go. Lessons already in the range are
  counted and left alone: closing an hour and cancelling a lesson are different decisions.

**Management**

- **Dashboard** — the business totals plus charts over a date range: hours per instructor, lessons
  over time, lesson-type mix, and a per-instructor table.
- **Bookings** — status, instructor and date filters.
- **Customers** — the CRM. Name is the only required field; the rest (phone, birth date, how they
  found us, injuries, allergies, two emergency contacts, a guardian for a child) is optional and
  filled in when there is time. Plus staff-only notes and the whole lesson history.
- **Payments** — one list for everything sold. A lesson pack, a month of storage and a week's
  rental are the same question (agreed, paid, left) and one customer can hold all three.
- **Kids camp** — one row per child with the guardian's number and any allergy, and the camp
  bookings behind it.
- **Instructors** — instructor records, which accounts are linked to them, a monthly worked-hours
  breakdown down to the day, and who has which role.

**Lesson packages.** An agreement can be worth a number of lessons. When a lesson is written, staff
pick which package it comes off — **one booking spends one lesson, however many hours it runs**.
Nothing counts "used" into a column: it is the number of bookings pointing at the package, so
cancelling a lesson gives it straight back.

**Clearing a balance is a record, not a flag.** It writes the remainder as a `writeoff` payment, so
the account closes without the money ever being counted as collected.

**Segments** (`lesson`, `storage`, `rental`, `kids_camp`) are how the office classifies a customer.
Staff are asked at the moment a record is created — the lesson being written is the first guess.

**Roles**: `admin`, `instructor`, `customer`. `customer` is what an account has before anybody has
given it a job: it can read the public schedule and nothing else. An admin sets roles and links an
instructor account to an instructor profile from the Instructors page.

## Structure

```
db/*.sql              tables, views, grants, RLS policies — applied in order
scripts/migrate.mjs   applies db/*.sql (npm run migrate)
scripts/seed.mjs      the starter instructors (npm run seed) — nothing else to seed
src/
  types.ts            the shapes every screen shares
  lib/date.ts         local-date helpers (YYYY-MM-DD keys, locale-aware formatting)
  lib/hours.ts        working hours, repeat dates, how long a lesson may run
  lib/lessons.ts      how a lesson is described and coloured
  lib/segments.ts     the CRM vocabulary
  lib/agreements.ts   what is sold, and money formatting
  lib/i18n.tsx        Turkish/English, keyed by the Turkish sentence
  neon.ts             the Neon client — auth + Data API, anonymous reads allowed
  api/client.ts       ← all data access goes through here
  components/         calendar, booking dialog, leave, account menu
  components/admin/   dashboard and charts, bookings, customers, payments,
                      kids camp, instructors
  App.tsx             state + wiring
```

## How the security works

Authorisation lives in the database, not in the client.

| table | select | insert / update / delete |
| --- | --- | --- |
| `instructors` | name, sports and bio to everyone; email and phone to nobody | admin |
| `instructor_blocks` | everyone — a closed hour must be visible on the public calendar | own calendar, or admin |
| `bookings` | own calendar, or everything if admin | own calendar, or admin anywhere |
| `customers` | admin | admin, and an instructor may add one to book them |
| `agreements`, `payments` | admin | admin |
| `user_roles` | your own row, or everything if admin | admin only |
| `customer_notes` | admin only | admin only |

`user_roles` is never written by the client. An instructor cannot touch another instructor's
calendar because `my_instructor_id()` derives from the session JWT and cannot be spoofed; the same
function is what makes `managed_bookings` return their own rows and nobody else's.

Triggers that run alongside the policies decide trust from `current_user` (the Postgres role), not
from whether a JWT could be read. An earlier version asked `auth.user_id()` and treated its failure
as "trusted", which made a guard inert for every caller that actually came through the API — a
mistake worth not repeating.

The guard that stopped an instructor rewriting a customer's booking while approving it is gone with
the customer: both parties to a booking are staff now, and an instructor rearranging their own day
is the job.

`security definer` views expose exactly as much as each caller needs and no more:

- **`busy_hours`** — which hours are taken, across all instructors, *without* saying by whom.
- **`instructor_bookings`** / **`managed_bookings`** — bookings with the customer's details,
  empty for anyone who is neither that instructor nor an admin.
- **`admin_users`**, **`crm_customers`**, **`instructor_admin`**, **`kids_camp_roll`** — the
  management screens, each empty unless `app_role() = 'admin'`. They let those screens work
  without granting anyone access to the `neon_auth` schema.

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
- A lesson may not overlap another on the same instructor's calendar. That is an exclusion
  constraint on `(instructor_id, span)` with `btree_gist`, not a unique key on the start hour —
  a lesson can run up to twelve. A rejected booking is exempt, so rejecting frees the hours.
- **A group lesson records a head count and one customer, not four names.** The other three are not
  in the system at all: no history, no balance, no packages. That is a deliberate choice, not an
  oversight — say so before anybody builds a report on "how many people came".
- `bookings.user_id` and `app_settings` are dead. They cannot be dropped because the migration
  files are re-run from the top every time and the earlier ones still mention them.
- Money is `numeric`, and balances are computed on read. A stored balance is a number that can
  disagree with the payments underneath it.
- Closing an hour and booking it are independent: an instructor can close an hour that is already
  booked, and it does not cancel the booking.
- Notes on a customer live in their own table rather than on the customer record. They were split
  out when customers could still sign in and read their own row; keeping them separate is still
  right, because "always late" is not something to hand back to anybody.
- Still out of scope: waitlists, payments, weather, notifications of any kind.
