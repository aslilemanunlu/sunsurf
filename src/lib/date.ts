/** Local-date helpers. Dates are keyed as YYYY-MM-DD so a day is unambiguous. */

import { locale, translate } from './i18n';

export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: string, n: number): string {
  const d = fromDateKey(key);
  d.setDate(d.getDate() + n);
  return toDateKey(d);
}

export function todayKey(): string {
  return toDateKey(new Date());
}

export function isToday(key: string): boolean {
  return key === todayKey();
}

export function isPast(key: string): boolean {
  return key < todayKey();
}

/** "Sat 14 Mar" — or "Today" / "Tomorrow" when close by. */
export function formatDayLabel(key: string): string {
  if (isToday(key)) return translate('Bugün');
  if (key === addDays(todayKey(), 1)) return translate('Yarın');
  if (key === addDays(todayKey(), -1)) return translate('Dün');
  return fromDateKey(key).toLocaleDateString(locale(), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/** Always the plain date, for the subtitle under the big label. */
export function formatFullDate(key: string): string {
  return fromDateKey(key).toLocaleDateString(locale(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(locale(), {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatTimeRange(iso: string, durationMin: number): string {
  const end = new Date(new Date(iso).getTime() + durationMin * 60_000);
  return `${formatTime(iso)} – ${formatTime(end.toISOString())}`;
}

export function formatDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

/** Slots before 12:00 are "Morning". */
export function isMorning(iso: string): boolean {
  return new Date(iso).getHours() < 12;
}
