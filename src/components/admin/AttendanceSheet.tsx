import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CampRegistration } from '../../types';
import { locale, useT } from '../../lib/i18n';
import * as api from '../../api/client';
import { fromDateKey } from '../../lib/date';

type Props = {
  season: number;
  /** The day the register is showing behind this dialog. */
  initialDay: string;
  /** This season's children, already loaded by the page. */
  registered: CampRegistration[];
  onClose: () => void;
  /**
   * The day that was taken, and the registrations created for children who had
   * never been to camp before — they are the ones still missing a form.
   */
  onDone: (day: string, createdRegistrationIds: string[]) => void;
};

/** A line in the picker: on this season's list, a returning child, or a new name. */
type Row =
  | { key: string; name: string; kind: 'registered'; registrationId: string }
  | { key: string; name: string; kind: 'returning'; past: CampRegistration }
  | { key: string; name: string; kind: 'new' };

const EMPTY_FORM = {
  birthDate: null,
  allergyNote: '',
  guardianName: '',
  guardianPhone: '',
  emergency1Name: '',
  emergency1Phone: '',
  emergency2Name: '',
  emergency2Phone: '',
};

function formOf(r: CampRegistration): api.CampForm {
  return {
    childName: r.childName,
    birthDate: r.birthDate,
    allergyNote: r.allergyNote ?? '',
    guardianName: r.guardianName ?? '',
    guardianPhone: r.guardianPhone ?? '',
    emergency1Name: r.emergency1Name ?? '',
    emergency1Phone: r.emergency1Phone ?? '',
    emergency2Name: r.emergency2Name ?? '',
    emergency2Phone: r.emergency2Phone ?? '',
  };
}

/** Turkish lower case, so "İ" and "I" sort out and "AS" finds "Aslı". */
const fold = (s: string) => s.toLocaleLowerCase('tr');

/** True when any word of the name starts with what has been typed. */
function matches(name: string, query: string): boolean {
  if (!query) return true;
  const q = fold(query.trim());
  return fold(name)
    .split(/\s+/)
    .some((word) => word.startsWith(q));
}

/**
 * The whole day's register in one pass: tick everybody who came, mark the ones
 * who went home at lunch, finish.
 *
 * Marking children one at a time was fine for a correction and wrong for the
 * morning, when twenty of them arrive at once. The list searches by the first
 * letters of a name, takes as many ticks as you like, and everybody ticked is a
 * full day until you say otherwise — because most of them are.
 *
 * A child who came last summer is in the same list: ticking them registers them
 * for this season with last year's details, so nobody is typed in twice and the
 * seasons stay linked. Only a genuinely new name is typed, and those are the
 * registrations handed back for a form to be filled in afterwards.
 */
export default function AttendanceSheet({
  season,
  initialDay,
  registered,
  onClose,
  onDone,
}: Props) {
  const { t } = useT();
  const [day, setDay] = useState(initialDay);
  const [query, setQuery] = useState('');
  const [past, setPast] = useState<CampRegistration[]>([]);
  const [newNames, setNewNames] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [half, setHalf] = useState<Set<string>>(new Set());
  /** What the day already had when the dialog opened, to know what to undo. */
  const [before, setBefore] = useState<Map<string, 'full' | 'half'>>(new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  useEffect(() => {
    let cancelled = false;
    api
      .listPastCampChildren()
      .then((p) => !cancelled && setPast(p))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  /** The day already taken, if it was: those children start ticked. */
  const loadDay = useCallback(
    async (d: string) => {
      try {
        const rows = await api.listCampAttendance(season, d);
        const marks = new Map(rows.map((r) => [r.registrationId, r.kind]));
        setBefore(marks);
        setPicked(new Set([...marks.keys()].map((id) => `r:${id}`)));
        setHalf(
          new Set([...marks.entries()].filter(([, k]) => k === 'half').map(([id]) => `r:${id}`)),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [season],
  );

  useEffect(() => {
    void loadDay(day);
  }, [day, loadDay]);

  const rows = useMemo<Row[]>(() => {
    const here = new Set(registered.map((r) => r.customerId));
    return [
      ...registered.map((r) => ({
        key: `r:${r.registrationId}`,
        name: r.childName,
        kind: 'registered' as const,
        registrationId: r.registrationId,
      })),
      ...past
        .filter((p) => !here.has(p.customerId))
        .map((p) => ({
          key: `p:${p.customerId}`,
          name: p.childName,
          kind: 'returning' as const,
          past: p,
        })),
      ...newNames.map((n) => ({ key: `n:${n}`, name: n, kind: 'new' as const })),
    ];
  }, [registered, past, newNames]);

  const shown = useMemo(() => rows.filter((r) => matches(r.name, query)), [rows, query]);
  const chosen = useMemo(() => rows.filter((r) => picked.has(r.key)), [rows, picked]);

  function toggle(key: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        setHalf((h) => {
          const hh = new Set(h);
          hh.delete(key);
          return hh;
        });
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function toggleHalf(key: string) {
    setHalf((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function addName() {
    const name = draft.trim();
    if (name.length < 2) return;
    setHint(null);

    const already = rows.find((r) => fold(r.name) === fold(name));
    if (already) {
      // It is the same child; tick the one that is already there.
      setPicked((prev) => new Set(prev).add(already.key));
      setDraft('');
      setHint(t('Bu çocuk zaten listede, işaretlendi.'));
      return;
    }

    const same = await api.findCustomerByName(name);
    if (
      same &&
      !window.confirm(
        t('“{n}” adında bir müşteri zaten var. Yine de yeni bir kayıt açılsın mı?').replace(
          '{n}',
          same.name,
        ),
      )
    ) {
      return;
    }

    setNewNames((prev) => [...prev, name]);
    setPicked((prev) => new Set(prev).add(`n:${name}`));
    setDraft('');
  }

  async function complete() {
    setBusy(true);
    setError(null);
    try {
      const created: string[] = [];
      const keptRegistrations = new Set<string>();

      for (const row of chosen) {
        let registrationId: string;
        if (row.kind === 'registered') {
          registrationId = row.registrationId;
        } else if (row.kind === 'returning') {
          // last season's details come with them; the seasons stay linked
          registrationId = await api.registerForCamp({
            customerId: row.past.customerId,
            season,
            form: formOf(row.past),
          });
        } else {
          registrationId = await api.registerForCamp({
            customerId: null,
            season,
            form: { childName: row.name, ...EMPTY_FORM },
          });
          created.push(registrationId);
        }
        keptRegistrations.add(registrationId);
        await api.setCampAttendance(registrationId, day, half.has(row.key) ? 'half' : 'full');
      }

      // Somebody unticked is somebody who did not come after all.
      for (const registrationId of before.keys()) {
        if (!keptRegistrations.has(registrationId)) {
          await api.setCampAttendance(registrationId, day, null);
        }
      }

      onDone(day, created);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const halfCount = chosen.filter((r) => half.has(r.key)).length;

  return (
    <div className="overlay" onClick={() => !busy && onClose()}>
      <div
        className="dialog dialog--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="sheet-title">{t('Yoklama ekle')}</h3>

        {error && <p className="dialog-error">{error}</p>}

        <label className="field">
          <span>{t('Hangi gün')}</span>
          <input
            type="date"
            value={day}
            onChange={(e) => e.target.value && setDay(e.target.value)}
            disabled={busy}
          />
          <small className="field-hint">
            {fromDateKey(day).toLocaleDateString(locale(), {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </small>
        </label>

        <label className="field">
          <span>{t('Çocuk ara')}</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('İlk harfleri yazın')}
            autoFocus
          />
        </label>

        <div className="picklist">
          {shown.length === 0 ? (
            <p className="cell-dim">{t('Bu isimde çocuk yok. Aşağıdan yeni çocuk ekleyin.')}</p>
          ) : (
            shown.map((r) => (
              <label key={r.key} className={`pickrow${picked.has(r.key) ? ' is-picked' : ''}`}>
                <input
                  type="checkbox"
                  checked={picked.has(r.key)}
                  onChange={() => toggle(r.key)}
                  disabled={busy}
                />
                <span className="pickrow-name">{r.name}</span>
                {r.kind === 'returning' && (
                  <span className="cell-dim">
                    {t('geçen sezon')} · {r.past.season}
                  </span>
                )}
                {r.kind === 'new' && <span className="cell-dim">{t('yeni')}</span>}
              </label>
            ))
          )}
        </div>

        <div className="field">
          <span>{t('Listede yoksa yeni çocuk ekle')}</span>
          <div className="addrow">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void addName();
                }
              }}
              placeholder={t('Çocuğun adı soyadı')}
              disabled={busy}
            />
            <button
              className="btn btn--ghost btn--small"
              onClick={addName}
              disabled={busy || draft.trim().length < 2}
            >
              + {t('Ekle')}
            </button>
          </div>
          {hint && <small className="field-hint">{hint}</small>}
        </div>

        <section className="panel picked-panel">
          <h4 className="panel-title">
            {t('Seçilenler')} · {chosen.length}
            {halfCount > 0 && (
              <span className="cell-dim">
                {' · '}
                {halfCount} {t('yarım gün')}
              </span>
            )}
          </h4>

          {chosen.length === 0 ? (
            <p className="cell-dim">{t('Henüz kimse seçilmedi. Hepsi tam gün sayılır.')}</p>
          ) : (
            <ul className="register">
              {chosen.map((r) => (
                <li key={r.key} className={half.has(r.key) ? undefined : 'is-here'}>
                  <span className="register-name">{r.name}</span>
                  <label className="check check--inline">
                    <input
                      type="checkbox"
                      checked={half.has(r.key)}
                      onChange={() => toggleHalf(r.key)}
                      disabled={busy}
                    />
                    {t('Yarım gün')}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="dialog-actions">
          <button className="btn btn--ghost" onClick={onClose} disabled={busy}>
            {t('Vazgeç')}
          </button>
          <button className="btn" onClick={complete} disabled={busy}>
            {busy ? t('Kaydediliyor…') : t('Yoklamayı tamamla')}
          </button>
        </div>
      </div>
    </div>
  );
}
