/**
 * Parent & School Progress Reporting v1 — typed contracts.
 *
 * Closed layers (Daytime Engine → Misconception Analytics): READ-ONLY consumption.
 * Never reopen writers; never expose tutor logs, private notes, unresolved prose,
 * safeguarding, or attendance free-text notes to parent-facing packs.
 */

export const PROGRESS_REPORTING_VERSION = 1 as const;

export type ProgressAudience = "parent" | "teacher" | "school_leader";

export type FocusTopicSeverity = "low" | "medium" | "high";

export type SanitizedFocusTopic = {
  subject: string;
  skillFocus: string;
  signalCount: number;
  severity: FocusTopicSeverity;
  /** Parent-safe label only — never raw tutor/teacher free text. */
  label: string;
};

export type AttendanceStatusCounts = {
  present: number;
  late: number;
  absent: number;
  authorised_absence: number;
  medical: number;
  not_recorded: number;
};

export type AttendanceSummary = {
  windowDays: number;
  totalMarks: number;
  recordedMarks: number;
  counts: AttendanceStatusCounts;
  presentRatePct: number | null;
  lateRatePct: number | null;
  absentRatePct: number | null;
  linkedToSchool: boolean;
};

export type CompletionSummary = {
  assignmentsTotal: number;
  assignmentsCompleted: number;
  assignmentCompletionPct: number | null;
  averageAccuracyPct: number | null;
  totalAttempts: number;
  catchUpOpen: number;
  catchUpCompleted: number;
};

export type HumanSupportCountSummary = {
  resolved: number;
  needsMonitoring: number;
  unresolved: number;
  escalated: number;
  studentRecovered: number;
  other: number;
  total: number;
};

export type ProgressStudentRow = {
  studentId: string;
  studentName: string;
  classroomName: string | null;
  yearGroup: string | null;
  completion: CompletionSummary;
  attendance: AttendanceSummary;
  focusTopics: SanitizedFocusTopic[];
  humanSupportCounts: HumanSupportCountSummary;
};

export type ProgressPackSummary = {
  version: typeof PROGRESS_REPORTING_VERSION;
  audience: ProgressAudience;
  generatedAt: string;
  windowDays: number;
  schoolId: string | null;
  studentCount: number;
  totals: {
    completion: CompletionSummary;
    attendance: AttendanceSummary;
    focusTopics: SanitizedFocusTopic[];
    humanSupportCounts: HumanSupportCountSummary;
  };
  students: ProgressStudentRow[];
  classroomRollups?: Array<{
    classroomId: string | null;
    classroomName: string;
    studentCount: number;
    averageAccuracyPct: number | null;
    assignmentCompletionPct: number | null;
    presentRatePct: number | null;
    focusTopicCount: number;
  }>;
};
