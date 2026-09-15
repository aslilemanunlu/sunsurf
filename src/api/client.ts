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
  Block,
  Booking,
  BookingStatus,
  DirectoryUser,
  Instructor,
  CustomerRef,
  Interest,
  LessonType,
  ManagedBooking,
  Profile,
  Role,
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
  group_size: number | null;
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
        .select('instructor_id,starts_at,status,lesson_type,group_size')
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

/** Your own bookings. RLS makes this your rows and nobody else's. */
export async function listMyBookings(): Promise<Booking[]> {
  const rows = await read<BookingRow[]>(
    () => neon.from('bookings').select('*').order('starts_at'),
    'Rezervasyonlarınız yüklenemedi',
  );
  return rows.map(toBooking);
}

/**
 * `user_id` is deliberately not sent — the column defaults to auth.user_id(), so
 * the database takes it from the JWT and a client cannot book as someone else.
 */
/**
 * Creates a booking.
 *
 * `user_id` is only sent when staff book on somebody else's behalf; left off,
 * the column defaults to auth.user_id() so a customer cannot book as anyone but
 * themselves. A database trigger decides the initial status: a customer's own
 * request starts pending, anything staff enter is already approved.
 */
export async function createBooking(input: {
  instructorId: string;
  startsAt: string;
  durationHours: number;
  lessonType: LessonType;
  sport?: Sport | null;
  groupSize?: number | null;
  /** Staff only: who the lesson is for. */
  userId?: string;
}): Promise<Booking> {
  const row: Record<string, unknown> = {
    instructor_id: input.instructorId,
    starts_at: input.startsAt,
    duration_hours: input.durationHours,
    lesson_type: input.lessonType,
    sport: input.lessonType === 'kids_camp' ? null : (input.sport ?? null),
    group_size: input.lessonType === 'group' ? (input.groupSize ?? null) : null,
  };
  if (input.userId) row.user_id = input.userId;

  const result = (await neon.from('bookings').insert(row).select('*')) as Result<BookingRow[]>;

  // 23P01: the exclusion constraint refused an overlap — a pending booking
  // locks its hours just as firmly as an approved one.
  if (result.error?.code === '23P01') {
    throw new Error(translate('Bu saatler az önce doldu. Lütfen başka bir saat seçin.'));
  }
  if (result.error?.code === '42501') {
    throw new Error(translate('Rezervasyon için önce profilinizi tamamlamanız gerekiyor.'));
  }
  return toBooking(unwrap(result, 'Rezervasyon oluşturulamadı')[0]);
}

export async function cancelBooking(bookingId: string): Promise<void> {
  const result = await neon.from('bookings').delete().eq('id', bookingId);
  if (result.error) throw new Error(`${translate("Rezervasyon iptal edilemedi")}: ${result.error.message}`);
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
  customer_full_name: string | null;
  customer_phone: string | null;
  customer_interests: string[] | null;
};

function toManaged(r: ManagedRow): ManagedBooking {
  return {
    id: r.id,
    instructorId: r.instructor_id,
    instructorName: r.instructor_name.trim(),
    startsAt: r.starts_at,
    durationHours: r.duration_hours,
    lessonType: r.lesson_type as LessonType,
    sport: r.sport as Sport | null,
    groupSize: r.group_size,
    status: r.status as BookingStatus,
    customerName: r.customer_full_name ?? r.customer_name,
    customerEmail: r.customer_email,
    customerPhone: r.customer_phone,
    customerInterests: (r.customer_interests ?? []) as Interest[],
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
 * Approve or reject. Only the status is sent: a database trigger rejects any
 * other change from someone who is not the customer, and stamps who decided.
 */
export async function decideBooking(
  bookingId: string,
  status: Extract<BookingStatus, 'approved' | 'rejected'>,
): Promise<void> {
  const result = await neon.from('bookings').update({ status }).eq('id', bookingId);
  if (result.error) throw new Error(`${translate("Karar kaydedilemedi")}: ${result.error.message}`);
}

// -------------------------------------------------------------- profiles

type ProfileRow = {
  user_id: string;
  full_name: string;
  phone: string;
  interests: string[];
};

/** Null when the account has not completed its profile yet. */
export async function getProfile(): Promise<Profile | null> {
  const rows = await read<ProfileRow[]>(
    () => neon.from('profiles').select('*').limit(1),
    'Profil okunamadı',
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    userId: r.user_id,
    fullName: r.full_name,
    phone: r.phone,
    interests: (r.interests ?? []) as Interest[],
  };
}

export async function saveProfile(input: {
  fullName: string;
  phone: string;
  interests: Interest[];
}): Promise<void> {
  const result = await neon.from('profiles').upsert(
    {
      full_name: input.fullName,
      phone: input.phone,
      interests: input.interests,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (result.error) throw new Error(`${translate("Profil kaydedilemedi")}: ${result.error.message}`);
}

// --------------------------------------------------------------- roles

type RoleRow = { user_id: string; role: string; instructor_id: string | null };

/** No row means customer, so signing up needs no server-side hook. */
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
  phone: string | null;
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
    phone: r.phone,
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

/** Who staff may book on behalf of. Empty for a plain customer.  */
export async function listCustomers(): Promise<CustomerRef[]> {
  const rows = await read<{ user_id: string; name: string | null; email: string; phone: string | null }[]>(
    () => neon.from('customer_directory').select('*').order('name'),
    'Kullanıcılar yüklenemedi',
  );
  return rows.map((r) => ({ userId: r.user_id, name: r.name, email: r.email, phone: r.phone }));
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

  const [users, instructors, bookings, thisMonth] = await Promise.all([
    countOf('admin_users', 'user_id'),
    countOf('instructors', 'id'),
    countOf('bookings', 'id'),
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

  const staff = await countOf('admin_users', 'user_id', (q) => q.neq('role', 'customer'));

  return {
    users,
    instructors,
    students: Math.max(0, users - staff),
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
};

export async function listInstructorsAdmin(): Promise<InstructorAdmin[]> {
  const rows = await read<{
    id: string;
    name: string;
    sports: string[];
    bio: string;
    email: string | null;
    phone: string | null;
    linked_user_id: string | null;
  }[]>(() => neon.from('instructor_admin').select('*').order('name'), 'Eğitmenler yüklenemedi');

  return rows.map((r) => ({
    id: r.id,
    name: r.name.trim(),
    sports: r.sports as Sport[],
    bio: r.bio,
    email: r.email,
    phone: r.phone,
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
