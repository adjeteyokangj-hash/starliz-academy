/**
 * Parent & School Progress Reporting v1
 *
 * Closed learning layers are read-only. Privacy projection strips tutor logs,
 * private notes, unresolved prose, and attendance free-text notes.
 */

export * from "@/lib/progress-reporting/types";
export {
  emptyHumanSupportCounts,
  humanSupportCountsFromCohort,
  humanSupportCountsFromStudent,
  parentSafeFocusLabel,
  projectCohortFocusTopics,
  sanitizeFocusTopicsFromSkills,
  sanitizeSignalsForAudience,
  severityFromSignalCount,
} from "@/lib/progress-reporting/privacy";
export {
  emptyAttendanceSummary,
  loadAttendanceSummariesForChildren,
  loadAttendanceSummaryForChild,
  mergeAttendanceSummaries,
  summarizeAttendanceMarks,
} from "@/lib/progress-reporting/attendance";
export {
  buildParentProgressPack,
  buildSchoolLeaderProgressPack,
  buildTeacherProgressPack,
  renderProgressPackCsv,
} from "@/lib/progress-reporting/build-packs";
