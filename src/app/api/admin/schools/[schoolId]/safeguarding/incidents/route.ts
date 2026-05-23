import { buildResponse, actorFromHeaders } from "../_lib/response";
import { canCreateConcern, canManageSafeguarding, computeSlaState, makeAuditEvent, normalizeRole } from "../_lib/governance";
import { appendAuditEvent, createIncident, listIncidents } from "../_lib/store";
import { createIncidentSchema, toValidationErrors } from "../_lib/validation";

type Context = { params: Promise<{ schoolId: string }> };

export async function GET(request: Request, context: Context) {
  const requestedAt = new Date().toISOString();
  const { schoolId } = await context.params;
  const { roleRaw } = actorFromHeaders(request);
  const role = normalizeRole(roleRaw);

  if (!canManageSafeguarding(role)) {
    return buildResponse({
      success: false,
      data: null,
      error: { code: "FORBIDDEN", message: "Only safeguarding leads can access safeguarding incident lists." },
      requestedAt,
      status: 403,
    });
  }

  const incidents = listIncidents(schoolId).map((incident) => ({
    ...incident,
    sla: computeSlaState(incident),
  }));

  return buildResponse({
    success: true,
    data: { incidents },
    requestedAt,
    status: 200,
  });
}

export async function POST(request: Request, context: Context) {
  const requestedAt = new Date().toISOString();
  const { schoolId } = await context.params;
  const { actor, roleRaw } = actorFromHeaders(request);
  const role = normalizeRole(roleRaw);

  if (!canCreateConcern(role)) {
    return buildResponse({
      success: false,
      data: null,
      error: { code: "FORBIDDEN", message: "Role is not allowed to create safeguarding concerns." },
      requestedAt,
      status: 403,
    });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return buildResponse({
      success: false,
      data: null,
      error: { code: "MALFORMED_PAYLOAD", message: "Request body must be valid JSON." },
      requestedAt,
      status: 400,
    });
  }

  const parsed = createIncidentSchema.safeParse(rawBody);
  if (!parsed.success) {
    return buildResponse({
      success: false,
      data: null,
      error: { code: "VALIDATION_FAILED", message: "Incident payload failed validation." },
      validationErrors: toValidationErrors(parsed.error),
      requestedAt,
      status: 422,
    });
  }

  const nowIso = new Date().toISOString();
  const nextStatus = parsed.data.status ?? "New";
  if (nextStatus !== "New") {
    return buildResponse({
      success: false,
      data: null,
      error: { code: "INVALID_STATUS", message: "New incidents must be created with status 'New'." },
      validationErrors: [{ field: "status", message: "Only 'New' is allowed on create." }],
      requestedAt,
      status: 422,
    });
  }

  const incident = createIncident(schoolId, {
    student: parsed.data.student,
    concernType: parsed.data.concernType,
    riskLevel: parsed.data.riskLevel,
    reportedBy: parsed.data.reportedBy,
    reportedAt: parsed.data.reportedAt,
    concernSummary: parsed.data.concernSummary,
    immediateActionTaken: parsed.data.immediateActionTaken,
    assignedOwner: parsed.data.assignedOwner ?? null,
    status: "New",
    nextReviewDate: parsed.data.nextReviewDate ?? null,
    parentContacted: parsed.data.parentContacted ?? false,
    externalAgencyInvolved: parsed.data.externalAgencyInvolved ?? false,
    chronologyNotes: parsed.data.chronologyNotes,
    closureSummary: parsed.data.closureSummary ?? "",
    parentContactNotes: parsed.data.parentContactNotes ?? "",
    agencyReferralStatus: parsed.data.agencyReferralStatus ?? "Not Referred",
    createdAt: nowIso,
    updatedAt: nowIso,
    triagedAt: null,
    escalatedAt: null,
    resolvedAt: null,
    closedAt: null,
  });

  const auditEvent = appendAuditEvent(
    schoolId,
    incident.id,
    makeAuditEvent({
      schoolId,
      incidentId: incident.id,
      actionType: "incident.created",
      actor,
      previousStatus: null,
      newStatus: incident.status,
      notes: `Concern created by ${actor}.`,
      timestamp: nowIso,
    }),
  );

  return buildResponse({
    success: true,
    data: {
      incident: {
        ...incident,
        sla: computeSlaState(incident),
      },
    },
    auditEvent,
    requestedAt,
    status: 201,
  });
}
