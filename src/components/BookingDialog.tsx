import { useEffect, useMemo, useState } from 'react';
import { useT } from '../lib/i18n';
import { AuthView } from '@neondatabase/auth-ui';
import type { CustomerRef, Instructor, LessonType, Sport } from '../types';
import { formatDayLabel, formatTime, toDateKey } from '../lib/date';
import { DURATIONS, OPEN_UNTIL_HOUR } from '../lib/hours';
import { SPORT_LABEL } from '../lib/lessons';

export type NewBooking = {
  lessonType: LessonType;
  sport: Sport | null;
  groupSize: number | null;
  durationHours: number;
  /** Staff only: the customer the lesson is for. */
  userId?: string;
};

type Props = {
  instructor: Instructor;
  startsAt: Date;
  /** Consecutive free hours from startsAt, capped at 3. */
  freeHours: number;
  /** Staff open this with a lesson type already chosen from the cell menu. */
  initialLessonType: LessonType;
  /** True for an instructor or admin: they pick who it is for. */
  staff: boolean;
  customers: CustomerRef[];
  signedIn: boolean;
  hasProfile: boolean;
  authView: 'SIGN_IN' | 'SIGN_UP' | 'FORGOT_PASSWORD';
  submitting: boolean;
  error: string | null;
  onConfirm: (booking: NewBooking) => void;
  onCompleteProfile: () => void;
  onClose: () => void;
};

const GROUP_SIZES = [2, 3, 4];

export default function BookingDialog({
  instructor,
  startsAt,
  freeHours,
  initialLessonType,
  staff,
  customers,
  signedIn,
  hasProfile,
  authView,
  submitting,
  error,
  onConfirm,
  onCompleteProfile,
  onClose,
}: Props) {
  const { t } = useT();
  const [lessonType, setLessonType] = useState<LessonType>(initialLessonType);
  const [sport, setSport] = useState<Sport>(instructor.sports[0] ?? 'windsurf');
  const [groupSize, setGroupSize] = useState(2);
  const [duration, setDuration] = useState(1);
  const [userId, setUserId] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const sorted = useMemo(
    () => [...customers].sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email, 'tr')),
    [customers],
  );

  const dayKey = toDateKey(startsAt);
  const endsAt = new Date(startsAt.getTime() + duration * 60 * 60 * 1000);
  const isCamp = lessonType === 'kids_camp';

  /** A lesson cannot run past closing time, nor into an hour already taken. */
  const allowed = (hours: number) =>
    hours <= freeHours && startsAt.getHours() + hours <= OPEN_UNTIL_HOUR;

  const needsCustomer = staff && userId === '';
  const canSubmit = !submitting && allowed(duration) && !needsCustomer;

  const title = !signedIn
    ? 'Ayırtmak için giriş yapın'
    : !staff && !hasProfile
      ? 'Önce profilinizi tamamlayın'
      : isCamp
        ? 'Çocuk kampı'
        : staff
          ? 'Ders oluştur'
          : 'Ders talebi';

  function submit() {
    onConfirm({
      lessonType,
      sport: isCamp ? null : sport,
      groupSize: lessonType === 'group' ? groupSize : null,
      durationHours: duration,
      userId: staff ? userId : undefined,
    });
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="booking-title">{t(title)}</h3>

        <div className="dialog-summary">
          <p className="dialog-instructor">{instructor.name}</p>
          <p className="dialog-when">
            {formatDayLabel(dayKey)} · {formatTime(startsAt.toISOString())} –{' '}
            {formatTime(endsAt.toISOString())}
          </p>
        </div>

        {error && <p className="dialog-error">{error}</p>}

        {!signedIn ? (
          <div className="dialog-auth">
            <AuthView view={authView} />
          </div>
        ) : !staff && !hasProfile ? (
          <>
            <p className="admin-hint">
              {t('Eğitmenin size ulaşabilmesi için telefon numaranıza ihtiyacımız var.')}
            </p>
            <div className="dialog-actions">
              <button type="button" className="btn btn--ghost" onClick={onClose}>
                {t('Vazgeç')}
              </button>
              <button type="button" className="btn" onClick={onCompleteProfile}>
                {t('Profili tamamla')}
              </button>
            </div>
          </>
        ) : (
          <>
            {staff && (
              <label className="field">
                <span>{t('Kimin adına?')}</span>
                <select value={userId} onChange={(e) => setUserId(e.target.value)}>
                  <option value="">{t('— kullanıcı seçin —')}</option>
                  {sorted.map((c) => (
                    <option key={c.userId} value={c.userId}>
                      {c.name ?? c.email}
                      {c.phone ? ` · ${c.phone}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {/* a kids camp is only ever a kids camp: no sport, no head count */}
            {!isCamp && (
              <>
                <div className="field">
                  <span>{t('Ders tipi')}</span>
                  <div className="segmented segmented--block" role="group" aria-label={t('Ders tipi')}>
                    {(['individual', 'group'] as LessonType[]).map((lt) => (
                      <button
                        key={lt}
                        type="button"
                        className={`segment${lessonType === lt ? ' is-active' : ''}`}
                        onClick={() => setLessonType(lt)}
                        aria-pressed={lessonType === lt}
                      >
                        {lt === 'individual' ? t('Bireysel') : t('Grup')}
                      </button>
                    ))}
                  </div>
                </div>

                {lessonType === 'group' && (
                  <div className="field">
                    <span>{t('Kaç kişi?')}</span>
                    <div className="segmented segmented--block" role="group" aria-label={t('Kişi sayısı')}>
                      {GROUP_SIZES.map((n) => (
                        <button
                          key={n}
                          type="button"
                          className={`segment${groupSize === n ? ' is-active' : ''}`}
                          onClick={() => setGroupSize(n)}
                          aria-pressed={groupSize === n}
                        >
                          {n} {t('kişi')}
                        </button>
                      ))}
                    </div>
                    <small className="field-hint">{t('En fazla 4 kişi.')}</small>
                  </div>
                )}

                {instructor.sports.length > 1 && (
                  <div className="field">
                    <span>{t('Hangi ders?')}</span>
                    <div className="segmented segmented--block" role="group" aria-label={t('Spor seçin')}>
                      {instructor.sports.map((s) => (
                        <button
                          key={s}
                          type="button"
                          className={`segment${sport === s ? ' is-active' : ''}`}
                          onClick={() => setSport(s)}
                          aria-pressed={sport === s}
                        >
                          {SPORT_LABEL[s]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="field">
              <span>{t('Süre')}</span>
              <div className="segmented segmented--block" role="group" aria-label={t('Süre seçin')}>
                {DURATIONS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    className={`segment${duration === h ? ' is-active' : ''}`}
                    onClick={() => setDuration(h)}
                    disabled={!allowed(h)}
                    aria-pressed={duration === h}
                  >
                    {h} {t('saat')}
                  </button>
                ))}
              </div>
              {freeHours < 3 && (
                <small className="field-hint">
                  {t('Bu saatten sonra {n} saat müsait.').replace('{n}', String(freeHours))}
                </small>
              )}
            </div>

            <div className="dialog-actions">
              <button type="button" className="btn btn--ghost" onClick={onClose}>
                {t('Vazgeç')}
              </button>
              <button type="button" className="btn" onClick={submit} disabled={!canSubmit}>
                {submitting ? t('Kaydediliyor…') : staff ? t('Kaydet') : t('Talep gönder')}
              </button>
            </div>

            <p className="admin-hint dialog-foot">
              {t(
                staff
                  ? 'Personelin girdiği ders doğrudan onaylı kaydedilir.'
                  : 'Talebiniz eğitmen onayına gider. Onaya kadar bu saatler size kilitli kalır.',
              )}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
