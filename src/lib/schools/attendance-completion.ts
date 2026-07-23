import {
  isRecordedAttendanceStatus,
  type AttendanceStatus,
} from "@/lib/schools/attendance-status";

export type RegisterCompletionState =
  | "not_started"
  | "partial"
  | "complete"
  | "missing_tutor"
  | "no_roster"
  | "not_applicable";

/**
 * Register completion rules (shared by tutor + admin):
 * - not_started: roster exists, zero students have a recorded (non-not_recorded) status
 * - partial: at least one, but not all, roster students have a recorded status
 * - complete: every roster student has a non-not_recorded status
 * - no_roster: no students to mark (empty class)
 * - missing_tutor / not_applicable: set by callers for period metadata, not derived from marks
 */
export function calculateRegisterCompletion(
  statuses: AttendanceStatus[],
): Extract<RegisterCompletionState, "not_started" | "partial" | "complete" | "no_roster"> {
  if (statuses.length === 0) return "no_roster";
  const recordedCount = statuses.filter(isRecordedAttendanceStatus).length;
  if (recordedCount === 0) return "not_started";
  if (recordedCount >= statuses.length) return "complete";
  return "partial";
}

export type AttendanceCountSummary = {
  totalStudents: number;
  present: number;
  absent: number;
  late: number;
  authorisedAbsence: number;
  medical: number;
  notRecorded: number;
  completion: ReturnType<typeof calculateRegisterCompletion>;
};

export function summariseAttendanceStatuses(statuses: AttendanceStatus[]): AttendanceCountSummary {
  const counts = {
    totalStudents: statuses.length,
    present: 0,
    absent: 0,
    late: 0,
    authorisedAbsence: 0,
    medical: 0,
    notRecorded: 0,
  };

  for (const status of statuses) {
    switch (status) {
      case "present":
        counts.present += 1;
        break;
      case "absent":
        counts.absent += 1;
        break;
      case "late":
        counts.late += 1;
        break;
      case "authorised_absence":
        counts.authorisedAbsence += 1;
        break;
      case "medical":
        counts.medical += 1;
        break;
      default:
        counts.notRecorded += 1;
        break;
    }
  }

  return {
    ...counts,
    completion: calculateRegisterCompletion(statuses),
  };
}
