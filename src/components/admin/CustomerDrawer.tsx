import { useEffect, useState } from 'react';
import type { CrmCustomer, CustomerNote, ManagedBooking, Segment } from '../../types';
import { locale, useT } from '../../lib/i18n';
import * as api from '../../api/client';
import { formatTime } from '../../lib/date';
import { describeLesson, lessonClass } from '../../lib/lessons';
import { SEGMENTS, SEGMENT_LABEL, segmentTone } from '../../lib/segments';
import CustomerForm from './CustomerForm';
import { initials } from '../../lib/initials';

type Props = {
  customer: CrmCustomer;
  onClose: () => void;
  /** The list behind the drawer reloads when something here changed. */
  onChanged: () => void;
};

/**
 * Everything the school knows about one customer, on one screen: how to reach
 * them, how they are classified, what staff have written down, and every lesson
 * they have had.
 */
export default function CustomerDrawer({ customer, onClose, onChanged }: Props) {
  const { t } = useT();
  const [editing, setEditing] = useState(false);
  const [segments, setSegments] = useState<Segment[]>(customer.segments);
  const [notes, setNotes] = useState<CustomerNote[]>([]);
  const [history, setHistory] = useState<ManagedBooking[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    api
      .listNotes(customer.customerId)
      .then((n) => !cancelled && setNotes(n))
      .catch(() => {
        // an instructor may open a customer but not read the notes
      });
    api
      .listBookingsForCustomer(customer.customerId)
      .then((b) => !cancelled && setHistory(b))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [customer.customerId]);

  async function toggleSegment(s: Segment) {
    const next = segments.includes(s) ? segments.filter((x) => x !== s) : [...segments, s];
    const previous = segments;
    setSegments(next);
    setBusy(true);
    setError(null);
    try {
      await api.setSegments(customer.customerId, next);
      onChanged();
    } catch (e) {
      setSegments(previous); // the write was refused, so the chip goes back
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveNote() {
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    setError(null);
    try {
      await api.addNote(customer.customerId, body);
      setDraft('');
      setNotes(await api.listNotes(customer.customerId));
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function removeNote(id: string) {
    setBusy(true);
    try {
      await api.deleteNote(id);
      setNotes(await api.listNotes(customer.customerId));
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={customer.name}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="drawer-head">
          <div className="drawer-hero">
            <span className="avatar avatar--lg" aria-hidden="true">
              {initials(customer.name)}
            </span>
            <div>
              <h3>{customer.name}</h3>
              <p className="cell-dim">
                {[
                  customer.phone,
                  customer.birthDate ? new Date(customer.birthDate).getFullYear() : null,
                  `${customer.lessons} ${t('ders')} · ${customer.hours} ${t('saat')}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
          </div>
          <button className="link-btn" onClick={onClose} aria-label={t('Kapat')}>
            ✕
          </button>
        </header>

        {error && <p className="dialog-error">{error}</p>}

        <section className="drawer-block drawer-block--first">
          <div className="admin-bar">
            <h4 className="panel-title">{t('Kayıt')}</h4>
            <button className="btn btn--small" onClick={() => setEditing(true)}>
              {t('Düzenle')}
            </button>
          </div>
          <dl className="facts">
            <div>
              <dt>{t('Telefon')}</dt>
              <dd>{customer.phone ?? '—'}</dd>
            </div>
            <div>
              <dt>{t('E-posta')}</dt>
              <dd>{customer.email ?? '—'}</dd>
            </div>
            <div>
              <dt>{t('Doğum tarihi')}</dt>
              <dd>
                {customer.birthDate
                  ? `${new Date(customer.birthDate).toLocaleDateString(locale())}${
                      customer.age !== null ? ` · ${customer.age}` : ''
                    }`
                  : '—'}
              </dd>
            </div>
            <div>
              <dt>{t('Nereden geldi?')}</dt>
              <dd>{customer.source ?? '—'}</dd>
            </div>
          </dl>

          {(customer.injuryNote || customer.allergyNote) && (
            <>
              <h5 className="facts-label">{t('Sağlık')}</h5>
              <p className="alertline">
                {customer.injuryNote && <span className="alert-tag">{customer.injuryNote}</span>}
                {customer.allergyNote && <span className="alert-tag">{customer.allergyNote}</span>}
              </p>
            </>
          )}

          {(customer.guardianName || customer.guardianPhone) && (
            <p className="cell-dim">
              {t('Veli')}: {customer.guardianName ?? '—'}{' '}
              {customer.guardianPhone ? `· ${customer.guardianPhone}` : ''}
            </p>
          )}

          {(customer.emergency1Name || customer.emergency2Name) && (
            <p className="cell-dim">
              {t('Acil durumda aranacak')}:{' '}
              {[
                [customer.emergency1Name, customer.emergency1Phone],
                [customer.emergency2Name, customer.emergency2Phone],
              ]
                .filter(([n]) => n)
                .map(([n, p]) => `${n}${p ? ` (${p})` : ''}`)
                .join(' · ')}
            </p>
          )}
        </section>

        <section className="drawer-block">
          <h4 className="panel-title">{t('Segment')}</h4>
          <div className="chipset">
            {SEGMENTS.map((s) => {
              const on = segments.includes(s);
              const tone = segmentTone(s);
              return (
                <button
                  key={s}
                  type="button"
                  className={`chip${on ? ' is-on' : ''}${tone ? ` chip--${tone}` : ''}`}
                  onClick={() => toggleSegment(s)}
                  disabled={busy}
                  aria-pressed={on}
                >
                  {t(SEGMENT_LABEL[s])}
                </button>
              );
            })}
          </div>
        </section>

        <section className="drawer-block">
          <h4 className="panel-title">{t('Notlar')}</h4>
          <div className="note-add">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              placeholder={t('Bu müşteri hakkında bir not…')}
            />
            <button className="btn btn--small" onClick={saveNote} disabled={busy || !draft.trim()}>
              {t('Ekle')}
            </button>
          </div>
          {notes.length === 0 ? (
            <p className="cell-dim">{t('Henüz not yok.')}</p>
          ) : (
            <ul className="notes">
              {notes.map((n) => (
                <li key={n.id}>
                  <p>{n.body}</p>
                  <div className="note-foot">
                    <span className="cell-dim">
                      {new Date(n.createdAt).toLocaleDateString(locale())}
                    </span>
                    <button className="link-btn danger" onClick={() => removeNote(n.id)}>
                      {t('Sil')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <small className="field-hint">{t('Notları yalnızca yöneticiler görür.')}</small>
        </section>

        <section className="drawer-block">
          <h4 className="panel-title">{t('Ders geçmişi')}</h4>
          {history.length === 0 ? (
            <p className="cell-dim">{t('Kayıtlı ders yok.')}</p>
          ) : (
            <ul className="history">
              {history.map((b) => (
                <li key={b.id} className={`is-${lessonClass(b)}`}>
                  <span className="history-when">
                    {new Date(b.startsAt).toLocaleDateString(locale(), {
                      day: 'numeric',
                      month: 'short',
                    })}{' '}
                    · {b.instructorName}
                  </span>
                  <span className="cell-dim">
                    {formatTime(b.startsAt)} · {describeLesson(b)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        {editing && (
          <CustomerForm
            customer={customer}
            onClose={() => setEditing(false)}
            onSaved={() => {
              setEditing(false);
              onChanged();
            }}
          />
        )}
      </aside>
    </div>
  );
}
