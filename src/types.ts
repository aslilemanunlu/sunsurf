export type Sport = 'windsurf' | 'wingfoil';

export type Instructor = {
  id: string;
  name: string;
  sports: Sport[];
  bio: string;
};

export type Slot = {
  id: string;
  instructorId: string;
  sport: Sport;
  /** ISO datetime, local time */
  startsAt: string;
  durationMin: number;
};

/** A slot with its instructor resolved — what the list actually renders. */
export type SlotWithInstructor = Slot & { instructor: Instructor };

export type Booking = {
  id: string;
  slotId: string;
  /** Neon Auth user id. Set by the database from the JWT, never by the client. */
  userId: string;
  createdAt: string;
};
