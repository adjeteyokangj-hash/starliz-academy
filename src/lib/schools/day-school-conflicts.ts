import { parseHmToMinutes } from "@/lib/schools/school-day-period";

export type DaySchoolConflictKind = "teacher" | "classroom" | "room";
export type DaySchoolConflictSeverity = "blocking" | "warning";

export type DaySchoolPeriodForConflict = {
  id: string;
  dayOfWeek: number;
  startsAt: string;
  endsAt: string;
  teacherId?: string | null;
  classroomId?: string | null;
  room?: string | null;
  status?: string | null;
  lessonType?: string | null;
};

export type DaySchoolConflict = {
  kind: DaySchoolConflictKind;
  severity: DaySchoolConflictSeverity;
  periodIds: [string, string];
  label: string;
};

function normalizeRoom(room: string | null | undefined): string | null {
  if (!room) return null;
  const trimmed = room.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

export function hmRangesOverlap(startsAtA: string, endsAtA: string, startsAtB: string, endsAtB: string): boolean {
  const aStart = parseHmToMinutes(startsAtA);
  const aEnd = parseHmToMinutes(endsAtA);
  const bStart = parseHmToMinutes(startsAtB);
  const bEnd = parseHmToMinutes(endsAtB);
  if (aStart < 0 || aEnd < 0 || bStart < 0 || bEnd < 0) return false;
  return aStart < bEnd && bStart < aEnd;
}

function isExcludedFromConflict(period: DaySchoolPeriodForConflict): boolean {
  if (period.status === "cancelled") return true;
  const lessonType = (period.lessonType ?? "").toLowerCase();
  return lessonType === "break" || lessonType === "lunch";
}

/**
 * Detect teacher / classroom / room time overlaps within the same weekday template.
 * Teacher + classroom overlaps are blocking; room-string overlaps are warnings only.
 */
export function findDaySchoolConflicts(
  periods: DaySchoolPeriodForConflict[],
): DaySchoolConflict[] {
  const active = periods.filter((p) => !isExcludedFromConflict(p));
  const conflicts: DaySchoolConflict[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      const a = active[i];
      const b = active[j];
      if (a.dayOfWeek !== b.dayOfWeek) continue;
      if (!hmRangesOverlap(a.startsAt, a.endsAt, b.startsAt, b.endsAt)) continue;

      const pairKey = [a.id, b.id].sort().join(":");

      if (a.teacherId && b.teacherId && a.teacherId === b.teacherId) {
        const key = `teacher:${pairKey}`;
        if (!seen.has(key)) {
          seen.add(key);
          conflicts.push({
            kind: "teacher",
            severity: "blocking",
            periodIds: [a.id, b.id],
            label: "Teacher is double-booked across overlapping periods.",
          });
        }
      }

      if (a.classroomId && b.classroomId && a.classroomId === b.classroomId) {
        const key = `classroom:${pairKey}`;
        if (!seen.has(key)) {
          seen.add(key);
          conflicts.push({
            kind: "classroom",
            severity: "blocking",
            periodIds: [a.id, b.id],
            label: "Class is double-booked across overlapping periods.",
          });
        }
      }

      const roomA = normalizeRoom(a.room);
      const roomB = normalizeRoom(b.room);
      if (roomA && roomB && roomA === roomB) {
        const key = `room:${pairKey}`;
        if (!seen.has(key)) {
          seen.add(key);
          conflicts.push({
            kind: "room",
            severity: "warning",
            periodIds: [a.id, b.id],
            label: `Room "${a.room?.trim()}" appears on overlapping periods.`,
          });
        }
      }
    }
  }

  return conflicts;
}

export function conflictsInvolvingPeriod(
  conflicts: DaySchoolConflict[],
  periodId: string,
): DaySchoolConflict[] {
  return conflicts.filter((c) => c.periodIds.includes(periodId));
}

export function summarizeConflictsForPeriod(
  conflicts: DaySchoolConflict[],
  periodId: string,
): { blocking: DaySchoolConflict[]; warnings: DaySchoolConflict[] } {
  const involving = conflictsInvolvingPeriod(conflicts, periodId);
  return {
    blocking: involving.filter((c) => c.severity === "blocking"),
    warnings: involving.filter((c) => c.severity === "warning"),
  };
}

export function formatBlockingConflictError(conflicts: DaySchoolConflict[]): string {
  const blocking = conflicts.filter((c) => c.severity === "blocking");
  if (blocking.length === 0) return "Timetable conflict.";
  const hasTeacher = blocking.some((c) => c.kind === "teacher");
  const hasClassroom = blocking.some((c) => c.kind === "classroom");
  if (hasTeacher && hasClassroom) {
    return "This change would double-book a teacher and a class at the same time.";
  }
  if (hasTeacher) return "This change would double-book a teacher at the same time.";
  if (hasClassroom) return "This change would double-book a class at the same time.";
  return blocking[0]?.label ?? "Timetable conflict.";
}