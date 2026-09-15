import type { Sport } from '../types';
import { useT } from '../lib/i18n';

export type SportFilterValue = Sport | 'all';

const OPTIONS: { value: SportFilterValue; label: string }[] = [
  { value: 'all', label: 'Tümü' },
  { value: 'windsurf', label: 'Windsurf' },
  { value: 'wingfoil', label: 'Wingfoil' },
];

type Props = {
  value: SportFilterValue;
  onChange: (value: SportFilterValue) => void;
};

export default function SportFilter({ value, onChange }: Props) {
  const { t } = useT();
  return (
    <div className="segmented" role="group" aria-label={t('Spora göre filtrele')}>
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          className={`segment${value === o.value ? ' is-active' : ''}`}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
        >
          {t(o.label)}
        </button>
      ))}
    </div>
  );
}
