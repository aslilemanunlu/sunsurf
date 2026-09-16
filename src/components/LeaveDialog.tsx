import { useEffect, useState } from 'react';
import type { Instructor, Viewer } from '../types';
import { useT } from '../lib/i18n';
import * as api from '../api/client';
import { addDays, fromDateKey, todayKey } from '../lib/date';
import { openHoursBetween } from '../lib/hours';

type Props = {
  instructors: Instructor[];
  viewer: Viewer;
  onClose: () => void;
  onDone: (message: string) => void;
};

/**
 * Closing whole days at once.
 *
 * Availability is not stored, so "on leave" is the same thing as every working
 * hour in the range being closed — there is no second concept to keep in step.
 * It is a lot of small rows, which is the price of not having an availability
 * table at all.
 *
 * Lessons already booked in the range are counted first and left alone: closing
 * an hour and cancelling a lesson are different decisions, and doing the second
 * one silently would be the wrong kind of helpful.
 */
export default function LeaveDialog({ instructors, viewer, onClose, onDone }: Props) {
  const { t } = useT();
  const own = viewer.role === 'instructor' ? viewer.instructorId : null;
  const [instructorId, setInstructorId] = useState(own ?? instructors[0]?.id ?? '');
  const [from, setFrom] = useState(todayKey());
  const [to, setTo] = useState(todayKey());
  const [busy, setBusy] = useState(false);
  const [booked, setBooked] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // how many lessons are already in the range
  useEffect(() => {
    if (!instructorId) return;
    let cancelled = false;
    const end = fromDateKey(addDays(to, 1));
    api
      .countBookingsInRange(instructorId, fromDateKey(from).toISOString(), end.toISOString())
      .then((n) => !cancelled && setBooked(n))
      .catch(() => !cancelled && setBooked(null));
    return () => {
      cancelled = true;
    };
  }, [instructorId, from, to]);

  const days =
    Math.round((fromDateKey(to).getTime() - fromDateKey(from).getTime()) / 86_400_000) + 1;
  const valid = instructorId !== '' && days > 0;

  async function close() {
    setBusy(true);
    setError(null);
    try {
      const hours = openHoursBetween(from, to).map((d) => d.toISOString());
      await api.blockRange(instructorId, hours);
      onDone(t('{n} gün kapatıldı.').replace('{n}', String(days)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const end = fromDateKey(addDays(to, 1));
      await api.unblockRange(instructorId, fromDateKey(from).toISOString(), end.toISOString());
      onDone(t('{n} gün yeniden açıldı.').replace('{n}', String(days)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="leave-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="leave-title">{t('İzin / gün kapatma')}</h3>

        {error && <p className="dialog-error">{error}</p>}

        {viewer.role === 'admin' && (
          <label className="field">
            <span>{t('Hoca')}</span>
            <select value={instructorId} onChange={(e) => setInstructorId(e.target.value)}>
              {instructors.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="money-row">
          <label className="field">
            <span>{t('Başlangıç')}</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="field">
            <span>{t('Bitiş')}</span>
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </div>

        <p className="admin-hint">
          {t('{n} gün, 08:00 – 20:00 arası.').replace('{n}', String(Math.max(days, 0)))}
        </p>

        {booked !== null && booked > 0 && (
          <p className="alertline">
            {t('Bu aralıkta {n} ders var. Kapatmak onları silmez — ayrıca ilgilenmeniz gerekir.').replace(
              '{n}',
              String(booked),
            )}
          </p>
        )}

        <div className="dialog-actions">
          <button type="button" className="btn btn--ghost" onClick={open} disabled={busy || !valid}>
            {t('Yeniden aç')}
          </button>
          <button type="button" className="btn" onClick={close} disabled={busy || !valid}>
            {busy ? t('Kaydediliyor…') : t('Kapat')}
          </button>
        </div>
      </div>
    </div>
  );
}
