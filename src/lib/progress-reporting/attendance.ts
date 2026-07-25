/**
 * Parent-safe SchoolDayAttendance aggregator.
 * Never returns teacher note free text.
 */

import { prisma } from "@/lib/db";
import {
  isAttendanceStatus,
  type AttendanceStatus,
} from "@/lib/schools/attendance-status";
import type { AttendanceStatusCounts, AttendanceSummary } from "@/lib/progress-reporting/types";

function emptyCounts(): AttendanceStatusCounts {
  return {
    present: 0,
    late: 0,
    absent: 0,
    authorised_absence: 0,
    medical: 0,
    not_recorded: 0,
  };
}

function ratePct(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return Math.round((part / whole) * 100);
}

export function summarizeAttendanceMarks(
  statuses: string[],
  windowDays: number,
  linkedToSchool: boolean,
): AttendanceSummary {
  const counts = emptyCounts();
  for (const raw of statuses) {
    if (!isAttendanceStatus(raw)) {
      counts.not_recorded += 1;
      continue;
    }
    counts[raw as AttendanceStatus] += 1;
  }
  const totalMarks = statuses.length;
  const recordedMarks = totalMarks - counts.not_recorded;
  return {
    windowDays,
    totalMarks,
    recordedMarks,
    counts,
    presentRatePct: ratePct(counts.present + counts.late, recordedMarks),
    lateRatePct: ratePct(counts.late, recordedMarks),
    absentRatePct: ratePct(counts.absent + counts.authorised_absence + counts.medical, recordedMarks),
    linkedToSchool,
  };
}

export function emptyAttendanceSummary(windowDays: number, linkedToSchool = false): AttendanceSummary {
  return summarizeAttendanceMarks([], windowDays, linkedToSchool);
}

export async function loadAttendanceSummaryForChild(input: {
  childId: string;
  windowDays: number;
  now?: Date;
}): Promise<AttendanceSummary> {
  const windowDays = Math.min(365, Math.max(1, input.windowDays));
  const now = input.now ?? new Date();
  const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  const enrolments = await prisma.schoolStudent.findMany({
    where: { childId: input.childId, status: "active" },
    select: { id: true },
    take: 20,
  });

  if (enrolments.length === 0) {
    return emptyAttendanceSummary(windowDays, false);
  }

  const marks = await prisma.schoolDayAttendance.findMany({
    where: {
      schoolStudentId: { in: enrolments.map((row) => row.id) },
      sessionDate: { gte: since },
    },
    select: { status: true },
    take: 5000,
  });

  return summarizeAttendanceMarks(
    marks.map((row) => row.status),
    windowDays,
    true,
  );
}

export async function loadAttendanceSummariesForChildren(input: {
  childIds: string[];
  windowDays: number;
  schoolId?: string | null;
  now?: Date;
}): Promise<Map<string, AttendanceSummary>> {
  const windowDays = Math.min(365, Math.max(1, input.windowDays));
  const now = input.now ?? new Date();
  const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const childIds = Array.from(new Set(input.childIds.filter(Boolean)));
  const result = new Map<string, AttendanceSummary>();

  for (const childId of childIds) {
    result.set(childId, emptyAttendanceSummary(windowDays, false));
  }
  if (childIds.length === 0) return result;

  const enrolments = await prisma.schoolStudent.findMany({
    where: {
      childId: { in: childIds },
      status: "active",
      ...(input.schoolId ? { schoolId: input.schoolId } : {}),
    },
    select: { id: true, childId: true },
  });

  if (enrolments.length === 0) return result;

  const enrolmentToChild = new Map(enrolments.map((row) => [row.id, row.childId]));
  const marks = await prisma.schoolDayAttendance.findMany({
    where: {
      schoolStudentId: { in: enrolments.map((row) => row.id) },
      sessionDate: { gte: since },
      ...(input.schoolId ? { schoolId: input.schoolId } : {}),
    },
    select: { schoolStudentId: true, status: true },
    take: 20000,
  });

  const byChild = new Map<string, string[]>();
  for (const childId of childIds) byChild.set(childId, []);
  for (const mark of marks) {
    const childId = enrolmentToChild.get(mark.schoolStudentId);
    if (!childId) continue;
    const list = byChild.get(childId) ?? [];
    list.push(mark.status);
    byChild.set(childId, list);
  }

  const linkedChildren = new Set(enrolments.map((row) => row.childId));
  for (const childId of childIds) {
    result.set(
      childId,
      summarizeAttendanceMarks(byChild.get(childId) ?? [], windowDays, linkedChildren.has(childId)),
    );
  }
  return result;
}

export function mergeAttendanceSummaries(
  summaries: AttendanceSummary[],
  windowDays: number,
): AttendanceSummary {
  const counts = emptyCounts();
  let totalMarks = 0;
  let recordedMarks = 0;
  let linked = false;
  for (const summary of summaries) {
    linked = linked || summary.linkedToSchool;
    totalMarks += summary.totalMarks;
    recordedMarks += summary.recordedMarks;
    counts.present += summary.counts.present;
    counts.late += summary.counts.late;
    counts.absent += summary.counts.absent;
    counts.authorised_absence += summary.counts.authorised_absence;
    counts.medical += summary.counts.medical;
    counts.not_recorded += summary.counts.not_recorded;
  }
  return {
    windowDays,
    totalMarks,
    recordedMarks,
    counts,
    presentRatePct: recordedMarks > 0
      ? Math.round(((counts.present + counts.late) / recordedMarks) * 100)
      : null,
    lateRatePct: recordedMarks > 0 ? Math.round((counts.late / recordedMarks) * 100) : null,
    absentRatePct: recordedMarks > 0
      ? Math.round(((counts.absent + counts.authorised_absence + counts.medical) / recordedMarks) * 100)
      : null,
    linkedToSchool: linked,
  };
}
