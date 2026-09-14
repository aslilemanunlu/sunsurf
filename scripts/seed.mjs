/**
 * Plants instructors and a rolling window of classes into Neon.
 *
 *   npm run seed
 *
 * Needs DATABASE_URL in .env (the ordinary Postgres connection string, not the
 * Data API URL). Re-runnable: slot ids are derived from the date, and inserts
 * use ON CONFLICT DO NOTHING, so running it again extends the window forward
 * without disturbing existing bookings.
 *
 * Times are generated in this machine's local timezone and stored as
 * timestamptz, so the browser renders them back at the same wall-clock time.
 */
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

const INSTRUCTORS = [
  {
    id: 'ins-mira',
    name: 'Mira Kovač',
    sports: ['windsurf', 'wingfoil'],
    bio: 'Former freestyle competitor. Patient with first-timers.',
  },
  {
    id: 'ins-tobias',
    name: 'Tobias Lund',
    sports: ['wingfoil'],
    bio: 'Foiling specialist. Light-wind sessions are his thing.',
  },
  {
    id: 'ins-ana',
    name: 'Ana Ferreira',
    sports: ['windsurf'],
    bio: 'Teaches waterstart and jibe clinics on the north beach.',
  },
  {
    id: 'ins-yusuf',
    name: 'Yusuf Demir',
    sports: ['windsurf', 'wingfoil'],
    bio: 'Twenty seasons on the bay. Calm, methodical coaching.',
  },
  {
    id: 'ins-nina',
    name: 'Nina Olsen',
    sports: ['wingfoil'],
    bio: 'Runs small-group progression sessions all summer.',
  },
];

const DAYS_BACK = 14;
const DAYS_AHEAD = 14;
const BLANK_DAY_MODULUS = 6; // roughly one day in six has no classes at all
const START_HOURS = [8, 9, 10, 11, 14, 15, 16, 17];
const DURATIONS = [60, 90, 120];

/** Tiny deterministic hash so a given day always produces the same schedule. */
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function slotsForDay(key) {
  const seed = hash(key);
  if (seed % BLANK_DAY_MODULUS === 0) return [];

  const count = 2 + (seed % 4); // 2–5 classes
  const slots = [];
  const usedHours = new Set();

  for (let i = 0; i < count; i++) {
    const n = hash(`${key}:${i}`);
    let hour = START_HOURS[n % START_HOURS.length];
    while (usedHours.has(hour)) {
      hour = START_HOURS[(START_HOURS.indexOf(hour) + 1) % START_HOURS.length];
    }
    usedHours.add(hour);

    const instructor = INSTRUCTORS[(n >> 3) % INSTRUCTORS.length];
    const sport = instructor.sports[(n >> 7) % instructor.sports.length];
    const durationMin = DURATIONS[(n >> 11) % DURATIONS.length];

    const start = new Date(`${key}T00:00:00`);
    start.setHours(hour, (n >> 13) % 2 === 0 ? 0 : 30, 0, 0);

    slots.push({
      id: `slot-${key}-${hour}`,
      instructorId: instructor.id,
      sport,
      startsAt: start.toISOString(),
      durationMin,
    });
  }

  return slots;
}

async function main() {
  // DO NOTHING, not DO UPDATE: these are starter names, and once you've edited
  // an instructor in the database, re-seeding must not overwrite your edit.
  let newInstructors = 0;
  for (const i of INSTRUCTORS) {
    const rows = await sql`
      insert into instructors (id, name, sports, bio)
      values (${i.id}, ${i.name}, ${i.sports}, ${i.bio})
      on conflict (id) do nothing
      returning id
    `;
    newInstructors += rows.length;
  }
  const [{ total }] = await sql`select count(*)::int as total from instructors`;
  console.log(`instructors: ${newInstructors} new, ${total} total (existing rows left untouched)`);

  const today = new Date();
  let planted = 0;

  for (let offset = -DAYS_BACK; offset <= DAYS_AHEAD; offset++) {
    const day = new Date(today);
    day.setDate(day.getDate() + offset);

    for (const slot of slotsForDay(dateKey(day))) {
      const rows = await sql`
        insert into slots (id, instructor_id, sport, starts_at, duration_min)
        values (${slot.id}, ${slot.instructorId}, ${slot.sport}, ${slot.startsAt}, ${slot.durationMin})
        on conflict (id) do nothing
        returning id
      `;
      planted += rows.length;
    }
  }

  const [{ count }] = await sql`select count(*)::int as count from slots`;
  console.log(`slots: ${planted} new, ${count} total`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
