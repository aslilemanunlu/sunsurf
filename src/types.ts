/** The screens of Neon's auth UI this app knows how to show. */
export type AuthViewName = 'SIGN_IN' | 'SIGN_UP' | 'FORGOT_PASSWORD' | 'RESET_PASSWORD';

export type Sport = 'windsurf' | 'wingfoil';

/**
 * Only staff sign in.
 *
 * `customer` is what an account gets before anyone has given it a job: it can
 * read the public schedule and nothing else. The name is historical — a real
 * customer of the school has no account at all.
 */
export type Role = 'admin' | 'instructor' | 'customer';

export type BookingStatus = 'pending' | 'approved' | 'rejected';

export type LessonType = 'individual' | 'group' | 'kids_camp';

export type Instructor = {
  id: string;
  name: string;
  sports: Sport[];
  bio: string;
};

/** Who is looking. An account with no user_roles row can only read. */
export type Viewer = {
  role: Role;
  /**
   * Yönetici: an admin who may also see and set what instructors are paid.
   * The only thing that separates the two.
   */
  isOwner: boolean;
  /** Set only when this account is linked to an instructor. */
  instructorId: string | null;
};

export type Booking = {
  id: string;
  instructorId: string;
  /** ISO datetime of the first hour booked. */
  startsAt: string;
  durationHours: number;
  lessonType: LessonType;
  /** Null for a kids camp, which has no sport. */
  sport: Sport | null;
  /** 2-4, and only for a group lesson. */
  groupSize: number | null;
  status: BookingStatus;
  createdAt: string;
};

/** An hour an instructor has closed. */
export type Block = {
  id: string;
  instructorId: string;
  startsAt: string;
};

/** How the office classifies a customer. */
export type Segment = 'lesson' | 'storage' | 'rental' | 'kids_camp' | 'windsurf' | 'wingfoil';

/** A booking the viewer is allowed to act on, with who is coming. */
export type ManagedBooking = {
  id: string;
  customerId: string | null;
  /** A one-off nobody is writing down — deliberately not a customer record. */
  isGuest: boolean;
  instructorId: string;
  instructorName: string;
  startsAt: string;
  durationHours: number;
  lessonType: LessonType;
  sport: Sport | null;
  groupSize: number | null;
  status: BookingStatus;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  customerSegments: Segment[];
};

/**
 * Somebody who can sign in, or has been invited to.
 *
 * `pending` rows are invitations: no account exists yet, so `userId` is null
 * and nothing about them can be edited except withdrawing the invitation.
 */
export type DirectoryUser = {
  userId: string | null;
  email: string;
  name: string | null;
  role: Role;
  isOwner: boolean;
  instructorId: string | null;
  instructorName: string | null;
  emailVerified: boolean;
  createdAt: string | null;
  pending: boolean;
};

/** What an admin picks when they give somebody access. One choice, not two. */
export type AccessLevel = 'owner' | 'admin' | 'instructor' | 'none';

/** Someone staff may book. A record typed in by the school, not an account. */
export type CustomerRef = {
  customerId: string;
  name: string;
  email: string | null;
  phone: string | null;
};

/** Everything optional except the name: a walk-in gives you very little. */
export type CustomerDetails = {
  phone?: string | null;
  email?: string | null;
  birthDate?: string | null;
  /** How they found the school. Free text — the useful answers change. */
  source?: string | null;
  /** Anything that changes what should happen on the water. */
  injuryNote?: string | null;
  /** Children, in practice. */
  allergyNote?: string | null;
  emergency1Name?: string | null;
  emergency1Phone?: string | null;
  emergency2Name?: string | null;
  emergency2Phone?: string | null;
  /** For a camp the record is the child; this is who to ring. */
  guardianName?: string | null;
  guardianPhone?: string | null;
  segments?: Segment[];
};

/** A row of the customer list — the record plus what they have actually done. */
export type CrmCustomer = CustomerDetails & {
  customerId: string;
  name: string;
  email: string | null;
  phone: string | null;
  birthDate: string | null;
  /** Worked out from the birth date, never stored. */
  age: number | null;
  segments: Segment[];
  createdAt: string | null;
  lessons: number;
  hours: number;
  kidsCamps: number;
  lastLessonAt: string | null;
  notes: number;
};

/** A note staff keep about a customer. Only an admin can read it. */
export type CustomerNote = {
  id: string;
  customerId: string;
  body: string;
  createdAt: string;
};

/** One kids-camp booking, as the camp roll shows it. */
export type KidsCampEntry = {
  bookingId: string;
  customerId: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  age: number | null;
  guardianName: string | null;
  guardianPhone: string | null;
  allergyNote: string | null;
  instructorName: string | null;
  startsAt: string;
  durationHours: number;
  status: BookingStatus;
  segments: Segment[];
};

/** What was sold. Each has the same money shape; only the detail differs. */
export type AgreementKind = 'lesson' | 'rental' | 'kids_camp' | 'storage' | 'insurance';

/** Rental is a level of kit for a period; the two are chosen together. */
export type EquipmentLevel = 'beginner' | 'freeride' | 'advanced';

/** How an instructor is engaged. */
export type Employment = 'salaried' | 'freelance' | 'other';

/** An agreement with its balance worked out. Admin only. */
export type Agreement = {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  kind: AgreementKind;
  /** Which package or period; 'other' means read `label`. */
  plan: string | null;
  /** Rentals only. */
  equipmentLevel: EquipmentLevel | null;
  /** How many of whatever the plan counts: sessions, hours, days, credits. */
  units: number | null;
  /** Free text: what "other" was, or the child's name for a camp. */
  label: string | null;
  note: string | null;
  agreedAmount: number;
  /** Everything credited against the agreement, write-offs included. */
  paid: number;
  /** Money that actually arrived. */
  received: number;
  writtenOff: number;
  balance: number;
  createdAt: string;
  /** Distinct days booked into a camp; null for every other kind. */
  campDays: number | null;
};

export type Payment = {
  id: string;
  agreementId: string;
  amount: number;
  kind: 'payment' | 'writeoff';
  paidAt: string;
  note: string | null;
};

/** A child signed up for a camp season. Admin only. */
export type CampRegistration = {
  registrationId: string;
  customerId: string;
  season: number;
  childName: string;
  birthDate: string | null;
  age: number | null;
  allergyNote: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  emergency1Name: string | null;
  emergency1Phone: string | null;
  emergency2Name: string | null;
  emergency2Phone: string | null;
  note: string | null;
  /** How many form pages are attached; the images are fetched separately. */
  documents: number;
  /** Camp days and hours actually booked, which is a different question. */
  days: number;
  hours: number;
  createdAt: string;
};

export type CampDocument = {
  id: string;
  filename: string | null;
  /** A data URL. */
  data: string;
  createdAt: string;
};

/** One child, one day, how much of it. Absence is simply no row. */
export type CampAttendance = {
  id: string;
  registrationId: string;
  customerId: string;
  childName: string;
  day: string;
  kind: 'full' | 'half';
};

/** What a child adds up to over a season. */
export type CampAttendanceTotal = {
  registrationId: string;
  customerId: string;
  childName: string;
  fullDays: number;
  halfDays: number;
  /** Halves counted as halves — the question is days, not appearances. */
  totalDays: number;
};
