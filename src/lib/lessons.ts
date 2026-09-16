import type { LessonType, Sport } from '../types';
import { translate } from './i18n';

export const SPORT_LABEL: Record<Sport, string> = {
  windsurf: 'Windsurf',
  wingfoil: 'Wingfoil',
};

export const LESSON_LABEL: Record<LessonType, string> = {
  individual: 'Bireysel',
  group: 'Grup',
  kids_camp: 'Çocuk kampı',
};

export type LessonShape = {
  lessonType: LessonType;
  /** Optional: busy_hours exposes the kind of lesson but not its sport. */
  sport?: Sport | null;
  groupSize: number | null;
};

/** "Bireysel · Windsurf", "Grup (3) · Wingfoil", "Çocuk kampı". */
export function describeLesson(b: LessonShape): string {
  if (b.lessonType === 'kids_camp') return translate('Çocuk kampı');
  const kind =
    b.lessonType === 'group'
      ? `${translate('Grup')} (${b.groupSize ?? '?'})`
      : translate('Bireysel');
  return b.sport ? `${kind} · ${SPORT_LABEL[b.sport]}` : kind;
}

/** The short form that fits in a calendar cell. */
export function shortLesson(b: LessonShape): string {
  if (b.lessonType === 'kids_camp') return translate('Çocuk kampı');
  if (b.lessonType === 'group') return `${translate('Grup')} (${b.groupSize ?? '?'})`;
  return b.sport ? SPORT_LABEL[b.sport] : translate('Bireysel');
}

/** The class that colours a cell or a row by what kind of lesson it is. */
/** Colour is by lesson type, not by sport — those are the four the calendar distinguishes. */
export function lessonClass(b: LessonShape): string {
  if (b.lessonType === 'kids_camp') return 'kids';
  if (b.lessonType === 'group') return 'group';
  return 'individual';
}

/**
 * The label staff see in a calendar cell.
 *
 * Differs from `shortLesson` in one way that matters: a group lesson says which
 * sport it is too. `shortLesson` drops it to stay short, which is fine for the
 * public view where the sport is not shown at all, but the person teaching it
 * needs to know whether to carry a board or a wing.
 */
export function staffLesson(b: LessonShape): string {
  if (b.lessonType === 'kids_camp') return translate('Çocuk kampı');
  if (b.lessonType === 'group') {
    const head = `${translate('Grup')} (${b.groupSize ?? '?'})`;
    return b.sport ? `${head} · ${SPORT_LABEL[b.sport]}` : head;
  }
  return b.sport ? SPORT_LABEL[b.sport] : translate('Bireysel');
}
