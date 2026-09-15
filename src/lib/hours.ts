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

/** A lesson may run one, two or three consecutive hours. */
export const DURATIONS = [1, 2, 3] as const;

export type HourState =
  | 'closed' // outside working hours
  | 'past' // already gone
  | 'blocked' // the instructor closed it
  | 'pending' // someone is waiting on approval — still locked
  | 'taken' // someone else's approved booking
  | 'mine-pending' // your request, not decided yet
  | 'mine' // your approved booking
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
