/**
 * Availability is not stored anywhere. Every instructor is open the same hours
 * every day, and an hour is unavailable only because something says so: a
 * booking exists for it, or the instructor closed it.
 */

/** Rows the calendar draws. */
export const GRID_START_HOUR = 7;
export const GRID_END_HOUR = 21;

/** Hours that can actually be booked: 08:00–20:00, so the last start is 19:00. */
export const OPEN_FROM_HOUR = 8;
export const OPEN_UNTIL_HOUR = 20;

export function isOpenHour(hour: number): boolean {
  return hour >= OPEN_FROM_HOUR && hour < OPEN_UNTIL_HOUR;
}

/** Every hour the grid shows for a day, as local Date objects. */
export function gridHours(dateKey: string): Date[] {
  const [y, m, d] = dateKey.split('-').map(Number);
  const out: Date[] = [];
  for (let h = GRID_START_HOUR; h < GRID_END_HOUR; h++) {
    out.push(new Date(y, m - 1, d, h, 0, 0, 0));
  }
  return out;
}

/**
 * Keys an hour to an instructor. Uses epoch milliseconds rather than the ISO
 * string so a value from Postgres and one built in the browser compare equal
 * regardless of how either side spells the timezone.
 */
export function hourKey(instructorId: string, at: string | Date): string {
  const ms = typeof at === 'string' ? Date.parse(at) : at.getTime();
  return `${instructorId}|${ms}`;
}

/**
 * How long before a lesson a customer may still cancel it.
 *
 * The database holds the same number in `cancellation_window_hours()`
 * (db/007) and that is the copy that decides — this one only greys the button
 * out and explains why. Change one and change the other.
 */
export const CANCEL_WINDOW_HOURS = 12;

/**
 * A pending request can always be withdrawn: nobody has accepted it yet, and
 * leaving it in place would hold the hour against everyone else.
 */
export function canCancel(b: { startsAt: string; status: string }, now = Date.now()): boolean {
  if (b.status === 'pending') return true;
  return Date.parse(b.startsAt) - now >= CANCEL_WINDOW_HOURS * 60 * 60 * 1000;
}

/**
 * The longest a lesson may run. Matches the CHECK in db/012 — the database is
 * the one that refuses, this only stops the interface offering it.
 */
export const MAX_DURATION = 12;

/** The lengths on offer from an hour with `free` consecutive hours after it. */
export function durationChoices(free: number): number[] {
  const n = Math.min(Math.max(free, 1), MAX_DURATION);
  return Array.from({ length: n }, (_, i) => i + 1);
}

export type HourState =
  | 'closed' // outside working hours
  | 'past' // already gone
  | 'blocked' // staff closed it
  | 'pending' // booked, but not settled yet
  | 'taken' // booked
  | 'free';

/**
 * Every bookable hour between two date keys, inclusive. Closing a range is just
 * closing each of these hours, so a "close this week" is a lot of small rows
 * rather than a new concept in the schema.
 */
export function openHoursBetween(fromKey: string, toKey: string): Date[] {
  const out: Date[] = [];
  const [fy, fm, fd] = fromKey.split('-').map(Number);
  const [ty, tm, td] = toKey.split('-').map(Number);
  const cursor = new Date(fy, fm - 1, fd);
  const last = new Date(ty, tm - 1, td);

  while (cursor <= last) {
    for (let h = OPEN_FROM_HOUR; h < OPEN_UNTIL_HOUR; h++) {
      out.push(new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), h, 0, 0, 0));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/** How a lesson repeats. */
export type Repeat = 'none' | 'daily' | 'weekdays' | 'weekly';

/**
 * The dates a repeating lesson falls on, the first one included.
 *
 * `weekdays` skips Saturday and Sunday but still counts up to `times` lessons —
 * asking for ten weekday lessons and getting eight because two fell on a
 * weekend is not what anybody meant.
 */
export function repeatDates(start: Date, repeat: Repeat, times: number): Date[] {
  if (repeat === 'none' || times <= 1) return [start];

  const out: Date[] = [];
  const cursor = new Date(start);
  let guard = 0;

  while (out.length < times && guard < times * 10 + 30) {
    guard++;
    const day = cursor.getDay();
    if (repeat !== 'weekdays' || (day !== 0 && day !== 6)) {
      out.push(new Date(cursor));
    }
    cursor.setDate(cursor.getDate() + (repeat === 'weekly' ? 7 : 1));
  }
  return out;
}
