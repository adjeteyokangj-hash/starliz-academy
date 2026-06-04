export type CommunicationAudience = "parent" | "student" | "admin" | "staff";
export type CommunicationChannel = "inbox" | "email" | "sms" | "whatsapp" | "internal_note";
export type CommunicationSeverity = "info" | "warning" | "critical";

export type CommunicationDraftInput = {
  threadId?: string | null;
  subject: string;
  body: string;
  audience: CommunicationAudience;
  channel: CommunicationChannel;
  actorUserId: string;
  audienceId?: string | null;
  severity?: CommunicationSeverity;
};

export type Mention = {
  token: string;
  value: string;
};

export type EscalationDecision = {
  level: "none" | "admin_review" | "safeguarding_review";
  reason: string;
};

export type CommunicationDraft = {
  boundary: "draft_review_required";
  status: "draft";
  subject: string;
  body: string;
  audience: CommunicationAudience;
  channel: CommunicationChannel;
  actorUserId: string;
  audienceId: string | null;
  threadId: string | null;
  mentions: Mention[];
  escalation: EscalationDecision;
  allowAutoSend: false;
  requiresHumanReview: true;
  createdAt: string;
};

export type CommunicationAuditOutput = {
  action: "communication_draft_created" | "communication_escalation_flagged";
  actorUserId: string;
  channel: CommunicationChannel;
  audience: CommunicationAudience;
  severity: CommunicationSeverity;
  mentionCount: number;
  escalationLevel: EscalationDecision["level"];
  summary: string;
  createdAt: string;
};

export type CommunicationHubHealthCounts = {
  openThreads: number;
  unreadInboundMessages: number;
  pendingNotificationEvents: number;
  failedNotificationDeliveries: number;
  pendingEscalations: number;
};

export type CommunicationHubHealth = {
  status: "healthy" | "warning" | "informational";
  score: number;
  warnings: string[];
  summary: string;
  boundary: "draft_review_required";
  generatedAt: string;
};

export function extractMentions(body: string): Mention[] {
  const matches = body.match(/@[a-zA-Z0-9_.-]+/g) ?? [];
  return matches.map((token) => ({ token, value: token.slice(1).toLowerCase() }));
}

export function resolveEscalation(input: {
  severity: CommunicationSeverity;
  body: string;
  mentionValues: string[];
}): EscalationDecision {
  const lowered = input.body.toLowerCase();
  if (input.severity === "critical" || lowered.includes("safeguarding") || lowered.includes("urgent risk")) {
    return {
      level: "safeguarding_review",
      reason: "Critical-risk or safeguarding language detected in communication draft.",
    };
  }

  if (input.severity === "warning" || input.mentionValues.includes("admin") || input.mentionValues.includes("dsl")) {
    return {
      level: "admin_review",
      reason: "Warning-level signal or governance mention detected in draft.",
    };
  }

  return {
    level: "none",
    reason: "No escalation signal detected; standard human review still required.",
  };
}

export function createCommunicationDraft(input: CommunicationDraftInput): CommunicationDraft {
  const mentions = extractMentions(input.body);
  const escalation = resolveEscalation({
    severity: input.severity ?? "info",
    body: input.body,
    mentionValues: mentions.map((mention) => mention.value),
  });

  return {
    boundary: "draft_review_required",
    status: "draft",
    subject: input.subject.trim(),
    body: input.body.trim(),
    audience: input.audience,
    channel: input.channel,
    actorUserId: input.actorUserId,
    audienceId: input.audienceId ?? null,
    threadId: input.threadId ?? null,
    mentions,
    escalation,
    allowAutoSend: false,
    requiresHumanReview: true,
    createdAt: new Date().toISOString(),
  };
}

export function toCommunicationAuditOutput(draft: CommunicationDraft): CommunicationAuditOutput {
  const severity: CommunicationSeverity = draft.escalation.level === "safeguarding_review"
    ? "critical"
    : draft.escalation.level === "admin_review"
      ? "warning"
      : "info";

  return {
    action: draft.escalation.level === "none" ? "communication_draft_created" : "communication_escalation_flagged",
    actorUserId: draft.actorUserId,
    channel: draft.channel,
    audience: draft.audience,
    severity,
    mentionCount: draft.mentions.length,
    escalationLevel: draft.escalation.level,
    summary: `Draft communication for ${draft.audience} via ${draft.channel} (${draft.escalation.level}).`,
    createdAt: new Date().toISOString(),
  };
}

export function buildCommunicationHubHealth(counts: CommunicationHubHealthCounts): CommunicationHubHealth {
  if (counts.openThreads === 0 && counts.pendingNotificationEvents === 0) {
    return {
      status: "informational",
      score: 100,
      warnings: [],
      summary: "No active communication load. Hub is safely idle in draft-review mode.",
      boundary: "draft_review_required",
      generatedAt: new Date().toISOString(),
    };
  }

  const warnings: string[] = [];
  if (counts.unreadInboundMessages > Math.max(5, Math.floor(counts.openThreads * 0.5))) warnings.push("inbound_backlog_high");
  if (counts.pendingNotificationEvents > 20) warnings.push("notification_event_backlog_high");
  if (counts.failedNotificationDeliveries > 0) warnings.push("failed_deliveries_present");
  if (counts.pendingEscalations > 0) warnings.push("pending_escalations_present");

  return {
    status: warnings.length === 0 ? "healthy" : "warning",
    score: Math.max(0, 100 - (warnings.length * 12)),
    warnings,
    summary: warnings.length === 0
      ? "Communication hub is healthy with review-first workflow intact."
      : `Communication hub has ${warnings.length} warning(s): ${warnings.join(", ")}.`,
    boundary: "draft_review_required",
    generatedAt: new Date().toISOString(),
  };
}
