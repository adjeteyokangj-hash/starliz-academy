export type BrainIssueSeverity = "healthy" | "warning" | "critical";

export type BrainIssueLifecycleStatus = "OPEN" | "INVESTIGATING" | "FIX_APPLIED" | "VERIFIED" | "CLOSED";

export type BrainIssueType =
  | "heartbeat_warning"
  | "recommendation_mismatch"
  | "qlf_complete_activity_pending"
  | "missing_baseline"
  | "stale_snapshot"
  | "brain_review";

export type BrainIssueSource =
  | "HEART_BEAT"
  | "RECOMMENDATION_SYNC"
  | "QLF"
  | "SNAPSHOT"
  | "BRAIN_DATA";

export type BrainIssueActionType =
  | "open_issue_detail"
  | "refresh_snapshot"
  | "run_sync_audit"
  | "open_qlf_baseline"
  | "open_heartbeat_detail"
  | "mark_reviewed"
  | "resolve_issue";

export type BrainCentreSyncFilter = "mismatch";

export type BrainIssueIdentity = {
  issueId: string;
  studentId: string;
  issueType: BrainIssueType;
  source: BrainIssueSource;
  severity: BrainIssueSeverity;
  resolutionStatus: BrainIssueLifecycleStatus;
  resolutionAction: BrainIssueActionType;
};

function stableHash(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) + value.charCodeAt(index);
    hash &= 0xffffffff;
  }
  return Math.abs(hash).toString(36);
}

export function buildBrainIssueId(input: {
  studentId: string;
  issueType: BrainIssueType;
  source: BrainIssueSource;
  seed?: string;
}): string {
  const raw = `${input.studentId}|${input.issueType}|${input.source}|${input.seed ?? ""}`;
  return `brain-issue-${stableHash(raw)}`;
}

export function toIssueDetailHref(identity: Pick<BrainIssueIdentity, "studentId" | "issueId" | "issueType" | "source" | "severity">): string {
  const params = new URLSearchParams({
    issueId: identity.issueId,
    issueType: identity.issueType,
    source: identity.source,
    severity: identity.severity,
  });
  return `/admin/brain-centre/${encodeURIComponent(identity.studentId)}?${params.toString()}`;
}

export function toBrainCentreFilterHref(input: {
  tab?: "all" | "warnings" | "mismatches" | "qlf";
  severity?: "warning" | "critical";
  status?: "healthy" | "warning" | "critical";
  sync?: BrainCentreSyncFilter;
  source?: string;
  issueType?: BrainIssueType;
}): string {
  const params = new URLSearchParams();
  if (input.tab) params.set("tab", input.tab);
  if (input.severity) params.set("severity", input.severity);
  if (input.status) params.set("status", input.status);
  if (input.sync) params.set("sync", input.sync);
  const normalizedSource = normalizeBrainCentreSource(input.source);
  if (normalizedSource) params.set("source", normalizedSource);
  if (input.issueType) params.set("issueType", input.issueType);
  const query = params.toString();
  return query ? `/admin/brain-centre?${query}` : "/admin/brain-centre";
}

export function normalizeBrainCentreSource(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized.length ? normalized : null;
}

export function getBrainCentreSelectedMismatchSource(input: {
  sync?: string | null;
  source?: string | null;
}): string | null {
  if (input.sync !== "mismatch") return null;
  return normalizeBrainCentreSource(input.source);
}

export function isBrainCentreMismatchRowSelected(
  row: Pick<BrainIssueIdentity, "issueType"> & { mismatchingEngine: string },
  input: {
    sync?: string | null;
    source?: string | null;
  },
): boolean {
  if (row.issueType !== "recommendation_mismatch") return false;
  const selectedSource = getBrainCentreSelectedMismatchSource(input);
  if (!selectedSource) return false;
  return normalizeBrainCentreSource(row.mismatchingEngine) === selectedSource;
}
