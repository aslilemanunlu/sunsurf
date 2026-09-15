import { addDays, formatDayLabel, formatFullDate, isToday, todayKey } from '../lib/date';
import { locale, useT } from '../lib/i18n';

type Props = {
  dateKey: string;
  onChange: (key: string) => void;
};

/** Big day headline with arrows, plus a 7-day strip centred on the selection. */
export default function DayNav({ dateKey, onChange }: Props) {
  const { t } = useT();
  const strip = Array.from({ length: 7 }, (_, i) => addDays(dateKey, i - 3));

  return (
    <nav className="daynav" aria-label={t('Gün seçin')}>
      <div className="daynav-head">
        <button
          className="icon-btn"
          onClick={() => onChange(addDays(dateKey, -1))}
          aria-label={t('Önceki gün')}
        >
          ‹
        </button>

        <div className="daynav-title">
          <h2>{formatDayLabel(dateKey)}</h2>
          <p>{formatFullDate(dateKey)}</p>
        </div>

        <button
          className="icon-btn"
          onClick={() => onChange(addDays(dateKey, 1))}
          aria-label={t('Sonraki gün')}
        >
          ›
        </button>
      </div>

      <div className="daystrip">
        {strip.map((key) => {
          const d = new Date(`${key}T00:00:00`);
          const selected = key === dateKey;
          return (
            <button
              key={key}
              className={`daychip${selected ? ' is-selected' : ''}${isToday(key) ? ' is-today' : ''}`}
              onClick={() => onChange(key)}
              aria-current={selected ? 'date' : undefined}
            >
              <span className="daychip-dow">
                {d.toLocaleDateString(locale(), { weekday: 'short' })}
              </span>
              <span className="daychip-num">{d.getDate()}</span>
            </button>
          );
        })}
      </div>

      {!isToday(dateKey) && (
        <button className="link-btn daynav-today" onClick={() => onChange(todayKey())}>
          {t('Bugüne dön')}
        </button>
      )}
    </nav>
  );
}
