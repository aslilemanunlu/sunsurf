export type Sport = 'windsurf' | 'wingfoil';

export type Role = 'admin' | 'instructor' | 'customer';

export type BookingStatus = 'pending' | 'approved' | 'rejected';

export type LessonType = 'individual' | 'group' | 'kids_camp';

export type Interest = 'rental' | 'wingfoil' | 'windsurf';

/** Phone and interests are ours; name is mirrored from the auth account. */
export type Profile = {
  userId: string;
  fullName: string;
  phone: string;
  interests: Interest[];
};

export type Instructor = {
  id: string;
  name: string;
  sports: Sport[];
  bio: string;
};

/** Who is looking. A user with no user_roles row is a customer. */
export type Viewer = {
  role: Role;
  /** Set only when this user is linked to an instructor. */
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

/** A booking the viewer is allowed to act on, with who is coming. */
export type ManagedBooking = {
  id: string;
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
  customerInterests: Interest[];
};

/** A row in the admin panel's user list. */
export type DirectoryUser = {
  userId: string;
  email: string;
  name: string | null;
  phone: string | null;
  role: Role;
  instructorId: string | null;
  emailVerified: boolean;
  createdAt: string | null;
};

/** Someone staff may book on behalf of. */
export type CustomerRef = {
  userId: string;
  name: string | null;
  email: string;
  phone: string | null;
};
