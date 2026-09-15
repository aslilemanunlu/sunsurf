/**
 * Plants the starter instructors into Neon.
 *
 *   npm run seed
 *
 * Needs DATABASE_URL in .env (the ordinary Postgres connection string, not the
 * Data API URL).
 *
 * There is nothing else to seed: availability is not stored. Every instructor is
 * available 08:00-20:00 every day, and an hour only becomes unavailable when a
 * booking exists for it or the instructor closes it.
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

}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
