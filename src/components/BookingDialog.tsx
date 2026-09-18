import { useEffect, useMemo, useState } from 'react';
import { useT } from '../lib/i18n';
import type { CustomerRef, Instructor, LessonType, Sport } from '../types';
import { formatDayLabel, formatTime, toDateKey } from '../lib/date';
import { durationChoices, repeatDates, OPEN_UNTIL_HOUR, type Repeat } from '../lib/hours';
import { SPORT_LABEL } from '../lib/lessons';
import * as api from '../api/client';
import { planLabel } from '../lib/agreements';

export type NewBooking = {
  lessonType: LessonType;
  sport: Sport | null;
  groupSize: number | null;
  durationHours: number;
  /** The customer the lesson is for. Null for a guest or an unnamed camp. */
  customerId: string | null;
  /** A one-off nobody is writing down. */
  isGuest: boolean;
  /** The package it comes off, when one was chosen. */
  agreementId: string | null;
  /** Every date this lesson should be written on, the first included. */
  dates: Date[];
};

type Props = {
  /** Set when an existing lesson is being changed rather than written. */
  existing?: {
    id: string;
    customerName: string | null;
    isGuest: boolean;
    lessonType: LessonType;
    sport: Sport | null;
    groupSize: number | null;
    durationHours: number;
  };
  instructor: Instructor;
  startsAt: Date;
  /** Consecutive free hours from startsAt. */
  freeHours: number;
  /** Staff open this with a lesson type already chosen from the cell menu. */
  initialLessonType: LessonType;
  /** Hours dragged out on the grid, when that is how this was opened. */
  initialDuration?: number;
  customers: CustomerRef[];
  submitting: boolean;
  error: string | null;
  onConfirm: (booking: NewBooking) => void;
  /** A customer was added from inside the dialog; the list needs reloading. */
  onCustomerAdded: () => void;
  onClose: () => void;
};

const GROUP_SIZES = [2, 3, 4];

/**
 * Writing a lesson onto the calendar.
 *
 * Only staff ever see this. The customer is picked from the school's records or
 * typed in here — somebody who has just walked in has no record yet, and making
 * whoever is on the desk leave the dialog to create one is how a booking gets
 * lost.
 */
export default function BookingDialog({
  existing,
  instructor,
  startsAt,
  freeHours,
  initialLessonType,
  initialDuration,
  customers,
  submitting,
  error,
  onConfirm,
  onCustomerAdded,
  onClose,
}: Props) {
  const { t } = useT();
  const [lessonType, setLessonType] = useState<LessonType>(
    existing?.lessonType ?? initialLessonType,
  );
  const [sport, setSport] = useState<Sport>(existing?.sport ?? instructor.sports[0] ?? 'windsurf');
  const [groupSize, setGroupSize] = useState(existing?.groupSize ?? 2);
  const [duration, setDuration] = useState(
    existing?.durationHours ?? Math.max(1, initialDuration ?? 1),
  );

  /**
   * One field for the customer: type a name, or pick one already there.
   *
   * The two-step "add a customer, then choose them" was a step too many at a
   * desk with somebody waiting. Whatever is typed is matched against the list
   * when saving; no match means a new record, with the phone only if given.
   */
  const [name, setName] = useState(existing?.customerName ?? '');
  /**
   * A hotel guest who turns up once. Writing them into the customer list fills
   * it with names that mean nothing, so the lesson says "nobody" outright
   * instead of being left to look like an unfinished one.
   */
  const [guest, setGuest] = useState(existing?.isGuest ?? false);
  const [phone, setPhone] = useState('');
  const [packages, setPackages] = useState<api.OpenPackage[]>([]);
  const [agreementId, setAgreementId] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [repeat, setRepeat] = useState<Repeat>('none');
  const [times, setTimes] = useState(10);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const sorted = useMemo(
    () => [...customers].sort((a, b) => a.name.localeCompare(b.name, 'tr')),
    [customers],
  );

  /** The record this name already refers to, if any. Matching ignores case. */
  const matched = useMemo(() => {
    const q = name.trim().toLocaleLowerCase('tr');
    if (!q) return null;
    return customers.find((c) => c.name.trim().toLocaleLowerCase('tr') === q) ?? null;
  }, [customers, name]);

  // an existing customer may have packages to spend
  useEffect(() => {
    if (!matched) {
      setPackages([]);
      setAgreementId('');
      return;
    }
    let cancelled = false;
    api
      .listOpenPackages(matched.customerId)
      .then((p) => !cancelled && setPackages(p.filter((x) => x.remaining > 0)))
      .catch(() => {
        // no packages visible is not a reason to block a booking
      });
    return () => {
      cancelled = true;
    };
  }, [matched]);

  const dayKey = toDateKey(startsAt);
  const endsAt = new Date(startsAt.getTime() + duration * 60 * 60 * 1000);
  const isCamp = lessonType === 'kids_camp';

  /** A lesson cannot run past closing time, nor into an hour already taken. */
  const allowed = (hours: number) =>
    // An existing lesson already occupies its own hours, so they are not "free"
    // — without this, editing one could never keep the length it has.
    hours <= Math.max(freeHours, existing?.durationHours ?? 0) &&
    startsAt.getHours() + hours <= OPEN_UNTIL_HOUR;

  const choices = useMemo(
    () => durationChoices(Math.min(freeHours, OPEN_UNTIL_HOUR - startsAt.getHours())),
    [freeHours, startsAt],
  );

  // A camp is not asked who it is for at all: the hour gets blocked out long
  // before anybody knows which children are coming, and the children are named
  // on the season's registration list instead.
  const canSubmit =
    !submitting && !saving && allowed(duration) && (isCamp || guest || name.trim().length >= 2);

  async function submit() {
    setSaving(true);
    setSaveError(null);
    try {
      // A name that is not on the list becomes a record. The phone is optional:
      // for a kids camp especially, the name is all anyone has at that moment.
      let customerId: string | null = guest ? null : (matched?.customerId ?? null);
      if (!guest && !customerId && name.trim().length >= 2) {
        customerId = await api.createCustomer({
          fullName: name,
          phone,
          // what they are here for, taken from what is being written
          segments: isCamp ? ['kids_camp'] : ['lesson', sport],
        });
        onCustomerAdded();
      }
      onConfirm({
        lessonType,
        sport: isCamp ? null : sport,
        groupSize: lessonType === 'group' ? groupSize : null,
        durationHours: duration,
        customerId,
        isGuest: guest,
        agreementId: agreementId || null,
        dates: repeatDates(startsAt, repeat, times),
      });
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
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
        <h3 id="booking-title">
          {t(existing ? 'Dersi düzenle' : isCamp ? 'Çocuk kampı' : 'Ders oluştur')}
        </h3>

        <div className="dialog-summary">
          <p className="dialog-instructor">{instructor.name}</p>
          <p className="dialog-when">
            {formatDayLabel(dayKey)} · {formatTime(startsAt.toISOString())} –{' '}
            {formatTime(endsAt.toISOString())}
          </p>
        </div>

        {(error || saveError) && <p className="dialog-error">{error ?? saveError}</p>}

        {!isCamp && (
          <label className="check check--inline">
            <input type="checkbox" checked={guest} onChange={(e) => setGuest(e.target.checked)} />
            {t('Misafir — kayıt açma')}
          </label>
        )}

        {!isCamp && !guest && (
          <label className="field">
            <span>{t('Kimin adına?')}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              list="customer-names"
              placeholder={t('İsim soyisim — yazın ya da listeden seçin')}
              autoFocus
            />
            <datalist id="customer-names">
              {sorted.map((c) => (
                <option key={c.customerId} value={c.name} />
              ))}
            </datalist>
            <small className="field-hint">
              {matched
                ? t('Kayıtlı müşteri')
                : name.trim().length >= 2
                  ? t('Yeni kayıt açılacak')
                  : ''}
            </small>
          </label>
        )}

        {isCamp && (
          <p className="admin-hint">
            {t('Çocuklar sezon kayıt listesinde tutulur; burada isim sorulmaz.')}
          </p>
        )}

        {!guest && !matched && name.trim().length >= 2 && (
          <label className="field">
            <span>
              {t('Telefon')} ({t('opsiyonel')})
            </span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
            <small className="field-hint">
              {t('Ne yaptığı, yazdığınız dersten anlaşılıyor; ayrıca sormuyoruz.')}
            </small>
          </label>
        )}

        {!isCamp && !guest && packages.length > 0 && (
          <label className="field">
            <span>{t('Hangi paketten düşsün?')}</span>
            <select value={agreementId} onChange={(e) => setAgreementId(e.target.value)}>
              <option value="">{t('Pakete bağlama')}</option>
              {packages.map((p) => (
                <option key={p.agreementId} value={p.agreementId}>
                  {t(planLabel('lesson', p.plan) ?? '—')} · {p.remaining}/{p.sold} {t('kaldı')}
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
                <div
                  className="segmented segmented--block"
                  role="group"
                  aria-label={t('Kişi sayısı')}
                >
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

            <div className="field">
              <span>{t('Hangi ders?')}</span>
              <div className="segmented segmented--block" role="group" aria-label={t('Spor seçin')}>
                {(['windsurf', 'wingfoil'] as Sport[]).map((s) => (
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
              {!instructor.sports.includes(sport) && (
                <small className="field-hint">
                  {t('{n} bu hocanın uzmanlık alanlarında yazılı değil.').replace(
                    '{n}',
                    SPORT_LABEL[sport],
                  )}
                </small>
              )}
            </div>
          </>
        )}

        <div className="field">
          <span>{t('Süre')}</span>
          {choices.length > 4 ? (
            <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              {choices.map((h) => (
                <option key={h} value={h} disabled={!allowed(h)}>
                  {h} {t('saat')}
                </option>
              ))}
            </select>
          ) : (
            <div className="segmented segmented--block" role="group" aria-label={t('Süre seçin')}>
              {choices.map((h) => (
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
          )}
          <small className="field-hint">
            {t('Bu saatten sonra {n} saat müsait.').replace('{n}', String(freeHours))}
          </small>
        </div>

        <div className="field">
          <span>{t('Tekrar')}</span>
          <div className="segmented segmented--block" role="group" aria-label={t('Tekrar')}>
            {(
              [
                ['none', 'Tek sefer'],
                ['daily', 'Her gün'],
                ['weekdays', 'Hafta içi'],
                ['weekly', 'Haftada bir'],
              ] as [Repeat, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`segment${repeat === value ? ' is-active' : ''}`}
                onClick={() => setRepeat(value)}
                aria-pressed={repeat === value}
              >
                {t(label)}
              </button>
            ))}
          </div>
          {repeat !== 'none' && (
            <>
              <label className="field">
                <span>{t('Kaç ders?')}</span>
                <input
                  type="number"
                  min={2}
                  max={40}
                  value={times}
                  onChange={(e) => setTimes(Math.min(40, Math.max(2, Number(e.target.value) || 2)))}
                />
              </label>
              <small className="field-hint">
                {t('Dolu olan saatler atlanır; kaçının yazıldığı söylenir.')}
              </small>
            </>
          )}
        </div>

        <div className="dialog-actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {t('Vazgeç')}
          </button>
          <button type="button" className="btn" onClick={submit} disabled={!canSubmit}>
            {submitting || saving ? t('Kaydediliyor…') : t('Kaydet')}
          </button>
        </div>
      </div>
    </div>
  );
}
