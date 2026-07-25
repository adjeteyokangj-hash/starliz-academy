/**
 * Privacy projection for progress reporting.
 * Strip raw misconception text, tutor payloads, unresolved prose, and private notes.
 */

import type {
  MisconceptionCohortSummary,
  MisconceptionSignal,
  MisconceptionSkillBucket,
  MisconceptionStudentSummary,
} from "@/lib/misconception-analytics/types";
import type {
  FocusTopicSeverity,
  HumanSupportCountSummary,
  ProgressAudience,
  SanitizedFocusTopic,
} from "@/lib/progress-reporting/types";

const PARENT_BLOCKED_SOURCES = new Set([
  "human_notes",
  "unresolved_report",
]);

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function isOpaqueSkillFocus(skillFocus: string): boolean {
  const value = normalize(skillFocus);
  return value.startsWith("dts:") || value.includes(":attempt:") || value.length > 80;
}

export function severityFromSignalCount(count: number): FocusTopicSeverity {
  if (count >= 5) return "high";
  if (count >= 3) return "medium";
  return "low";
}

export function parentSafeFocusLabel(subject: string, skillFocus: string): string {
  const skill = skillFocus.trim() || "this topic";
  const subjectLabel = subject.trim() || "learning";
  return `Needs more practice: ${skill} (${subjectLabel})`;
}

/** Map skill buckets to parent-safe focus topics (labels only, no sampleText). */
export function sanitizeFocusTopicsFromSkills(
  skills: MisconceptionSkillBucket[],
  audience: ProgressAudience,
  limit = 8,
): SanitizedFocusTopic[] {
  return skills
    .filter((row) => !isOpaqueSkillFocus(row.skillFocus))
    .filter((row) => {
      if (audience !== "parent") return true;
      // Parents only get topics that have non-sensitive sources or any skill label from attempts/dna/ai/spelling.
      const sensitiveOnly = row.sources.length > 0
        && row.sources.every((source) => PARENT_BLOCKED_SOURCES.has(source));
      return !sensitiveOnly;
    })
    .map((row) => ({
      subject: row.subject,
      skillFocus: row.skillFocus,
      signalCount: row.signalCount,
      severity: severityFromSignalCount(row.signalCount),
      label: parentSafeFocusLabel(row.subject, row.skillFocus),
    }))
    .sort((a, b) => b.signalCount - a.signalCount || a.skillFocus.localeCompare(b.skillFocus))
    .slice(0, limit);
}

export function sanitizeSignalsForAudience(
  signals: MisconceptionSignal[],
  audience: ProgressAudience,
): MisconceptionSignal[] {
  if (audience !== "parent") {
    // Staff packs still must not carry private note bodies into progress exports —
    // strip free text for human_notes / unresolved_report; keep counts via skill buckets.
    return signals.map((signal) => {
      if (signal.source === "human_notes" || signal.source === "unresolved_report") {
        return {
          ...signal,
          text: null,
          metadata: {
            ...(signal.metadata ?? {}),
            textRedacted: true,
          },
        };
      }
      return signal;
    });
  }

  return signals
    .filter((signal) => !PARENT_BLOCKED_SOURCES.has(signal.source))
    .map((signal) => ({
      ...signal,
      text: null,
      evidenceRefs: signal.evidenceRefs.filter((ref) =>
        ref.kind !== "human_support_session" && ref.kind !== "unresolved_report"
      ),
      metadata: undefined,
    }));
}

export function emptyHumanSupportCounts(): HumanSupportCountSummary {
  return {
    resolved: 0,
    needsMonitoring: 0,
    unresolved: 0,
    escalated: 0,
    studentRecovered: 0,
    other: 0,
    total: 0,
  };
}

export function humanSupportCountsFromStudent(
  student: Pick<
    MisconceptionStudentSummary,
    "needsMonitoringSessionCount" | "unresolvedSessionCount" | "escalatedSessionCount"
  > & { resolvedSessionCount?: number; studentRecoveredSessionCount?: number },
): HumanSupportCountSummary {
  const needsMonitoring = student.needsMonitoringSessionCount ?? 0;
  const unresolved = student.unresolvedSessionCount ?? 0;
  const escalated = student.escalatedSessionCount ?? 0;
  const resolved = student.resolvedSessionCount ?? 0;
  const studentRecovered = student.studentRecoveredSessionCount ?? 0;
  return {
    resolved,
    needsMonitoring,
    unresolved,
    escalated,
    studentRecovered,
    other: 0,
    total: resolved + needsMonitoring + unresolved + escalated + studentRecovered,
  };
}

/** Derive human-support counts from cohort outcome links (labels only). */
export function humanSupportCountsFromCohort(
  cohort: MisconceptionCohortSummary,
  studentId?: string,
): HumanSupportCountSummary {
  const counts = emptyHumanSupportCounts();
  for (const link of cohort.humanOutcomeLinks) {
    if (studentId && link.studentId !== studentId) continue;
    counts.total += 1;
    if (link.outcome === "resolved") counts.resolved += 1;
    else if (link.outcome === "partially_resolved") counts.needsMonitoring += 1;
    else if (link.outcome === "unresolved") counts.unresolved += 1;
    else if (link.outcome === "escalated") counts.escalated += 1;
    else if (link.outcome === "student_recovered") counts.studentRecovered += 1;
    else counts.other += 1;
  }
  return counts;
}

export function projectCohortFocusTopics(
  cohort: MisconceptionCohortSummary,
  audience: ProgressAudience,
  limit = 12,
): SanitizedFocusTopic[] {
  return sanitizeFocusTopicsFromSkills(cohort.topSkills, audience, limit);
}
