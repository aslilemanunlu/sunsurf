import { useEffect } from 'react';
import { useT } from '../lib/i18n';
import type { Instructor } from '../types';
import { formatDayLabel, formatTime, toDateKey } from '../lib/date';
import type { HourCell } from './DayCalendar';

type Props = {
  instructor: Instructor;
  cell: HourCell;
  busy: boolean;
  onBlock: () => void;
  onUnblock: () => void;
  onCreateLesson: () => void;
  onCreateCamp: () => void;
  onClose: () => void;
};

/**
 * What staff get when they click an hour on a calendar they manage. Replaces the
 * old separate management panel: the calendar itself is the way in.
 */
export default function HourActions({
  instructor,
  cell,
  busy,
  onBlock,
  onUnblock,
  onCreateLesson,
  onCreateCamp,
  onClose,
}: Props) {
  const { t } = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const blocked = cell.state === 'blocked';
  const endsAt = new Date(cell.startsAt.getTime() + 60 * 60 * 1000);

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hour-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="hour-title">{t('Bu saatte ne yapmak istiyorsunuz?')}</h3>

        <div className="dialog-summary">
          <p className="dialog-instructor">{instructor.name}</p>
          <p className="dialog-when">
            {formatDayLabel(toDateKey(cell.startsAt))} ·{' '}
            {formatTime(cell.startsAt.toISOString())} – {formatTime(endsAt.toISOString())}
          </p>
        </div>

        <div className="hour-actions">
          {blocked ? (
            <button className="btn" onClick={onUnblock} disabled={busy}>
              {t('Bloğu kaldır')}
            </button>
          ) : (
            <>
              <button className="btn" onClick={onCreateLesson} disabled={busy}>
                {t('Ders oluştur')}
              </button>
              <button className="btn btn--ghost" onClick={onCreateCamp} disabled={busy}>
                {t('Çocuk kampı')}
              </button>
              <button className="btn btn--ghost" onClick={onBlock} disabled={busy}>
                {t('Bloke et')}
              </button>
            </>
          )}
        </div>

        <p className="admin-hint dialog-foot">
          {t('Bloke edilen saat müsait görünmez ve kimse ders alamaz.')}
        </p>

        <div className="dialog-actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {t('Kapat')}
          </button>
        </div>
      </div>
    </div>
  );
}
