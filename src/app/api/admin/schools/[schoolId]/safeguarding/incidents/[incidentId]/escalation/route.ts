import { randomUUID } from "crypto";
import { buildResponse, actorFromHeaders } from "../../../_lib/response";
import { canManageSafeguarding, computeSlaState, isValidTransition, makeAuditEvent, normalizeRole } from "../../../_lib/governance";
import { appendAuditEvent, appendEscalationRecord, getIncident, listEscalations, updateIncident } from "../../../_lib/store";
import { escalationSchema, toValidationErrors } from "../../../_lib/validation";

type Context = { params: Promise<{ schoolId: string; incidentId: string }> };

export async function POST(request: Request, context: Context) {
  const requestedAt = new Date().toISOString();
  const { schoolId, incidentId } = await context.params;
  const { actor, roleRaw } = actorFromHeaders(request);
  const role = normalizeRole(roleRaw);

  if (!canManageSafeguarding(role)) {
    return buildResponse({
      success: false,
      data: null,
      error: { code: "FORBIDDEN", message: "Only safeguarding leads can escalate incidents." },
      requestedAt,
      status: 403,
    });
  }

  const incident = getIncident(schoolId, incidentId);
  if (!incident) {
    return buildResponse({
      success: false,
      data: null,
      error: { code: "NOT_FOUND", message: "Incident not found." },
      requestedAt,
      status: 404,
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

  const parsed = escalationSchema.safeParse(rawBody);
  if (!parsed.success) {
    return buildResponse({
      success: false,
      data: null,
      error: { code: "VALIDATION_FAILED", message: "Escalation payload failed validation." },
      validationErrors: toValidationErrors(parsed.error),
      requestedAt,
      status: 422,
    });
  }

  if (!isValidTransition(incident.status, parsed.data.status)) {
    return buildResponse({
      success: false,
      data: null,
      error: {
        code: "INVALID_TRANSITION",
        message: `Invalid status transition from '${incident.status}' to '${parsed.data.status}'.`,
      },
      validationErrors: [{ field: "status", message: "Escalation status violates workflow transition rules." }],
      requestedAt,
      status: 422,
    });
  }

  const nowIso = new Date().toISOString();
  const escalation = appendEscalationRecord(schoolId, incidentId, {
    id: randomUUID(),
    schoolId,
    incidentId,
    escalationLevel: parsed.data.escalationLevel,
    rationale: parsed.data.rationale,
    actionPlan: parsed.data.actionPlan,
    agencyReferralStatus: parsed.data.agencyReferralStatus,
    escalatedBy: parsed.data.escalatedBy,
    nextReviewDate: parsed.data.nextReviewDate ?? null,
    createdAt: nowIso,
  });

  const updated = updateIncident(schoolId, incidentId, {
    status: parsed.data.status,
    agencyReferralStatus: parsed.data.agencyReferralStatus,
    nextReviewDate: parsed.data.nextReviewDate ?? incident.nextReviewDate,
    externalAgencyInvolved: parsed.data.status === "Referred" ? true : incident.externalAgencyInvolved,
    escalatedAt: nowIso,
    updatedAt: nowIso,
  });

  if (!updated) {
    return buildResponse({
      success: false,
      data: null,
      error: { code: "NOT_FOUND", message: "Incident not found." },
      requestedAt,
      status: 404,
    });
  }

  const auditEvent = appendAuditEvent(
    schoolId,
    incidentId,
    makeAuditEvent({
      schoolId,
      incidentId,
      actionType: "escalation.updated",
      actor,
      previousStatus: incident.status,
      newStatus: updated.status,
      notes: parsed.data.rationale,
      timestamp: nowIso,
    }),
  );

  return buildResponse({
    success: true,
    data: {
      escalation,
      escalations: listEscalations(schoolId, incidentId),
      incident: {
        ...updated,
        sla: computeSlaState(updated),
      },
    },
    auditEvent,
    requestedAt,
    status: 201,
  });
}
