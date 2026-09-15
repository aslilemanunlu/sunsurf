/**
 * Applies the SQL files in db/ in filename order.
 *
 *   npm run migrate
 *
 * An alternative to pasting them into the Neon SQL Editor. Needs DATABASE_URL.
 * The files are written to be safe to re-run.
 */
import 'dotenv/config';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

/**
 * The HTTP driver runs one statement per call, so split the file up.
 *
 * Splitting on bare semicolons is not enough: function bodies and DO blocks are
 * dollar-quoted ($$ … $$ or $tag$ … $tag$) and contain their own semicolons.
 * This walks the text and only breaks on semicolons at the top level.
 */
function statements(text) {
  const src = text
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

  const out = [];
  let current = '';
  let dollarTag = null;
  let inSingleQuote = false;

  for (let i = 0; i < src.length; i++) {
    const rest = src.slice(i);

    if (dollarTag) {
      if (rest.startsWith(dollarTag)) {
        current += dollarTag;
        i += dollarTag.length - 1;
        dollarTag = null;
        continue;
      }
    } else if (inSingleQuote) {
      if (src[i] === "'") inSingleQuote = false;
    } else {
      const open = rest.match(/^\$[A-Za-z_]*\$/);
      if (open) {
        dollarTag = open[0];
        current += dollarTag;
        i += dollarTag.length - 1;
        continue;
      }
      if (src[i] === "'") inSingleQuote = true;
      else if (src[i] === ';') {
        if (current.trim()) out.push(current.trim());
        current = '';
        continue;
      }
    }
    current += src[i];
  }

  if (current.trim()) out.push(current.trim());
  return out;
}

const dir = new URL('../db/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
  const parts = statements(readFileSync(join(dir, file), 'utf8'));
  process.stdout.write(`${file}: ${parts.length} statements… `);
  for (const statement of parts) {
    try {
      await sql.query(statement);
    } catch (err) {
      console.log('failed');
      console.error(`\n  statement: ${statement.split('\n')[0]}…\n  ${err.message}`);
      process.exit(1);
    }
  }
  console.log('ok');
}
