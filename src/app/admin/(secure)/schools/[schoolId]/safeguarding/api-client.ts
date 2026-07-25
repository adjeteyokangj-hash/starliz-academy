export type ValidationError = { field: string; message: string };

export type ApiEnvelope<T> = {
  success: boolean;
  data: T | null;
  error: { code: string; message: string } | null;
  validationErrors: ValidationError[];
  auditEvent: {
    id: string;
    actionType: string;
    actor: string;
    timestamp: string;
    previousStatus: string | null;
    newStatus: string | null;
    notes: string;
  } | null;
  timestamps: {
    requestedAt: string;
    respondedAt: string;
  };
};

export type SlaState = {
  overdueTriage: boolean;
  overdueReview: boolean;
  criticalIncidentAgingHours: number | null;
  escalationTimerMinutes: number | null;
};

export type IncidentRecord = {
  id: string;
  schoolId: string;
  student: string;
  concernType: string;
  riskLevel: "Low" | "Medium" | "High" | "Critical";
  reportedBy: string;
  reportedAt: string;
  concernSummary: string;
  immediateActionTaken: string;
  assignedOwner: string | null;
  status: "New" | "Triage Required" | "Assigned" | "Monitoring" | "Escalated" | "Referred" | "Resolved" | "Closed";
  nextReviewDate: string | null;
  parentContacted: boolean;
  externalAgencyInvolved: boolean;
  chronologyNotes: string;
  closureSummary: string;
  parentContactNotes: string;
  agencyReferralStatus: "Not Referred" | "Referral Drafted" | "Referred" | "Agency Response Received";
  createdAt: string;
  updatedAt: string;
  triagedAt: string | null;
  escalatedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  sla: SlaState;
};

export type AuditEvent = {
  id: string;
  incidentId: string;
  schoolId: string;
  actionType: string;
  actor: string;
  timestamp: string;
  previousStatus: string | null;
  newStatus: string | null;
  notes: string;
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
  agencyReferralStatus: "Not Referred" | "Referral Drafted" | "Referred" | "Agency Response Received";
  escalatedBy: string;
  nextReviewDate: string | null;
  createdAt: string;
};

const SAFEGUARDING_HEADERS: HeadersInit = {
  "Content-Type": "application/json",
  "x-starliz-role": "head_teacher",
  "x-starliz-actor": "admin-ui",
};

export class SafeguardingApiError extends Error {
  status: number;
  code: string;
  validationErrors: ValidationError[];
  constructor(message: string, status: number, code: string, validationErrors: ValidationError[] = []) {
    super(message);
    this.status = status;
    this.code = code;
    this.validationErrors = validationErrors;
  }
}

export function buildSafeguardingApiUnavailableError(message: string): SafeguardingApiError {
  return new SafeguardingApiError(message, 0, "API_UNAVAILABLE");
}

async function parseEnvelope<T>(response: Response): Promise<ApiEnvelope<T>> {
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw buildSafeguardingApiUnavailableError("API returned a non-JSON response.");
  }

  const envelope = json as ApiEnvelope<T>;
  if (!response.ok || !envelope.success) {
    throw new SafeguardingApiError(
      envelope.error?.message ?? `Request failed with status ${response.status}`,
      response.status,
      envelope.error?.code ?? "REQUEST_FAILED",
      envelope.validationErrors ?? [],
    );
  }

  return envelope;
}

async function requestEnvelope<T>(url: string, init?: RequestInit): Promise<ApiEnvelope<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        ...SAFEGUARDING_HEADERS,
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
  } catch {
    throw buildSafeguardingApiUnavailableError("Safeguarding API is unavailable.");
  }
  return parseEnvelope<T>(response);
}

export async function fetchIncidents(schoolId: string) {
  return requestEnvelope<{ incidents: IncidentRecord[] }>(`/api/admin/schools/${schoolId}/safeguarding/incidents`);
}

export async function createIncident(schoolId: string, payload: unknown) {
  return requestEnvelope<{ incident: IncidentRecord }>(`/api/admin/schools/${schoolId}/safeguarding/incidents`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchIncident(schoolId: string, incidentId: string) {
  return requestEnvelope<{ incident: IncidentRecord }>(`/api/admin/schools/${schoolId}/safeguarding/incidents/${incidentId}`);
}

export async function patchIncident(schoolId: string, incidentId: string, payload: unknown) {
  return requestEnvelope<{ incident: IncidentRecord }>(`/api/admin/schools/${schoolId}/safeguarding/incidents/${incidentId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function postTimelineUpdate(schoolId: string, incidentId: string, payload: unknown) {
  return requestEnvelope<{ timelineEvent: TimelineEvent; timeline: TimelineEvent[]; incident: IncidentRecord | null }>(
    `/api/admin/schools/${schoolId}/safeguarding/incidents/${incidentId}/timeline`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function postEscalationUpdate(schoolId: string, incidentId: string, payload: unknown) {
  return requestEnvelope<{ escalation: EscalationRecord; escalations: EscalationRecord[]; incident: IncidentRecord }>(
    `/api/admin/schools/${schoolId}/safeguarding/incidents/${incidentId}/escalation`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function fetchAuditFeed(schoolId: string, incidentId: string) {
  return requestEnvelope<{ incidentId: string; audit: AuditEvent[] }>(`/api/admin/schools/${schoolId}/safeguarding/incidents/${incidentId}/audit`);
}
