export type RecoveryTaskStatus = "recommended" | "scheduled" | "active" | "in_progress" | "completed" | "skipped" | "waived" | "overdue";

export type RecoveryTaskPriority = "high" | "medium" | "low";

export type RecoverySeverityChip = {
  key: "overdue" | "urgent" | "confidence_gap";
  label: "Overdue" | "Urgent" | "Confidence gap";
  className: string;
};

const CONFIDENCE_GAP_REASON_PATTERN = /(confidence|uncertain|struggl|mistake|accuracy|gap|weak|practice|revision|catch[-\s]?up|needs\s+support|not\s+secure)/i;

function isPastDue(dueDate?: string | null): boolean {
  if (!dueDate) return false;
  const parsed = new Date(dueDate);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getTime() < Date.now();
}

export function resolveRecoverySeverityChips(input: {
  status: RecoveryTaskStatus;
  reason: string;
  priority?: RecoveryTaskPriority | null;
  dueDate?: string | null;
}): RecoverySeverityChip[] {
  const chips: RecoverySeverityChip[] = [];
  const normalizedReason = input.reason.trim();

  if (input.status === "overdue" || isPastDue(input.dueDate)) {
    chips.push({
      key: "overdue",
      label: "Overdue",
      className: "border border-rose-200 bg-rose-50 text-rose-700",
    });
  }

  const shouldMarkUrgent = input.priority === "high"
    || input.status === "in_progress"
    || input.status === "active";
  if (shouldMarkUrgent) {
    chips.push({
      key: "urgent",
      label: "Urgent",
      className: "border border-amber-200 bg-amber-50 text-amber-700",
    });
  }

  if (CONFIDENCE_GAP_REASON_PATTERN.test(normalizedReason) || chips.length === 0) {
    chips.push({
      key: "confidence_gap",
      label: "Confidence gap",
      className: "border border-cyan-200 bg-cyan-50 text-cyan-700",
    });
  }

  return chips;
}
