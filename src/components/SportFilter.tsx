import type { Sport } from '../types';

export type SportFilterValue = Sport | 'all';

const OPTIONS: { value: SportFilterValue; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'windsurf', label: 'Windsurf' },
  { value: 'wingfoil', label: 'Wingfoil' },
];

type Props = {
  value: SportFilterValue;
  onChange: (value: SportFilterValue) => void;
};

export default function SportFilter({ value, onChange }: Props) {
  return (
    <div className="segmented" role="group" aria-label="Filter by sport">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          className={`segment${value === o.value ? ' is-active' : ''}`}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
