import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../../lib/i18n';

export type NameItem = { id: string; name: string; hint?: string | null };

type Props = {
  /** What is in the box. The caller owns it, because it is often a new name. */
  value: string;
  onChange: (text: string) => void;
  items: NameItem[];
  onPick: (item: NameItem) => void;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  /** Shown under the box: "kayıtlı müşteri", "yeni kayıt açılacak", and so on. */
  hint?: string;
};

/** Turkish lower case, so "AS" finds "Aslı" and "İ" behaves. */
const fold = (s: string) => s.toLocaleLowerCase('tr');

/** Any word of the name starting with what has been typed. */
function matches(name: string, query: string): boolean {
  const q = fold(query.trim());
  if (!q) return true;
  return fold(name)
    .split(/\s+/)
    .some((w) => w.startsWith(q));
}

/**
 * A name box that suggests as you type.
 *
 * A `<select>` of every customer is unusable by the second season, and a native
 * `<datalist>` shows its suggestions when it feels like it. This is a plain
 * input with a list under it: type two letters, see who matches, click one.
 *
 * The text stays the caller's, so the same box takes a name nobody has yet —
 * the record gets created on save.
 */
export default function NameSearch({
  value,
  onChange,
  items,
  onPick,
  placeholder,
  autoFocus,
  disabled,
  hint,
}: Props) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  const shown = useMemo(
    () => items.filter((i) => matches(i.name, value)).slice(0, 8),
    [items, value],
  );

  // Typing is what makes the list appear; focus alone offers the whole list.
  const visible = open && shown.length > 0;

  return (
    <div className="combo" ref={box}>
      {/* the list hangs off the box, not off the hint underneath it */}
      <div className="combo-box">
        <input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && open) {
              e.stopPropagation();
              setOpen(false);
            }
          }}
          placeholder={placeholder}
          autoFocus={autoFocus}
          disabled={disabled}
          role="combobox"
          aria-expanded={visible}
          autoComplete="off"
        />

        {visible && (
          // mousedown is what takes focus away from the input; a pick must not
          <ul className="picklist combo-pop" onMouseDown={(e) => e.preventDefault()}>
            {shown.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  className="pickrow pickrow--btn"
                  onClick={() => {
                    onPick(i);
                    setOpen(false);
                  }}
                >
                  <span className="pickrow-name">{i.name}</span>
                  {i.hint && <span className="cell-dim">{i.hint}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {hint && <small className="field-hint">{t(hint)}</small>}
    </div>
  );
}
