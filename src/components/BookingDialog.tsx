import { useEffect } from 'react';
import { AuthView } from '@neondatabase/auth-ui';
import type { SlotWithInstructor } from '../types';
import { formatDayLabel, formatTimeRange, toDateKey } from '../lib/date';

type Props = {
  slot: SlotWithInstructor;
  /** When false the dialog asks the visitor to sign in before it will book. */
  signedIn: boolean;
  /** Which of Neon's auth screens to show while signed out. */
  authView: 'SIGN_IN' | 'SIGN_UP' | 'FORGOT_PASSWORD';
  submitting: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
};

const SPORT_LABEL = { windsurf: 'Windsurf', wingfoil: 'Wingfoil' } as const;

export default function BookingDialog({
  slot,
  signedIn,
  authView,
  submitting,
  error,
  onConfirm,
  onClose,
}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const dayKey = toDateKey(new Date(slot.startsAt));

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="booking-title">{signedIn ? 'Book this class' : 'Sign in to book'}</h3>

        <div className="dialog-summary">
          <span className={`tag tag--${slot.sport}`}>{SPORT_LABEL[slot.sport]}</span>
          <p className="dialog-instructor">{slot.instructor.name}</p>
          <p className="dialog-when">
            {formatDayLabel(dayKey)} · {formatTimeRange(slot.startsAt, slot.durationMin)}
          </p>
          <p className="dialog-bio">{slot.instructor.bio}</p>
        </div>

        {error && <p className="dialog-error">{error}</p>}

        {signedIn ? (
          <div className="dialog-actions">
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              Back
            </button>
            <button type="button" className="btn" onClick={onConfirm} disabled={submitting}>
              {submitting ? 'Booking…' : 'Confirm booking'}
            </button>
          </div>
        ) : (
          // Once the session lands, App re-renders this dialog in its signed-in
          // form with the same slot still selected, so the booking carries on.
          <div className="dialog-auth">
            <AuthView view={authView} />
          </div>
        )}
      </div>
    </div>
  );
}
