/**
 * The only module that touches data.
 *
 * Everything goes through the Neon Data API (PostgREST over HTTPS). There is no
 * server of ours in the middle: the session JWT rides along with each request and
 * the RLS policies in db/ decide what the caller may see and write.
 *
 * Availability is never read from a table — it is derived from `busy_hours` and
 * `instructor_blocks` against the fixed working hours in lib/hours.ts.
 *
 * Postgres columns are snake_case and the app's types are camelCase; the mapping
 * lives here so no component has to know about either.
 */
import type {
  Agreement,
  AgreementKind,
  Block,
  Booking,
  BookingStatus,
  CrmCustomer,
  CustomerDetails,
  CustomerNote,
  DirectoryUser,
  KidsCampEntry,
  Instructor,
  CustomerRef,
  LessonType,
  ManagedBooking,
  Payment,
  Role,
  Segment,
  Sport,
  Viewer,
} from '../types';
import { fromDateKey } from '../lib/date';
import { translate } from '../lib/i18n';
import { neon } from '../neon';

type Result<T> = { data: T | null; error: { message: string; code?: string } | null };

/** PostgREST reports failures in the payload rather than throwing. */
function unwrap<T>(result: Result<T>, what: string): T {
  if (result.error) throw new Error(`${translate(what)}: ${result.error.message}`);
  if (result.data === null) throw new Error(`${translate(what)}: no data returned`);
  return result.data;
}

/**
 * Runs a read, retrying once if it comes back aborted.
 *
 * The Data API rejects requests with no JWT, so a signed-out visitor's first
 * call has to mint an anonymous token first. On an origin that has never done
 * that, the very first request loses that race and aborts — reproducibly, on
 * the first page load of a fresh origin, and never afterwards. One retry
 * settles it, by which time the token exists. A genuine failure still surfaces,
 * because the retry reports its own error.
 *
 * `build` must construct the query afresh: a PostgREST builder is a one-shot
 * thenable and cannot be awaited twice.
 */
async function read<T>(build: () => PromiseLike<Result<T>>, what: string): Promise<T> {
  const first = await build();
  if (first.error && /abort/i.test(first.error.message)) {
    return unwrap(await build(), what);
  }
  return unwrap(first, what);
}

/** Local midnight either side of a day, as the instants Postgres compares against. */
function dayBounds(dateKey: string): { from: string; to: string } {
  const start = fromDateKey(dateKey);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

// ---------------------------------------------------------------- instructors

type InstructorRow = { id: string; name: string; sports: string[]; bio: string };

function toInstructor(row: InstructorRow): Instructor {
  return {
    id: row.id,
    name: row.name.trim(),
    sports: row.sports as Sport[],
    bio: row.bio,
  };
}

export async function listInstructors(): Promise<Instructor[]> {
  const rows = await read<InstructorRow[]>(
    // explicit columns: the table has column-level grants so that instructor
    // emails stay out of the public read path, and '*' would be refused
    () => neon.from('instructors').select('id,name,sports,bio').order('name'),
    'Eğitmenler yüklenemedi',
  );
  return rows.map(toInstructor);
}

// ------------------------------------------------------------------ the day

export type BusyRow = {
  instructor_id: string;
  starts_at: string;
  status: BookingStatus;
  lesson_type: LessonType;
};

/**
 * Which hours are taken, across every instructor, without saying by whom.
 * Booking rows stay private to their owner; this view is the public signal.
 */
export async function listBusyHours(dateKey: string): Promise<BusyRow[]> {
  const { from, to } = dayBounds(dateKey);
  return read<BusyRow[]>(
    () =>
      neon
        .from('busy_hours')
        .select('instructor_id,starts_at,status,lesson_type')
        .gte('starts_at', from)
        .lt('starts_at', to),
    'Dolu saatler yüklenemedi',
  );
}

type BlockRow = { id: string; instructor_id: string; starts_at: string };

export async function listBlockedHours(dateKey: string): Promise<Block[]> {
  const { from, to } = dayBounds(dateKey);
  const rows = await read<BlockRow[]>(
    () =>
      neon
        .from('instructor_blocks')
        .select('id,instructor_id,starts_at')
        .gte('starts_at', from)
        .lt('starts_at', to),
    'Kapalı saatler yüklenemedi',
  );
  return rows.map((r) => ({ id: r.id, instructorId: r.instructor_id, startsAt: r.starts_at }));
}

// ------------------------------------------------------------------ bookings

type BookingRow = {
  id: string;
  instructor_id: string;
  starts_at: string;
  duration_hours: number;
  lesson_type: string;
  sport: string | null;
  group_size: number | null;
  status: string;
  created_at: string;
};

function toBooking(row: BookingRow): Booking {
  return {
    id: row.id,
    instructorId: row.instructor_id,
    startsAt: row.starts_at,
    durationHours: row.duration_hours,
    lessonType: row.lesson_type as LessonType,
    sport: row.sport as Sport | null,
    groupSize: row.group_size,
    status: row.status as BookingStatus,
    createdAt: row.created_at,
  };
}

/**
 * Writes a lesson onto an instructor's calendar.
 *
 * Only staff get here — an admin for anyone, an instructor for themselves — and
 * the insert policy in db/009 is what holds that line. `customerId` names the
 * person the lesson is for; they have no account, so nothing about the caller
 * identifies them.
 */
export async function createBooking(input: {
  instructorId: string;
  startsAt: string;
  durationHours: number;
  lessonType: LessonType;
  sport?: Sport | null;
  groupSize?: number | null;
  customerId: string;
  /** The package this lesson comes off, when there is one. */
  agreementId?: string | null;
  /** An enquiry that is not settled yet. */
  tentative?: boolean;
}): Promise<Booking> {
  const row: Record<string, unknown> = {
    instructor_id: input.instructorId,
    starts_at: input.startsAt,
    duration_hours: input.durationHours,
    lesson_type: input.lessonType,
    sport: input.lessonType === 'kids_camp' ? null : (input.sport ?? null),
    group_size: input.lessonType === 'group' ? (input.groupSize ?? null) : null,
    customer_id: input.customerId,
    agreement_id: input.agreementId ?? null,
    status: input.tentative ? 'pending' : 'approved',
  };

  const result = (await neon.from('bookings').insert(row).select('*')) as Result<BookingRow[]>;

  // 23P01: the exclusion constraint refused an overlap — a pending booking
  // locks its hours just as firmly as an approved one.
  if (result.error?.code === '23P01') {
    throw new Error(translate('Bu saatler az önce doldu. Lütfen başka bir saat seçin.'));
  }
  return toBooking(unwrap(result, 'Rezervasyon oluşturulamadı')[0]);
}

/**
 * Asks for the deleted row back, because a delete that row-level security
 * filters out is not an error: it matches nothing and succeeds having done
 * nothing. An empty result is the refusal — almost always the cancellation
 * window in db/007.
 */
export async function cancelBooking(bookingId: string): Promise<void> {
  const result = await neon.from('bookings').delete().eq('id', bookingId).select('id');
  if (result.error) {
    throw new Error(`${translate('Rezervasyon iptal edilemedi')}: ${result.error.message}`);
  }
  if (!result.data || result.data.length === 0) {
    throw new Error(
      translate('Ders başlamasına 12 saatten az kaldı; iptal için eğitmeninizle görüşün.'),
    );
  }
}

// ------------------------------------------------- instructor's own calendar

export async function blockHour(instructorId: string, startsAt: string): Promise<void> {
  const result = await neon
    .from('instructor_blocks')
    .insert({ instructor_id: instructorId, starts_at: startsAt });
  if (result.error) throw new Error(`${translate("Saat kapatılamadı")}: ${result.error.message}`);
}

export async function unblockHour(blockId: string): Promise<void> {
  const result = await neon.from('instructor_blocks').delete().eq('id', blockId);
  if (result.error) throw new Error(`${translate("Saat açılamadı")}: ${result.error.message}`);
}

type ManagedRow = {
  id: string;
  customer_id: string | null;
  instructor_id: string;
  instructor_name: string;
  starts_at: string;
  duration_hours: number;
  lesson_type: string;
  sport: string | null;
  group_size: number | null;
  status: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_segments: string[] | null;
};

function toManaged(r: ManagedRow): ManagedBooking {
  return {
    id: r.id,
    customerId: r.customer_id,
    instructorId: r.instructor_id,
    instructorName: r.instructor_name.trim(),
    startsAt: r.starts_at,
    durationHours: r.duration_hours,
    lessonType: r.lesson_type as LessonType,
    sport: r.sport as Sport | null,
    groupSize: r.group_size,
    status: r.status as BookingStatus,
    customerName: r.customer_name,
    customerEmail: r.customer_email,
    customerPhone: r.customer_phone,
    customerSegments: (r.customer_segments ?? []) as Segment[],
  };
}

/**
 * Bookings the viewer may act on. The view decides the scope: an instructor
 * gets their own calendar, an admin gets everyone's, anyone else gets nothing.
 * There is no filtering here to forget.
 */
export async function listManagedBookings(dateKey: string): Promise<ManagedBooking[]> {
  const { from, to } = dayBounds(dateKey);
  const rows = await read<ManagedRow[]>(
    () =>
      neon.from('managed_bookings').select('*').gte('starts_at', from).lt('starts_at', to),
    'Ders listesi yüklenemedi',
  );
  return rows.map(toManaged);
}

/** Everything still waiting on a decision, any day. */
export async function listPendingRequests(): Promise<ManagedBooking[]> {
  const rows = await read<ManagedRow[]>(
    () =>
      neon.from('managed_bookings').select('*').eq('status', 'pending').order('starts_at'),
    'Talepler yüklenemedi',
  );
  return rows.map(toManaged);
}

/**
 * Settles a tentative booking, or drops one. Staff only, on a calendar they
 * hold — the update policy in db/009 decides which.
 */
export async function decideBooking(
  bookingId: string,
  status: Extract<BookingStatus, 'approved' | 'rejected'>,
): Promise<void> {
  const result = await neon.from('bookings').update({ status }).eq('id', bookingId);
  if (result.error) throw new Error(`${translate("Karar kaydedilemedi")}: ${result.error.message}`);
}

// ------------------------------------------------------------------- viewer

type RoleRow = {
  user_id: string;
  role: string;
  instructor_id: string | null;
};

/**
 * What this account may do. An account with no row here can read the public
 * schedule and nothing else — which is every account until an admin gives it
 * a job.
 */
export async function getViewer(): Promise<Viewer> {
  const rows = await read<RoleRow[]>(
    () => neon.from('user_roles').select('user_id,role,instructor_id').limit(1),
    'Rolünüz okunamadı',
  );
  if (rows.length === 0) return { role: 'customer', instructorId: null };
  return { role: rows[0].role as Role, instructorId: rows[0].instructor_id };
}

type DirectoryRow = {
  user_id: string;
  email: string;
  name: string | null;
  role: string;
  instructor_id: string | null;
  email_verified: boolean | null;
  created_at: string | null;
};

/** The admin panel's user list. Returns nothing unless you are an admin. */
export async function listUsers(): Promise<DirectoryUser[]> {
  const rows = await read<DirectoryRow[]>(
    () => neon.from('admin_users').select('*').order('email'),
    'Kullanıcılar yüklenemedi',
  );
  return rows.map((r) => ({
    userId: r.user_id,
    email: r.email,
    name: r.name,
    role: r.role as Role,
    instructorId: r.instructor_id,
    emailVerified: r.email_verified ?? false,
    createdAt: r.created_at,
  }));
}

export async function setUserRole(
  userId: string,
  role: Role,
  instructorId: string | null,
): Promise<void> {
  const result = await neon.from('user_roles').upsert(
    {
      user_id: userId,
      role,
      instructor_id: role === 'instructor' ? instructorId : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (result.error) throw new Error(`${translate("Rol güncellenemedi")}: ${result.error.message}`);
}

// ------------------------------------------------- bulk closing and moving

/**
 * Closes every open hour across a date range. Blocking is per hour, so a "close
 * this week" is just a lot of rows; duplicates are ignored so a range that
 * overlaps an already-closed day is harmless.
 */
export async function blockRange(
  instructorId: string,
  hours: string[],
): Promise<void> {
  if (hours.length === 0) return;
  const result = await neon.from('instructor_blocks').upsert(
    hours.map((starts_at) => ({ instructor_id: instructorId, starts_at })),
    { onConflict: 'instructor_id,starts_at', ignoreDuplicates: true },
  );
  if (result.error) throw new Error(`${translate("Saatler kapatılamadı")}: ${result.error.message}`);
}

/** Reopens everything closed inside the range. */
export async function unblockRange(
  instructorId: string,
  fromISO: string,
  toISO: string,
): Promise<void> {
  const result = await neon
    .from('instructor_blocks')
    .delete()
    .eq('instructor_id', instructorId)
    .gte('starts_at', fromISO)
    .lt('starts_at', toISO);
  if (result.error) throw new Error(`${translate("Saatler açılamadı")}: ${result.error.message}`);
}

/** How many bookings already sit in a range — worth knowing before closing it. */
export async function countBookingsInRange(
  instructorId: string,
  fromISO: string,
  toISO: string,
): Promise<number> {
  const rows = await read<{ id: string }[]>(
    () =>
      neon
        .from('managed_bookings')
        .select('id')
        .eq('instructor_id', instructorId)
        .gte('starts_at', fromISO)
        .lt('starts_at', toISO)
        .neq('status', 'rejected'),
    'Mevcut dersler sayılamadı',
  );
  return rows.length;
}

/**
 * Admin only. The database trigger lets an admin change the time; it refuses the
 * same edit from an instructor, and the exclusion constraint still refuses a
 * move that lands on top of another booking.
 */
export async function moveBooking(
  bookingId: string,
  startsAt: string,
  durationHours: number,
): Promise<void> {
  const result = await neon
    .from('bookings')
    .update({ starts_at: startsAt, duration_hours: durationHours })
    .eq('id', bookingId);
  if (result.error?.code === '23P01') {
    throw new Error(translate('Bu saatler dolu. Başka bir saat seçin.'));
  }
  if (result.error) throw new Error(`${translate("Ders taşınamadı")}: ${result.error.message}`);
}

/** Who staff may book. Empty for anyone who is not staff. */
export async function listCustomers(): Promise<CustomerRef[]> {
  const rows = await read<
    { customer_id: string; name: string; email: string | null; phone: string | null }[]
  >(
    () => neon.from('customer_directory').select('*').order('name'),
    'Müşteriler yüklenemedi',
  );
  return rows.map((r) => ({
    customerId: r.customer_id,
    name: r.name,
    email: r.email,
    phone: r.phone,
  }));
}

/** Maps the optional half of a customer record onto its columns. */
function detailRow(d: CustomerDetails): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  const text = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);
  if (d.phone !== undefined) row.phone = text(d.phone);
  if (d.email !== undefined) row.email = d.email?.trim().toLowerCase() || null;
  if (d.birthDate !== undefined) row.birth_date = d.birthDate || null;
  if (d.source !== undefined) row.source = text(d.source);
  if (d.injuryNote !== undefined) row.injury_note = text(d.injuryNote);
  if (d.allergyNote !== undefined) row.allergy_note = text(d.allergyNote);
  if (d.emergency1Name !== undefined) row.emergency1_name = text(d.emergency1Name);
  if (d.emergency1Phone !== undefined) row.emergency1_phone = text(d.emergency1Phone);
  if (d.emergency2Name !== undefined) row.emergency2_name = text(d.emergency2Name);
  if (d.emergency2Phone !== undefined) row.emergency2_phone = text(d.emergency2Phone);
  if (d.guardianName !== undefined) row.guardian_name = text(d.guardianName);
  if (d.guardianPhone !== undefined) row.guardian_phone = text(d.guardianPhone);
  if (d.segments !== undefined) row.segments = d.segments;
  return row;
}

/** Adds a customer record. Staff type these in; nobody signs up. */
export async function createCustomer(
  input: CustomerDetails & { fullName: string },
): Promise<string> {
  const result = (await neon
    .from('customers')
    .insert({ full_name: input.fullName.trim(), ...detailRow(input) })
    .select('id')) as Result<{ id: string }[]>;
  if (result.error) {
    throw new Error(`${translate('Müşteri eklenemedi')}: ${result.error.message}`);
  }
  const rows = unwrap(result, 'Müşteri eklenemedi');
  return rows[0].id;
}

export async function updateCustomer(
  customerId: string,
  patch: CustomerDetails & { fullName?: string },
): Promise<void> {
  const row = detailRow(patch);
  if (patch.fullName !== undefined) row.full_name = patch.fullName.trim();

  const result = await neon.from('customers').update(row).eq('id', customerId).select('id');
  if (result.error) {
    throw new Error(`${translate('Müşteri kaydedilemedi')}: ${result.error.message}`);
  }
  if (!result.data || result.data.length === 0) {
    throw new Error(translate('Müşteri kaydedilemedi'));
  }
}

/** Refused by a foreign key while the customer still has lessons on record. */
export async function deleteCustomer(customerId: string): Promise<void> {
  const result = await neon.from('customers').delete().eq('id', customerId).select('id');
  if (result.error?.code === '23503') {
    throw new Error(translate('Bu müşterinin dersleri var; önce onları silin.'));
  }
  if (result.error) {
    throw new Error(`${translate('Müşteri silinemedi')}: ${result.error.message}`);
  }
  if (!result.data || result.data.length === 0) {
    throw new Error(translate('Müşteri silinemedi'));
  }
}

// ------------------------------------------------------------ admin screens

/**
 * Row counts without pulling the rows.
 *
 * Counts name a real column rather than `*`: `instructors` has column-level
 * grants so that emails stay private, and `*` is refused outright there.
 */
async function countOf(
  table: string,
  column: string,
  apply?: (q: any) => any,
): Promise<number> {
  let q = neon.from(table).select(column, { count: 'exact', head: true });
  if (apply) q = apply(q);
  const { count, error } = (await q) as { count: number | null; error: { message: string } | null };
  if (error) throw new Error(`${translate('Sayım yapılamadı')} (${table}): ${error.message}`);
  return count ?? 0;
}

export type DashboardStats = {
  users: number;
  instructors: number;
  students: number;
  bookings: number;
  hoursThisMonth: number;
};

export async function getDashboardStats(): Promise<DashboardStats> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const [users, instructors, bookings, students, thisMonth] = await Promise.all([
    countOf('admin_users', 'user_id'),
    countOf('instructors', 'id'),
    countOf('bookings', 'id'),
    countOf('customers', 'id'),
    // hours has to be summed, so these rows do come back — one month at a time
    read<{ duration_hours: number }[]>(
      () =>
        neon
          .from('managed_bookings')
          .select('duration_hours')
          .eq('status', 'approved')
          .gte('starts_at', monthStart.toISOString())
          .lt('starts_at', monthEnd.toISOString()),
      'Aylık ders saati hesaplanamadı',
    ),
  ]);

  return {
    users,
    instructors,
    students,
    bookings,
    hoursThisMonth: thisMonth.reduce((sum, r) => sum + r.duration_hours, 0),
  };
}

/** Every booking in a date range. Admin sees all; an instructor sees their own. */
export async function listBookingsBetween(fromISO: string, toISO: string): Promise<ManagedBooking[]> {
  const rows = await read<ManagedRow[]>(
    () =>
      neon
        .from('managed_bookings')
        .select('*')
        .gte('starts_at', fromISO)
        .lt('starts_at', toISO)
        .order('starts_at', { ascending: false }),
    'Rezervasyonlar yüklenemedi',
  );
  return rows.map(toManaged);
}

export type InstructorAdmin = {
  id: string;
  name: string;
  sports: Sport[];
  bio: string;
  email: string | null;
  phone: string | null;
  linkedUserId: string | null;
  createdAt: string | null;
};

export async function listInstructorsAdmin(): Promise<InstructorAdmin[]> {
  const rows = await read<{
    id: string;
    name: string;
    sports: string[];
    bio: string;
    email: string | null;
    phone: string | null;
    created_at: string | null;
    linked_user_id: string | null;
  }[]>(() => neon.from('instructor_admin').select('*').order('name'), 'Eğitmenler yüklenemedi');

  return rows.map((r) => ({
    id: r.id,
    name: r.name.trim(),
    sports: r.sports as Sport[],
    bio: r.bio,
    email: r.email,
    phone: r.phone,
    createdAt: r.created_at,
    linkedUserId: r.linked_user_id,
  }));
}

/**
 * Creates an instructor profile before that person has an account. The email is
 * the key a later sign-up is matched against, so it is stored lower-cased.
 */
export async function createInstructor(input: {
  name: string;
  email: string;
  sports: Sport[];
  phone?: string;
  bio?: string;
}): Promise<void> {
  const id = `ins-${input.email.split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase()}-${Date.now()
    .toString(36)
    .slice(-4)}`;

  const result = await neon.from('instructors').insert({
    id,
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    sports: input.sports,
    phone: input.phone?.trim() || null,
    bio: input.bio?.trim() || '',
  });

  if (result.error?.code === '23505') {
    throw new Error(translate('Bu e-posta ile kayıtlı bir eğitmen zaten var.'));
  }
  if (result.error) throw new Error(`${translate("Eğitmen eklenemedi")}: ${result.error.message}`);
}

// ------------------------------------------------------- management settings

// ------------------------------------------------------------------ customers

type CrmRow = {
  customer_id: string;
  email: string | null;
  name: string;
  phone: string | null;
  birth_date: string | null;
  age: number | null;
  source: string | null;
  injury_note: string | null;
  allergy_note: string | null;
  emergency1_name: string | null;
  emergency1_phone: string | null;
  emergency2_name: string | null;
  emergency2_phone: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  segments: string[] | null;
  created_at: string | null;
  lessons: number;
  hours: number;
  kids_camps: number;
  last_lesson_at: string | null;
  notes: number;
};

function toCustomer(r: CrmRow): CrmCustomer {
  return {
    customerId: r.customer_id,
    email: r.email,
    name: r.name,
    phone: r.phone,
    birthDate: r.birth_date,
    age: r.age === null ? null : Number(r.age),
    source: r.source,
    injuryNote: r.injury_note,
    allergyNote: r.allergy_note,
    emergency1Name: r.emergency1_name,
    emergency1Phone: r.emergency1_phone,
    emergency2Name: r.emergency2_name,
    emergency2Phone: r.emergency2_phone,
    guardianName: r.guardian_name,
    guardianPhone: r.guardian_phone,
    segments: (r.segments ?? []) as Segment[],
    createdAt: r.created_at,
    lessons: Number(r.lessons ?? 0),
    hours: Number(r.hours ?? 0),
    kidsCamps: Number(r.kids_camps ?? 0),
    lastLessonAt: r.last_lesson_at,
    notes: Number(r.notes ?? 0),
  };
}

export async function listCrmCustomers(): Promise<CrmCustomer[]> {
  const rows = await read<CrmRow[]>(
    () => neon.from('crm_customers').select('*').order('name'),
    'Müşteriler yüklenemedi',
  );
  return rows.map(toCustomer);
}

/**
 * Segments are admin-only. An empty result means the policy refused the write —
 * an instructor may add a customer but not reclassify one.
 */
export async function setSegments(customerId: string, segments: Segment[]): Promise<void> {
  const result = await neon
    .from('customers')
    .update({ segments })
    .eq('id', customerId)
    .select('id');
  if (result.error) {
    throw new Error(`${translate('Segment kaydedilemedi')}: ${result.error.message}`);
  }
  if (!result.data || result.data.length === 0) {
    throw new Error(translate('Segment değiştirmek için yönetici olmanız gerekiyor.'));
  }
}

export async function listNotes(customerId: string): Promise<CustomerNote[]> {
  const rows = await read<{ id: string; customer_id: string; body: string; created_at: string }[]>(
    () =>
      neon
        .from('customer_notes')
        .select('id,customer_id,body,created_at')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false }),
    'Notlar yüklenemedi',
  );
  return rows.map((r) => ({
    id: r.id,
    customerId: r.customer_id,
    body: r.body,
    createdAt: r.created_at,
  }));
}

export async function addNote(customerId: string, body: string): Promise<void> {
  const result = await neon
    .from('customer_notes')
    .insert({ customer_id: customerId, body: body.trim() });
  if (result.error) throw new Error(`${translate('Not kaydedilemedi')}: ${result.error.message}`);
}

export async function deleteNote(id: string): Promise<void> {
  const result = await neon.from('customer_notes').delete().eq('id', id);
  if (result.error) throw new Error(`${translate('Not silinemedi')}: ${result.error.message}`);
}

// ----------------------------------------------------------------- kids camp

export async function listKidsCamp(fromISO: string, toISO: string): Promise<KidsCampEntry[]> {
  const rows = await read<
    {
      booking_id: string;
      customer_id: string | null;
      name: string | null;
      email: string | null;
      phone: string | null;
      age: number | null;
      guardian_name: string | null;
      guardian_phone: string | null;
      allergy_note: string | null;
      instructor_name: string | null;
      starts_at: string;
      duration_hours: number;
      status: string;
      segments: string[] | null;
    }[]
  >(
    () =>
      neon
        .from('kids_camp_roll')
        .select('*')
        .gte('starts_at', fromISO)
        .lt('starts_at', toISO)
        .order('starts_at', { ascending: false }),
    'Çocuk kampı listesi yüklenemedi',
  );
  return rows.map((r) => ({
    bookingId: r.booking_id,
    customerId: r.customer_id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    age: r.age === null ? null : Number(r.age),
    guardianName: r.guardian_name,
    guardianPhone: r.guardian_phone,
    allergyNote: r.allergy_note,
    instructorName: r.instructor_name,
    startsAt: r.starts_at,
    durationHours: r.duration_hours,
    status: r.status as BookingStatus,
    segments: (r.segments ?? []) as Segment[],
  }));
}

/** One customer's whole history, for the customer drawer. */
export async function listBookingsForCustomer(customerId: string): Promise<ManagedBooking[]> {
  const rows = await read<ManagedRow[]>(
    () =>
      neon
        .from('managed_bookings')
        .select('*')
        .eq('customer_id', customerId)
        .order('starts_at', { ascending: false }),
    'Rezervasyonlar yüklenemedi',
  );
  return rows.map(toManaged);
}

// ------------------------------------------------------------------ payments

type AgreementRow = {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string | null;
  kind: string;
  plan: string | null;
  label: string | null;
  note: string | null;
  agreed_amount: string | number;
  paid: string | number;
  received: string | number;
  written_off: string | number;
  balance: string | number;
  created_at: string;
  camp_days: string | number | null;
};

/** Postgres `numeric` arrives as a string, because a double cannot hold it. */
const money = (v: string | number | null | undefined): number => Number(v ?? 0);

function toAgreement(r: AgreementRow): Agreement {
  return {
    id: r.id,
    customerId: r.customer_id,
    customerName: r.customer_name,
    customerPhone: r.customer_phone,
    kind: r.kind as AgreementKind,
    plan: r.plan,
    label: r.label,
    note: r.note,
    agreedAmount: money(r.agreed_amount),
    paid: money(r.paid),
    received: money(r.received),
    writtenOff: money(r.written_off),
    balance: money(r.balance),
    createdAt: r.created_at,
    campDays: r.camp_days === null ? null : Number(r.camp_days),
  };
}

export async function listAgreements(): Promise<Agreement[]> {
  const rows = await read<AgreementRow[]>(
    () => neon.from('agreement_balances').select('*').order('created_at', { ascending: false }),
    'Ödemeler yüklenemedi',
  );
  return rows.map(toAgreement);
}

export async function createAgreement(input: {
  customerId: string;
  kind: AgreementKind;
  plan: string | null;
  label?: string;
  agreedAmount: number;
  note?: string;
}): Promise<string> {
  const result = (await neon
    .from('agreements')
    .insert({
      customer_id: input.customerId,
      kind: input.kind,
      plan: input.plan,
      label: input.label?.trim() || null,
      agreed_amount: input.agreedAmount,
      note: input.note?.trim() || null,
    })
    .select('id')) as Result<{ id: string }[]>;
  if (result.error) {
    throw new Error(`${translate('Anlaşma kaydedilemedi')}: ${result.error.message}`);
  }
  return unwrap(result, 'Anlaşma kaydedilemedi')[0].id;
}

export async function updateAgreement(
  id: string,
  patch: { agreedAmount?: number; plan?: string | null; label?: string | null; note?: string | null },
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.agreedAmount !== undefined) row.agreed_amount = patch.agreedAmount;
  if (patch.plan !== undefined) row.plan = patch.plan;
  if (patch.label !== undefined) row.label = patch.label?.trim() || null;
  if (patch.note !== undefined) row.note = patch.note?.trim() || null;

  const result = await neon.from('agreements').update(row).eq('id', id).select('id');
  if (result.error) {
    throw new Error(`${translate('Anlaşma kaydedilemedi')}: ${result.error.message}`);
  }
}

/** Refused while payments still hang off it, which is the point. */
export async function deleteAgreement(id: string): Promise<void> {
  const result = await neon.from('agreements').delete().eq('id', id).select('id');
  if (result.error) {
    throw new Error(`${translate('Anlaşma silinemedi')}: ${result.error.message}`);
  }
  if (!result.data || result.data.length === 0) {
    throw new Error(translate('Anlaşma silinemedi'));
  }
}

export async function listPayments(agreementId: string): Promise<Payment[]> {
  const rows = await read<
    { id: string; agreement_id: string; amount: string | number; kind: string; paid_at: string; note: string | null }[]
  >(
    () =>
      neon
        .from('payments')
        .select('id,agreement_id,amount,kind,paid_at,note')
        .eq('agreement_id', agreementId)
        .order('paid_at', { ascending: false }),
    'Ödemeler yüklenemedi',
  );
  return rows.map((r) => ({
    id: r.id,
    agreementId: r.agreement_id,
    amount: money(r.amount),
    kind: r.kind as 'payment' | 'writeoff',
    paidAt: r.paid_at,
    note: r.note,
  }));
}

/**
 * Records money taken, or clears what is left.
 *
 * A write-off is a payment row rather than a flag on the agreement, so the
 * history still shows what was agreed and what was let go — and the takings
 * total can leave it out.
 */
export async function addPayment(input: {
  agreementId: string;
  amount: number;
  kind?: 'payment' | 'writeoff';
  note?: string;
}): Promise<void> {
  const result = await neon.from('payments').insert({
    agreement_id: input.agreementId,
    amount: input.amount,
    kind: input.kind ?? 'payment',
    note: input.note?.trim() || null,
  });
  if (result.error) {
    throw new Error(`${translate('Ödeme kaydedilemedi')}: ${result.error.message}`);
  }
}

export async function deletePayment(id: string): Promise<void> {
  const result = await neon.from('payments').delete().eq('id', id).select('id');
  if (result.error) {
    throw new Error(`${translate('Ödeme silinemedi')}: ${result.error.message}`);
  }
}

/**
 * Lessons left on each of a customer's packages.
 *
 * Carries no money: an instructor choosing which pack a lesson comes off has no
 * business seeing what it cost. `used` counts the bookings pointing at the
 * package, so cancelling one gives the lesson straight back.
 */
export type OpenPackage = {
  agreementId: string;
  customerId: string;
  plan: string | null;
  label: string | null;
  sold: number;
  used: number;
  remaining: number;
};

export async function listOpenPackages(customerId: string): Promise<OpenPackage[]> {
  const rows = await read<
    {
      agreement_id: string;
      customer_id: string;
      plan: string | null;
      label: string | null;
      sold: number;
      used: number;
      remaining: number;
    }[]
  >(
    () =>
      neon
        .from('open_packages')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at'),
    'Paketler yüklenemedi',
  );
  return rows.map((r) => ({
    agreementId: r.agreement_id,
    customerId: r.customer_id,
    plan: r.plan,
    label: r.label,
    sold: Number(r.sold),
    used: Number(r.used),
    remaining: Number(r.remaining),
  }));
}

/**
 * Writes the same lesson several times over.
 *
 * A ten-lesson pack is usually ten mornings in a row, and writing that one
 * dialog at a time is where an afternoon goes. Occupied hours are skipped
 * rather than failing the whole run — the caller is told how many landed, so
 * "8 of 10" is an answer instead of a silent hole in the week.
 */
export async function createBookingSeries(
  base: Parameters<typeof createBooking>[0],
  dates: Date[],
): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;
  for (const when of dates) {
    try {
      await createBooking({ ...base, startsAt: when.toISOString() });
      created++;
    } catch (err) {
      // 23P01 reaches us as the translated overlap message; anything else is
      // real and should stop the run rather than be counted as "skipped".
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes(translate('Bu saatler az önce doldu. Lütfen başka bir saat seçin.'))) {
        skipped++;
      } else if (created === 0) {
        throw err;
      } else {
        skipped++;
      }
    }
  }
  return { created, skipped };
}
