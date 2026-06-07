export type CanonicalCompletionCounts = {
  total: number;
  completed: number;
  unresolved: number;
  completionPct: number;
};

export type CanonicalCatchUpCounts = {
  active: number;
  overdue: number;
  completed: number;
  unresolved: number;
};

function normalizeStatus(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function isCanonicalCompletedStatus(status: string | null | undefined): boolean {
  const normalized = normalizeStatus(status);
  return normalized === "completed" || normalized === "mastered" || normalized === "issued";
}

export function isCanonicalProgressCompleted(completed: boolean | null | undefined): boolean {
  return completed === true;
}

export function canonicalCompletionPercentage(resolved: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((resolved / total) * 100)));
}

export function summarizeCanonicalCompletionFromStatuses(statuses: Array<string | null | undefined>): CanonicalCompletionCounts {
  const total = statuses.length;
  const completed = statuses.filter((status) => isCanonicalCompletedStatus(status)).length;
  const unresolved = Math.max(0, total - completed);
  return {
    total,
    completed,
    unresolved,
    completionPct: canonicalCompletionPercentage(completed, total),
  };
}

export function summarizeCanonicalCompletionFromBooleans(flags: Array<boolean | null | undefined>): CanonicalCompletionCounts {
  const total = flags.length;
  const completed = flags.filter((value) => isCanonicalProgressCompleted(value)).length;
  const unresolved = Math.max(0, total - completed);
  return {
    total,
    completed,
    unresolved,
    completionPct: canonicalCompletionPercentage(completed, total),
  };
}

export function hasStartedButNotCompleted(percentage: number): boolean {
  return percentage > 0 && percentage < 100;
}

export function isCanonicalCatchUpCompleted(status: string | null | undefined): boolean {
  const normalized = normalizeStatus(status);
  return normalized === "completed" || normalized === "waived";
}

export function isCanonicalCatchUpActive(status: string | null | undefined): boolean {
  const normalized = normalizeStatus(status);
  return normalized === "active" || normalized === "in_progress" || normalized === "recommended" || normalized === "scheduled";
}

export function isCanonicalCatchUpOverdue(status: string | null | undefined): boolean {
  return normalizeStatus(status) === "overdue";
}

export function summarizeCanonicalCatchUp(input: {
  recommendationStatuses: Array<string | null | undefined>;
  taskStatuses: Array<string | null | undefined>;
}): CanonicalCatchUpCounts {
  const all = [...input.recommendationStatuses, ...input.taskStatuses];
  const completed = all.filter((status) => isCanonicalCatchUpCompleted(status)).length;
  const unresolved = all.length - completed;
  const active = all.filter((status) => isCanonicalCatchUpActive(status)).length;
  const overdue = all.filter((status) => isCanonicalCatchUpOverdue(status)).length;
  return { active, overdue, completed, unresolved };
}
