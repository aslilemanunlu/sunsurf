import { useEffect, useRef, useState } from 'react';
import { useT } from '../../lib/i18n';

type Option = { value: string; label: string };

type Props = {
  label: string;
  /** Shown when nothing is picked — which means "everything". */
  allLabel: string;
  options: Option[];
  picked: string[];
  onChange: (picked: string[]) => void;
};

/**
 * A dropdown that takes several answers.
 *
 * A native `<select multiple>` is a scrolling box that needs ctrl-click to add
 * a second choice, which nobody discovers. This is a button that opens a list
 * of checkboxes — the same shape, without the hidden gesture.
 *
 * Nothing picked means everything, so the filter starts unrestrictive and an
 * empty selection never produces an empty table.
 */
export default function MultiSelect({ label, allLabel, options, picked, onChange }: Props) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onAway = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', onAway);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onAway);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const summary =
    picked.length === 0
      ? allLabel
      : picked.length === 1
        ? (options.find((o) => o.value === picked[0])?.label ?? allLabel)
        : t('{n} seçili').replace('{n}', String(picked.length));

  function toggle(value: string) {
    onChange(picked.includes(value) ? picked.filter((v) => v !== value) : [...picked, value]);
  }

  return (
    <div className="multi" ref={box}>
      <button
        type="button"
        className="multi-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={label}
      >
        {summary}
        <span aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="multi-pop" role="group" aria-label={label}>
          {picked.length > 0 && (
            <button type="button" className="link-btn" onClick={() => onChange([])}>
              {t('Seçimi temizle')}
            </button>
          )}
          {options.map((o) => (
            <label key={o.value} className="multi-item">
              <input
                type="checkbox"
                checked={picked.includes(o.value)}
                onChange={() => toggle(o.value)}
              />
              {o.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
