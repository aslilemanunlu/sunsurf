/**
 * The only module that touches data.
 *
 * Everything goes through the Neon Data API (PostgREST over HTTPS). There is no
 * server of ours in the middle: the session JWT rides along with each request and
 * the RLS policies in db/001_init.sql decide what the caller may see and write.
 *
 * Signed-out visitors get an anonymous token, which the policies allow to read
 * `instructors` and `slots` but nothing in `bookings`.
 *
 * Postgres columns are snake_case and the app's types are camelCase; the mapping
 * lives here so no component has to know about either.
 */
import type { Booking, Instructor, SlotWithInstructor } from '../types';
import { fromDateKey, toDateKey } from '../lib/date';
import { neon } from '../neon';

/** Shapes as PostgREST returns them. */
type InstructorRow = {
  id: string;
  name: string;
  sports: string[];
  bio: string;
};

type SlotRow = {
  id: string;
  instructor_id: string;
  sport: string;
  starts_at: string;
  duration_min: number;
  instructor: InstructorRow;
};

type BookingRow = {
  id: string;
  slot_id: string;
  user_id: string;
  created_at: string;
};

const SLOT_SELECT = '*, instructor:instructors(*)';

function toInstructor(row: InstructorRow): Instructor {
  return {
    id: row.id,
    name: row.name,
    sports: row.sports as Instructor['sports'],
    bio: row.bio,
  };
}

function toSlot(row: SlotRow): SlotWithInstructor {
  return {
    id: row.id,
    instructorId: row.instructor_id,
    sport: row.sport as SlotWithInstructor['sport'],
    startsAt: row.starts_at,
    durationMin: row.duration_min,
    instructor: toInstructor(row.instructor),
  };
}

function toBooking(row: BookingRow): Booking {
  return {
    id: row.id,
    slotId: row.slot_id,
    userId: row.user_id,
    createdAt: row.created_at,
  };
}

type Result<T> = { data: T | null; error: { message: string } | null };

/** PostgREST reports failures in the payload rather than throwing. */
function unwrap<T>(result: Result<T>, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  if (result.data === null) throw new Error(`${what}: no data returned`);
  return result.data;
}

/**
 * Runs a read, retrying once if it comes back aborted.
 *
 * The Data API rejects requests with no JWT, so a signed-out visitor's first
 * call has to mint an anonymous token first. On an origin that has never done
 * that, the very first request loses that race and aborts — reproducibly, on
 * the first page load of a fresh origin, and never afterwards. One retry
 * settles it, by which time the token exists. A genuine failure still surfaces,
 * because the retry reports its own error.
 *
 * `build` must construct the query afresh: a PostgREST builder is a one-shot
 * thenable and cannot be awaited twice.
 */
async function read<T>(build: () => PromiseLike<Result<T>>, what: string): Promise<T> {
  const first = await build();
  if (first.error && /abort/i.test(first.error.message)) {
    return unwrap(await build(), what);
  }
  return unwrap(first, what);
}

/** Local midnight either side of a day, as the instants Postgres compares against. */
function dayBounds(dateKey: string): { from: string; to: string } {
  const start = fromDateKey(dateKey);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

export async function listInstructors(): Promise<Instructor[]> {
  const rows = await read<InstructorRow[]>(
    () => neon.from('instructors').select('*').order('name'),
    'Could not load instructors',
  );
  return rows.map(toInstructor);
}

export async function listSlots(dateKey: string): Promise<SlotWithInstructor[]> {
  const { from, to } = dayBounds(dateKey);
  const rows = await read<SlotRow[]>(
    () =>
      neon
        .from('slots')
        .select(SLOT_SELECT)
        .gte('starts_at', from)
        .lt('starts_at', to)
        .order('starts_at'),
    'Could not load classes',
  );
  return rows.map(toSlot);
}

/** Nearest day with at least one class, searching outward from `fromKey`. */
export async function findNextDayWithSlots(
  fromKey: string,
  direction: 1 | -1,
): Promise<string | null> {
  const { from, to } = dayBounds(fromKey);
  const rows = await read<{ starts_at: string }[]>(
    () =>
      direction === 1
        ? neon.from('slots').select('starts_at').gte('starts_at', to).order('starts_at').limit(1)
        : neon
            .from('slots')
            .select('starts_at')
            .lt('starts_at', from)
            .order('starts_at', { ascending: false })
            .limit(1),
    'Could not find the next day with classes',
  );
  return rows.length > 0 ? toDateKey(new Date(rows[0].starts_at)) : null;
}

export async function getSlot(slotId: string): Promise<SlotWithInstructor | null> {
  const rows = await read<SlotRow[]>(
    () => neon.from('slots').select(SLOT_SELECT).eq('id', slotId).limit(1),
    'Could not load the class',
  );
  return rows.length > 0 ? toSlot(rows[0]) : null;
}

export type BookingWithSlot = Booking & { slot: SlotWithInstructor };

/**
 * One round trip: PostgREST embeds the booked slot and its instructor through
 * the foreign keys, so callers don't have to fetch slots one at a time.
 */
export async function listBookings(): Promise<BookingWithSlot[]> {
  const rows = await read<(BookingRow & { slot: SlotRow | null })[]>(
    () => neon.from('bookings').select(`*, slot:slots(${SLOT_SELECT})`).order('created_at'),
    'Could not load your bookings',
  );

  return rows
    .filter((row) => row.slot !== null)
    .map((row) => ({ ...toBooking(row), slot: toSlot(row.slot!) }));
}

/**
 * `user_id` is deliberately not sent — the column defaults to auth.user_id(), so
 * the database takes it from the JWT and a client cannot book as someone else.
 */
export async function createBooking(slotId: string): Promise<Booking> {
  const result = await neon.from('bookings').insert({ slot_id: slotId }).select('*');

  // unique (slot_id, user_id): already booked is not an error worth surfacing
  if (result.error?.code === '23505') {
    const existing = unwrap(
      await neon.from('bookings').select('*').eq('slot_id', slotId).limit(1),
      'Could not load your booking',
    ) as BookingRow[];
    if (existing.length > 0) return toBooking(existing[0]);
  }

  const rows = unwrap(result, 'Could not book this class') as BookingRow[];
  return toBooking(rows[0]);
}

export async function cancelBooking(bookingId: string): Promise<void> {
  const result = await neon.from('bookings').delete().eq('id', bookingId);
  if (result.error) throw new Error(`Could not cancel this booking: ${result.error.message}`);
}
