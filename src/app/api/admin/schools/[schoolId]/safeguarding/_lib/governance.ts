import { randomUUID } from "crypto";
import type { ApiRole, AuditEvent, IncidentSlaState, SafeguardingIncident, SafeguardingStatus, WorkflowAction } from "./contracts";

const ROLE_ALIAS_MAP: Record<string, ApiRole> = {
  teacher: "teacher",
  dsl: "dsl",
  "deputy dsl": "deputy_dsl",
  deputy_dsl: "deputy_dsl",
  "head teacher": "head_teacher",
  head_teacher: "head_teacher",
  safeguarding_officer: "safeguarding_officer",
  "safeguarding officer": "safeguarding_officer",
  finance: "finance",
  admin: "admin",
};

const ALLOWED_TRANSITIONS: Record<SafeguardingStatus, SafeguardingStatus[]> = {
  "New": ["Triage Required"],
  "Triage Required": ["Assigned"],
  "Assigned": ["Monitoring", "Escalated", "Referred"],
  "Monitoring": ["Resolved"],
  "Escalated": ["Resolved"],
  "Referred": ["Resolved"],
  "Resolved": ["Closed"],
  "Closed": [],
};

export function normalizeRole(rawRole: string | null | undefined): ApiRole {
  if (!rawRole) return "unknown";
  const normalized = rawRole.trim().toLowerCase().replace(/\s+/g, " ");
  return ROLE_ALIAS_MAP[normalized] ?? ROLE_ALIAS_MAP[normalized.replace(/ /g, "_")] ?? "unknown";
}

export function canCreateConcern(role: ApiRole): boolean {
  return role === "teacher" || role === "dsl" || role === "deputy_dsl" || role === "head_teacher" || role === "safeguarding_officer";
}

export function canManageSafeguarding(role: ApiRole): boolean {
  return role === "dsl" || role === "deputy_dsl" || role === "head_teacher" || role === "safeguarding_officer";
}

export function canAccessDetail(role: ApiRole): boolean {
  if (role === "finance" || role === "admin") return false;
  return canManageSafeguarding(role);
}

export function isValidTransition(previousStatus: SafeguardingStatus, nextStatus: SafeguardingStatus): boolean {
  return ALLOWED_TRANSITIONS[previousStatus].includes(nextStatus);
}

export function makeAuditEvent(input: {
  schoolId: string;
  incidentId: string;
  actionType: WorkflowAction;
  actor: string;
  previousStatus: SafeguardingStatus | null;
  newStatus: SafeguardingStatus | null;
  notes: string;
  timestamp?: string;
}): AuditEvent {
  return {
    id: randomUUID(),
    schoolId: input.schoolId,
    incidentId: input.incidentId,
    actionType: input.actionType,
    actor: input.actor,
    previousStatus: input.previousStatus,
    newStatus: input.newStatus,
    notes: input.notes,
    timestamp: input.timestamp ?? new Date().toISOString(),
  };
}

export function computeSlaState(incident: SafeguardingIncident, now = new Date()): IncidentSlaState {
  const createdAt = new Date(incident.createdAt).getTime();
  const nowTime = now.getTime();

  const triageWindowMs = 24 * 60 * 60 * 1000;
  const reviewWindowMs = 0;

  const overdueTriage = incident.status === "New" && nowTime - createdAt > triageWindowMs;
  const nextReviewTime = incident.nextReviewDate ? new Date(incident.nextReviewDate).getTime() : null;
  const overdueReview = Boolean(nextReviewTime !== null && nowTime - nextReviewTime > reviewWindowMs && incident.status !== "Closed");

  const criticalIncidentAgingHours = incident.riskLevel === "Critical" ? Math.max(0, Math.floor((nowTime - createdAt) / (60 * 60 * 1000))) : null;
  const escalationTimerMinutes = incident.escalatedAt
    ? Math.max(0, Math.floor((nowTime - new Date(incident.escalatedAt).getTime()) / (60 * 1000)))
    : null;

  return {
    overdueTriage,
    overdueReview,
    criticalIncidentAgingHours,
    escalationTimerMinutes,
  };
}
