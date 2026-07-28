import { prisma } from "@/lib/db";

export const STAFF_ABSENCE_REASONS = ["sick", "leave", "unavailable", "other"] as const;
export type StaffAbsenceReason = (typeof STAFF_ABSENCE_REASONS)[number];

export function isStaffAbsenceReason(value: string): value is StaffAbsenceReason {
  return (STAFF_ABSENCE_REASONS as readonly string[]).includes(value);
}

/** Calendar date at UTC midnight for DATE columns. */
export function toDateOnly(input: string | Date): Date {
  if (input instanceof Date) {
    return new Date(Date.UTC(input.getFullYear(), input.getMonth(), input.getDate()));
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim());
  if (!match) throw new Error("Date must be YYYY-MM-DD.");
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

export function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function absenceOverlapsDay(startsOn: Date, endsOn: Date, day: Date): boolean {
  const dayOnly = toDateOnly(day);
  const start = toDateOnly(startsOn);
  const end = toDateOnly(endsOn);
  return start.getTime() <= dayOnly.getTime() && end.getTime() >= dayOnly.getTime();
}

export async function listStaffAbsencesForSchool(input: {
  schoolId: string;
  onOrAfter?: Date;
  take?: number;
}) {
  const take = input.take ?? 100;
  return prisma.staffAbsence.findMany({
    where: {
      schoolId: input.schoolId,
      ...(input.onOrAfter
        ? { endsOn: { gte: toDateOnly(input.onOrAfter) } }
        : {}),
    },
    include: {
      schoolTeacher: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
    },
    orderBy: [{ startsOn: "desc" }, { createdAt: "desc" }],
    take,
  });
}

export async function findStaffAbsentTeacherIdsOnDay(input: {
  schoolId: string;
  day: Date;
}): Promise<string[]> {
  const dayOnly = toDateOnly(input.day);
  const rows = await prisma.staffAbsence.findMany({
    where: {
      schoolId: input.schoolId,
      startsOn: { lte: dayOnly },
      endsOn: { gte: dayOnly },
      schoolTeacher: { status: "active" },
    },
    select: { schoolTeacherId: true },
  });
  return [...new Set(rows.map((r) => r.schoolTeacherId))];
}

export async function createStaffAbsence(input: {
  schoolId: string;
  schoolTeacherId: string;
  startsOn: string | Date;
  endsOn: string | Date;
  reason: StaffAbsenceReason;
  note?: string | null;
  createdByUserId?: string | null;
}) {
  const startsOn = toDateOnly(input.startsOn);
  const endsOn = toDateOnly(input.endsOn);
  if (endsOn.getTime() < startsOn.getTime()) {
    return { ok: false as const, status: 400, error: "End date must be on or after start date." };
  }

  const teacher = await prisma.schoolTeacher.findFirst({
    where: { id: input.schoolTeacherId, schoolId: input.schoolId },
    select: { id: true, status: true },
  });
  if (!teacher) {
    return { ok: false as const, status: 404, error: "Staff member not found for this school." };
  }

  const row = await prisma.staffAbsence.create({
    data: {
      schoolId: input.schoolId,
      schoolTeacherId: input.schoolTeacherId,
      startsOn,
      endsOn,
      reason: input.reason,
      note: input.note?.trim() || null,
      createdByUserId: input.createdByUserId ?? null,
    },
  });
  return { ok: true as const, absence: row };
}

export async function clearStaffAbsence(input: {
  schoolId: string;
  absenceId: string;
}) {
  const existing = await prisma.staffAbsence.findFirst({
    where: { id: input.absenceId, schoolId: input.schoolId },
    select: { id: true },
  });
  if (!existing) {
    return { ok: false as const, status: 404, error: "Absence not found." };
  }
  await prisma.staffAbsence.delete({ where: { id: existing.id } });
  return { ok: true as const, absenceId: existing.id };
}