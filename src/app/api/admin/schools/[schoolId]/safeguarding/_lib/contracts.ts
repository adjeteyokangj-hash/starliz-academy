export const SAFEGUARDING_STATUSES = [
  "New",
  "Triage Required",
  "Assigned",
  "Monitoring",
  "Escalated",
  "Referred",
  "Resolved",
  "Closed",
] as const;

export const SAFEGUARDING_RISK_LEVELS = ["Low", "Medium", "High", "Critical"] as const;

export const AGENCY_REFERRAL_STATUSES = [
  "Not Referred",
  "Referral Drafted",
  "Referred",
  "Agency Response Received",
] as const;

export const API_ROLES = [
  "teacher",
  "dsl",
  "deputy_dsl",
  "head_teacher",
  "safeguarding_officer",
  "finance",
  "admin",
  "unknown",
] as const;

export type SafeguardingStatus = (typeof SAFEGUARDING_STATUSES)[number];
export type SafeguardingRiskLevel = (typeof SAFEGUARDING_RISK_LEVELS)[number];
export type AgencyReferralStatus = (typeof AGENCY_REFERRAL_STATUSES)[number];
export type ApiRole = (typeof API_ROLES)[number];

export type WorkflowAction =
  | "incident.created"
  | "incident.updated"
  | "incident.status_changed"
  | "timeline.added"
  | "escalation.updated";

export type AuditEvent = {
  id: string;
  incidentId: string;
  schoolId: string;
  actionType: WorkflowAction;
  actor: string;
  timestamp: string;
  previousStatus: SafeguardingStatus | null;
  newStatus: SafeguardingStatus | null;
  notes: string;
};

export type SafeguardingIncident = {
  id: string;
  schoolId: string;
  student: string;
  concernType: string;
  riskLevel: SafeguardingRiskLevel;
  reportedBy: string;
  reportedAt: string;
  concernSummary: string;
  immediateActionTaken: string;
  assignedOwner: string | null;
  status: SafeguardingStatus;
  nextReviewDate: string | null;
  parentContacted: boolean;
  externalAgencyInvolved: boolean;
  chronologyNotes: string;
  closureSummary: string;
  parentContactNotes: string;
  agencyReferralStatus: AgencyReferralStatus;
  createdAt: string;
  updatedAt: string;
  triagedAt: string | null;
  escalatedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
};

export type TimelineEvent = {
  id: string;
  incidentId: string;
  schoolId: string;
  timestamp: string;
  actor: string;
  action: string;
  note: string;
};

export type EscalationRecord = {
  id: string;
  incidentId: string;
  schoolId: string;
  escalationLevel: string;
  rationale: string;
  actionPlan: string;
  agencyReferralStatus: AgencyReferralStatus;
  escalatedBy: string;
  nextReviewDate: string | null;
  createdAt: string;
};

export type IncidentSlaState = {
  overdueTriage: boolean;
  overdueReview: boolean;
  criticalIncidentAgingHours: number | null;
  escalationTimerMinutes: number | null;
};

export type ApiError = {
  code: string;
  message: string;
};

export type ApiTimestampInfo = {
  requestedAt: string;
  respondedAt: string;
};

export type ApiValidationError = {
  field: string;
  message: string;
};

export type ApiResponse<T> = {
  success: boolean;
  data: T | null;
  error: ApiError | null;
  validationErrors: ApiValidationError[];
  auditEvent: AuditEvent | null;
  timestamps: ApiTimestampInfo;
};
