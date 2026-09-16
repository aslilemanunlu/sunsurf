import type { AgreementKind } from '../types';
import { locale } from './i18n';

export const KINDS: AgreementKind[] = ['lesson', 'rental', 'kids_camp', 'storage'];

export const KIND_LABEL: Record<AgreementKind, string> = {
  lesson: 'Ders',
  rental: 'Kiralama',
  kids_camp: 'Çocuk kampı',
  storage: 'Storage',
};

/**
 * What each kind can be sold as.
 *
 * `other` is on every list on purpose: the alternative is staff inventing a
 * package that nearly fits, and then the numbers mean nothing.
 */
export const PLANS: Record<AgreementKind, { value: string; label: string }[]> = {
  lesson: [
    { value: 'single', label: 'Tek ders' },
    { value: 'pack5', label: '5 ders paketi' },
    { value: 'pack10', label: '10 ders paketi' },
    { value: 'pack20', label: '20 ders paketi' },
    { value: 'other', label: 'Diğer' },
  ],
  rental: [
    { value: 'hour1', label: '1 saat' },
    { value: 'hour2', label: '2 saat' },
    { value: 'hour3', label: '3 saat' },
    { value: 'weekly', label: 'Haftalık' },
    { value: 'monthly', label: 'Aylık' },
    { value: 'seasonal', label: 'Sezonluk' },
    { value: 'other', label: 'Diğer' },
  ],
  kids_camp: [
    { value: 'camp', label: 'Çocuk kampı' },
    { value: 'other', label: 'Diğer' },
  ],
  storage: [
    { value: 'monthly', label: 'Aylık' },
    { value: 'seasonal', label: 'Sezonluk' },
    { value: 'other', label: 'Diğer' },
  ],
};

export function planLabel(kind: AgreementKind, plan: string | null): string | null {
  if (!plan) return null;
  return PLANS[kind].find((p) => p.value === plan)?.label ?? plan;
}

/** Turkish lira, no decimals when there are none — prices here are round. */
export function formatMoney(value: number): string {
  return new Intl.NumberFormat(locale(), {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}
