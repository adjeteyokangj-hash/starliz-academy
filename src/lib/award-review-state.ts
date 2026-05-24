import type { StudentAwardStatus } from "@/lib/student-awards";

export type AwardReviewDecision = {
  nominationId: string;
  status: Exclude<StudentAwardStatus, "pending_review">;
  reason: string | null;
  reviewedAt: string;
  reviewedBy: string;
};

function parseObject(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Ignore malformed JSON.
  }
  return {};
}

function parseDecision(value: unknown): AwardReviewDecision | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;

  const nominationId = typeof row.nominationId === "string" ? row.nominationId : "";
  const status = row.status === "approved" ? "approved" : row.status === "rejected" ? "rejected" : null;
  const reviewedAt = typeof row.reviewedAt === "string" ? row.reviewedAt : "";
  const reviewedBy = typeof row.reviewedBy === "string" ? row.reviewedBy : "";

  if (!nominationId || !status || !reviewedAt || !reviewedBy) return null;

  return {
    nominationId,
    status,
    reason: typeof row.reason === "string" ? row.reason : null,
    reviewedAt,
    reviewedBy,
  };
}

export function parseAwardReviewDecisions(profileJson: string | null | undefined): AwardReviewDecision[] {
  const parsed = parseObject(profileJson);
  const awards = parsed.awards;
  if (!awards || typeof awards !== "object" || Array.isArray(awards)) return [];

  const decisions = (awards as Record<string, unknown>).reviewDecisions;
  if (!Array.isArray(decisions)) return [];

  return decisions
    .map((entry) => parseDecision(entry))
    .filter((entry): entry is AwardReviewDecision => Boolean(entry));
}

export function upsertAwardReviewDecisions(
  profileJson: string | null | undefined,
  decisions: AwardReviewDecision[],
): string {
  const parsed = parseObject(profileJson);
  const awards = parsed.awards;
  const nextAwards = awards && typeof awards === "object" && !Array.isArray(awards)
    ? (awards as Record<string, unknown>)
    : {};

  nextAwards.reviewDecisions = decisions;

  const next = {
    ...parsed,
    awards: nextAwards,
  };

  return JSON.stringify(next);
}

export function upsertAwardReviewDecision(input: {
  profileJson: string | null | undefined;
  decision: AwardReviewDecision;
}): string {
  const existing = parseAwardReviewDecisions(input.profileJson);
  const withoutCurrent = existing.filter((row) => row.nominationId !== input.decision.nominationId);
  const next = [...withoutCurrent, input.decision].sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt));
  return upsertAwardReviewDecisions(input.profileJson, next);
}
