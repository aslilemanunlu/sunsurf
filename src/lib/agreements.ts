import type { AgreementKind, EquipmentLevel } from '../types';
import { locale } from './i18n';

export const KINDS: AgreementKind[] = ['lesson', 'rental', 'storage', 'kids_camp', 'insurance'];

export const KIND_LABEL: Record<AgreementKind, string> = {
  lesson: 'Özel ders',
  rental: 'Kiralama',
  storage: 'Depolama',
  kids_camp: 'Kids Camp',
  insurance: 'Sigorta',
};

/** Rental is a level of kit for a period; the two are chosen together. */
export const EQUIPMENT_LEVELS: EquipmentLevel[] = ['beginner', 'freeride', 'advanced'];

export const EQUIPMENT_LABEL: Record<EquipmentLevel, string> = {
  beginner: 'Beginner',
  freeride: 'Freeride',
  advanced: 'Advance / Pro',
};

/**
 * A plan, and what its number counts.
 *
 * `unit` is what `units` means on that agreement — sessions on a lesson pack,
 * hours on an hourly rental, days on a daily one. One column, read through the
 * plan that gave it meaning, rather than four columns that are null three times
 * out of four.
 *
 * `options` are the usual answers; `free` means any number may be typed. The
 * list is meant to be added to — a season will invent a package nobody planned
 * for, and the alternative is staff picking the one that nearly fits.
 */
export type Plan = {
  value: string;
  label: string;
  unit?: 'session' | 'hour' | 'day' | 'credit';
  options?: number[];
  free?: boolean;
};

export const PLANS: Record<AgreementKind, Plan[]> = {
  lesson: [
    { value: 'sessions', label: 'Seans', unit: 'session', options: [1, 5, 10, 15, 20], free: true },
    { value: 'other', label: 'Diğer' },
  ],
  rental: [
    { value: 'hourly', label: 'Saatlik', unit: 'hour', options: [1, 3], free: true },
    { value: 'daily', label: 'Günlük', unit: 'day', options: [1, 2, 3, 5, 7], free: true },
    { value: 'weekly', label: 'Haftalık' },
    { value: 'monthly', label: 'Aylık' },
    { value: 'seasonal', label: 'Sezonluk' },
    { value: 'credit', label: 'Kredi', unit: 'credit', options: [5, 11, 21], free: true },
    { value: 'other', label: 'Diğer' },
  ],
  storage: [
    { value: 'monthly', label: 'Aylık' },
    { value: 'seasonal', label: 'Sezonluk' },
    { value: 'yearly', label: 'Yıllık' },
    { value: 'other', label: 'Diğer' },
  ],
  kids_camp: [
    { value: 'camp', label: 'Kids Camp' },
    { value: 'other', label: 'Diğer' },
  ],
  insurance: [
    { value: 'board', label: 'Board' },
    { value: 'sail', label: 'Yelken' },
    { value: 'board_sail', label: 'Board + Yelken' },
    { value: 'other', label: 'Diğer' },
  ],
};

export const UNIT_LABEL: Record<NonNullable<Plan['unit']>, string> = {
  session: 'seans',
  hour: 'saat',
  day: 'gün',
  credit: 'kredi',
};

export function planOf(kind: AgreementKind, value: string | null): Plan | null {
  if (!value) return null;
  return PLANS[kind].find((p) => p.value === value) ?? null;
}

export function planLabel(kind: AgreementKind, plan: string | null): string | null {
  return planOf(kind, plan)?.label ?? plan;
}

/** Turkish lira, no decimals when there are none — prices here are round. */
export function formatMoney(value: number): string {
  return new Intl.NumberFormat(locale(), {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}
