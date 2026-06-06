import { writeAuditLog } from "@/lib/audit";

export const GA_SAFETY_ACTION_TYPES = [
  "WORD_FLAGGED",
  "WORD_BLOCKED",
  "WORD_SENT_TO_SAFETY_REVIEW",
  "WORD_APPROVED_AFTER_FLAG",
  "WORD_REJECTED_AFTER_FLAG",
  "WORD_ADDED_TO_BLOCKLIST",
  "WORD_REMOVED_FROM_BLOCKLIST",
  "WORD_ALLOWED_LANGUAGE_ONLY",
  "WORD_ALLOWED_CONTEXT_ONLY",
  "WORD_IMPORTED_FROM_PDF_CANDIDATE",
  "WORD_IMPORTED_FROM_CSV",
  "WORD_UPDATED",
  "WORD_DELETED_OR_ARCHIVED",
  "CANDIDATE_EDITED",
  "CANDIDATE_REJECTED",
  "STUDENT_VISIBILITY_GRANTED",
  "STUDENT_VISIBILITY_BLOCKED",
] as const;

export const GA_APPROVED_SCOPES = ["Global", "LanguageOnly", "ContextOnly", "DictionaryOnly", "Blocked"] as const;

export type GaSafetyAuditAction = (typeof GA_SAFETY_ACTION_TYPES)[number];

export type GaSafetyAuditInput = {
  actorUserId?: string;
  actionType: GaSafetyAuditAction;
  entityType: string;
  entityId?: string;
  language?: string;
  word?: string;
  normalizedWord?: string;
  originalStatus?: string;
  newStatus?: string;
  originalReviewStatus?: string;
  newReviewStatus?: string;
  flagReason?: string;
  flagSource?: string;
  severity?: string;
  decision?: string;
  decisionReason?: string;
  approvedScope?: (typeof GA_APPROVED_SCOPES)[number];
  adminEmail?: string;
  requiresReauth?: boolean;
  reauthPassed?: boolean;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
};

export function validateGaSafetyApproval(input: { requiresReauth?: boolean; reauthPassed?: boolean; decisionReason?: string }) {
  if (input.requiresReauth && !input.reauthPassed) {
    throw new Error("Re-authentication is required before approving flagged words.");
  }
  const reason = String(input.decisionReason ?? "").trim();
  if (!reason) {
    throw new Error("Decision reason is required for flagged word approval.");
  }
}

export async function writeGaSafetyAuditLog(input: GaSafetyAuditInput) {
  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: `ga_safety.${input.actionType.toLowerCase()}`,
    entityType: input.entityType,
    entityId: input.entityId,
    metadata: {
      language: input.language,
      word: input.word,
      normalizedWord: input.normalizedWord,
      originalStatus: input.originalStatus,
      newStatus: input.newStatus,
      originalReviewStatus: input.originalReviewStatus,
      newReviewStatus: input.newReviewStatus,
      flagReason: input.flagReason,
      flagSource: input.flagSource,
      severity: input.severity,
      decision: input.decision,
      decisionReason: input.decisionReason,
      approvedScope: input.approvedScope,
      adminEmail: input.adminEmail,
      requiresReauth: input.requiresReauth,
      reauthPassed: input.reauthPassed,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      ...input.metadata,
    },
  });
}
