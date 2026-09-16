import type { Segment } from '../types';

/** The office's own classification of a customer. */
export const SEGMENTS: Segment[] = ['lesson', 'storage', 'rental', 'kids_camp'];

export const SEGMENT_LABEL: Record<Segment, string> = {
  lesson: 'Özel Ders Öğrencisi',
  storage: 'Depolamacı',
  rental: 'Kiralamacı',
  kids_camp: 'Kids Camp',
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
  return s === 'kids_camp' ? 'kids' : s === 'rental' ? 'group' : s === 'storage' ? '' : 'individual';
}
