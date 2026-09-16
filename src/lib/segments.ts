import type { Segment } from '../types';

/** The office's own classification of a customer. */
/**
 * What a customer can be tagged as, in the form.
 *
 * `kids_camp` is missing on purpose: a camp registration applies it, and nobody
 * was choosing it by hand. It stays a valid value — the list still filters by it.
 */
export const SEGMENTS: Segment[] = ['windsurf', 'wingfoil', 'lesson', 'rental', 'storage'];

/** Everything a customer might already carry, including what the form omits. */
export const ALL_SEGMENTS: Segment[] = [...SEGMENTS, 'kids_camp'];

export const SEGMENT_LABEL: Record<Segment, string> = {
  lesson: 'Özel Ders Öğrencisi',
  storage: 'Depolamacı',
  rental: 'Kiralamacı',
  kids_camp: 'Kids Camp',
  windsurf: 'Windsurf',
  wingfoil: 'Wingfoil',
};

/**
 * Suggestions for "where did they come from".
 *
 * A suggestion list, not an enum: the answers that matter change within a
 * season, and a column that needs a migration to add "TikTok" is a column
 * nobody keeps up to date.
 */
export const SOURCES = [
  'Instagram',
  'Otel yönlendirmesi',
  'Tavsiye',
  'Tekrar gelen',
  'Yoldan geçen',
  'Google',
];

/** Segments and lesson types share a colour vocabulary on purpose. */
export function segmentTone(s: Segment): string {
  if (s === 'kids_camp') return 'kids';
  if (s === 'rental' || s === 'wingfoil') return 'group';
  if (s === 'storage') return '';
  return 'individual';
}
