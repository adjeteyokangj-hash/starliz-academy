/**
 * Audience pack builders for Parent & School Progress Reporting v1.
 * Closed layers are consumed read-only through privacy projection.
 */

import { csvEscape } from "@/lib/csv_escape";
import { prisma } from "@/lib/db";
import { buildMisconceptionCohortSummary } from "@/lib/misconception-analytics";
import {
  emptyAttendanceSummary,
  loadAttendanceSummariesForChildren,
  mergeAttendanceSummaries,
} from "@/lib/progress-reporting/attendance";
import {
  emptyHumanSupportCounts,
  humanSupportCountsFromCohort,
  projectCohortFocusTopics,
  sanitizeFocusTopicsFromSkills,
} from "@/lib/progress-reporting/privacy";
import type {
  CompletionSummary,
  ProgressAudience,
  ProgressPackSummary,
  ProgressStudentRow,
  SanitizedFocusTopic,
} from "@/lib/progress-reporting/types";
import { PROGRESS_REPORTING_VERSION } from "@/lib/progress-reporting/types";

function emptyCompletion(): CompletionSummary {
  return {
    assignmentsTotal: 0,
    assignmentsCompleted: 0,
    assignmentCompletionPct: null,
    averageAccuracyPct: null,
    totalAttempts: 0,
    catchUpOpen: 0,
    catchUpCompleted: 0,
  };
}

function completionPct(completed: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((completed / total) * 100);
}

function mergeCompletion(rows: CompletionSummary[]): CompletionSummary {
  const assignmentsTotal = rows.reduce((sum, row) => sum + row.assignmentsTotal, 0);
  const assignmentsCompleted = rows.reduce((sum, row) => sum + row.assignmentsCompleted, 0);
  const totalAttempts = rows.reduce((sum, row) => sum + row.totalAttempts, 0);
  const weightedAccuracy = rows.reduce((sum, row) => {
    if (row.averageAccuracyPct === null || row.totalAttempts <= 0) return sum;
    return sum + row.averageAccuracyPct * row.totalAttempts;
  }, 0);
  const catchUpOpen = rows.reduce((sum, row) => sum + row.catchUpOpen, 0);
  const catchUpCompleted = rows.reduce((sum, row) => sum + row.catchUpCompleted, 0);
  return {
    assignmentsTotal,
    assignmentsCompleted,
    assignmentCompletionPct: completionPct(assignmentsCompleted, assignmentsTotal),
    averageAccuracyPct: totalAttempts > 0 ? Math.round(weightedAccuracy / totalAttempts) : null,
    totalAttempts,
    catchUpOpen,
    catchUpCompleted,
  };
}

async function loadCompletionByChild(input: {
  childIds: string[];
  since: Date;
}): Promise<Map<string, CompletionSummary>> {
  const map = new Map<string, CompletionSummary>();
  for (const id of input.childIds) map.set(id, emptyCompletion());
  if (input.childIds.length === 0) return map;

  const [attempts, assignments, weakAreas] = await Promise.all([
    prisma.attempt.groupBy({
      by: ["studentId"],
      where: { studentId: { in: input.childIds }, createdAt: { gte: input.since } },
      _count: { id: true },
    }),
    prisma.assignment.findMany({
      where: { studentId: { in: input.childIds }, createdAt: { gte: input.since } },
      select: { studentId: true, status: true },
    }),
    prisma.weakArea.findMany({
      where: { studentId: { in: input.childIds }, lastDetectedAt: { gte: input.since } },
      select: { studentId: true, status: true },
    }),
  ]);

  const correctByStudent = await prisma.attempt.groupBy({
    by: ["studentId"],
    where: {
      studentId: { in: input.childIds },
      createdAt: { gte: input.since },
      correct: true,
    },
    _count: { id: true },
  });

  const attemptTotals = new Map(attempts.map((row) => [row.studentId, row._count.id]));
  const correctTotals = new Map(correctByStudent.map((row) => [row.studentId, row._count.id]));

  for (const childId of input.childIds) {
    const totalAttempts = attemptTotals.get(childId) ?? 0;
    const correct = correctTotals.get(childId) ?? 0;
    const childAssignments = assignments.filter((row) => row.studentId === childId);
    const completed = childAssignments.filter((row) => row.status.toLowerCase() === "completed").length;
    const childWeak = weakAreas.filter((row) => row.studentId === childId);
    const catchUpOpen = childWeak.filter((row) => row.status === "active").length;
    const catchUpCompleted = childWeak.filter((row) => row.status === "resolved").length;
    map.set(childId, {
      assignmentsTotal: childAssignments.length,
      assignmentsCompleted: completed,
      assignmentCompletionPct: completionPct(completed, childAssignments.length),
      averageAccuracyPct: totalAttempts > 0 ? Math.round((correct / totalAttempts) * 100) : null,
      totalAttempts,
      catchUpOpen,
      catchUpCompleted,
    });
  }

  return map;
}

async function buildAudiencePack(input: {
  audience: ProgressAudience;
  studentIds: string[];
  studentMeta: Map<string, { name: string; classroomId: string | null; classroomName: string | null; yearGroup: string | null }>;
  windowDays: number;
  schoolId: string | null;
}): Promise<ProgressPackSummary> {
  const windowDays = Math.min(365, Math.max(1, input.windowDays));
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const studentIds = Array.from(new Set(input.studentIds.filter(Boolean)));
  const nowIso = new Date().toISOString();

  if (studentIds.length === 0) {
    return {
      version: PROGRESS_REPORTING_VERSION,
      audience: input.audience,
      generatedAt: nowIso,
      windowDays,
      schoolId: input.schoolId,
      studentCount: 0,
      totals: {
        completion: emptyCompletion(),
        attendance: emptyAttendanceSummary(windowDays, Boolean(input.schoolId)),
        focusTopics: [],
        humanSupportCounts: emptyHumanSupportCounts(),
      },
      students: [],
      classroomRollups: input.audience === "school_leader" ? [] : undefined,
    };
  }

  const [completionMap, attendanceMap, misconception] = await Promise.all([
    loadCompletionByChild({ childIds: studentIds, since }),
    loadAttendanceSummariesForChildren({
      childIds: studentIds,
      windowDays,
      schoolId: input.schoolId,
    }),
    buildMisconceptionCohortSummary({
      studentIds,
      windowDays,
      schoolId: input.schoolId,
    }),
  ]);

  const students: ProgressStudentRow[] = studentIds.map((studentId) => {
    const meta = input.studentMeta.get(studentId);
    const studentMisconception = misconception.students.find((row) => row.studentId === studentId);
    const focusTopics: SanitizedFocusTopic[] = studentMisconception
      ? sanitizeFocusTopicsFromSkills(studentMisconception.topSkills, input.audience, 5)
      : [];
    return {
      studentId,
      studentName: meta?.name ?? studentMisconception?.studentName ?? studentId.slice(-8),
      classroomName: meta?.classroomName ?? null,
      yearGroup: meta?.yearGroup ?? null,
      completion: completionMap.get(studentId) ?? emptyCompletion(),
      attendance: attendanceMap.get(studentId) ?? emptyAttendanceSummary(windowDays, Boolean(input.schoolId)),
      focusTopics,
      humanSupportCounts: humanSupportCountsFromCohort(misconception, studentId),
    };
  });

  students.sort((a, b) => a.studentName.localeCompare(b.studentName));

  const totalsFocus = projectCohortFocusTopics(misconception, input.audience, 12);
  const pack: ProgressPackSummary = {
    version: PROGRESS_REPORTING_VERSION,
    audience: input.audience,
    generatedAt: nowIso,
    windowDays,
    schoolId: input.schoolId,
    studentCount: students.length,
    totals: {
      completion: mergeCompletion(students.map((row) => row.completion)),
      attendance: mergeAttendanceSummaries(students.map((row) => row.attendance), windowDays),
      focusTopics: totalsFocus,
      humanSupportCounts: humanSupportCountsFromCohort(misconception),
    },
    students,
  };

  if (input.audience === "school_leader") {
    const byClassroom = new Map<string, ProgressStudentRow[]>();
    for (const student of students) {
      const key = student.classroomName ?? "Unassigned";
      const list = byClassroom.get(key) ?? [];
      list.push(student);
      byClassroom.set(key, list);
    }
    pack.classroomRollups = Array.from(byClassroom.entries())
      .map(([classroomName, rows]) => {
        const completion = mergeCompletion(rows.map((row) => row.completion));
        const attendance = mergeAttendanceSummaries(rows.map((row) => row.attendance), windowDays);
        return {
          classroomId: input.studentMeta.get(rows[0]?.studentId ?? "")?.classroomId ?? null,
          classroomName,
          studentCount: rows.length,
          averageAccuracyPct: completion.averageAccuracyPct,
          assignmentCompletionPct: completion.assignmentCompletionPct,
          presentRatePct: attendance.presentRatePct,
          focusTopicCount: rows.reduce((sum, row) => sum + row.focusTopics.length, 0),
        };
      })
      .sort((a, b) => a.classroomName.localeCompare(b.classroomName));
  }

  return pack;
}

export async function buildParentProgressPack(input: {
  childId: string;
  windowDays?: number;
}): Promise<ProgressPackSummary> {
  const windowDays = input.windowDays ?? 30;
  const child = await prisma.childProfile.findUnique({
    where: { id: input.childId },
    select: { id: true, name: true, yearGroup: true },
  });
  const meta = new Map<string, { name: string; classroomId: string | null; classroomName: string | null; yearGroup: string | null }>();
  if (child) {
    meta.set(child.id, {
      name: child.name,
      classroomId: null,
      classroomName: null,
      yearGroup: child.yearGroup,
    });
  }
  return buildAudiencePack({
    audience: "parent",
    studentIds: child ? [child.id] : [],
    studentMeta: meta,
    windowDays,
    schoolId: null,
  });
}

export async function buildTeacherProgressPack(input: {
  schoolId: string;
  students: Array<{
    childId: string;
    name: string;
    classroomId: string | null;
    classroomName: string | null;
    yearGroup: string | null;
  }>;
  windowDays?: number;
}): Promise<ProgressPackSummary> {
  const meta = new Map(
    input.students.map((row) => [
      row.childId,
      {
        name: row.name,
        classroomId: row.classroomId,
        classroomName: row.classroomName,
        yearGroup: row.yearGroup,
      },
    ]),
  );
  return buildAudiencePack({
    audience: "teacher",
    studentIds: input.students.map((row) => row.childId),
    studentMeta: meta,
    windowDays: input.windowDays ?? 30,
    schoolId: input.schoolId,
  });
}

export async function buildSchoolLeaderProgressPack(input: {
  schoolId: string;
  students: Array<{
    childId: string;
    name: string;
    classroomId: string | null;
    classroomName: string | null;
    yearGroup: string | null;
  }>;
  windowDays?: number;
}): Promise<ProgressPackSummary> {
  const meta = new Map(
    input.students.map((row) => [
      row.childId,
      {
        name: row.name,
        classroomId: row.classroomId,
        classroomName: row.classroomName,
        yearGroup: row.yearGroup,
      },
    ]),
  );
  return buildAudiencePack({
    audience: "school_leader",
    studentIds: input.students.map((row) => row.childId),
    studentMeta: meta,
    windowDays: input.windowDays ?? 30,
    schoolId: input.schoolId,
  });
}

export function renderProgressPackCsv(pack: ProgressPackSummary): string {
  const rows: Array<Array<string | number | boolean | null>> = [
    [
      "schoolId",
      "audience",
      "windowDays",
      "studentId",
      "studentName",
      "classroom",
      "yearGroup",
      "attempts",
      "accuracyPct",
      "assignmentsTotal",
      "assignmentsCompleted",
      "assignmentCompletionPct",
      "presentRatePct",
      "lateRatePct",
      "absentRatePct",
      "focusTopics",
      "humanSupportTotal",
      "needsMonitoring",
      "unresolved",
      "escalated",
    ],
  ];

  for (const student of pack.students) {
    rows.push([
      pack.schoolId ?? "",
      pack.audience,
      pack.windowDays,
      student.studentId,
      student.studentName,
      student.classroomName ?? "",
      student.yearGroup ?? "",
      student.completion.totalAttempts,
      student.completion.averageAccuracyPct,
      student.completion.assignmentsTotal,
      student.completion.assignmentsCompleted,
      student.completion.assignmentCompletionPct,
      student.attendance.presentRatePct,
      student.attendance.lateRatePct,
      student.attendance.absentRatePct,
      student.focusTopics.map((topic) => topic.label).join(" | "),
      student.humanSupportCounts.total,
      student.humanSupportCounts.needsMonitoring,
      student.humanSupportCounts.unresolved,
      student.humanSupportCounts.escalated,
    ]);
  }

  return rows.map((row) => row.map((cell) => csvEscape(cell ?? "")).join(",")).join("\r\n");
}
