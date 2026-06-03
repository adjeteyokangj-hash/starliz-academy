import { buildResponse } from "../../_lib/response";
import { canAccessDetail, canManageSafeguarding, computeSlaState, isValidTransition, makeAuditEvent, normalizeRole } from "../../_lib/governance";
import { appendAuditEvent, getIncident, updateIncident } from "../../_lib/store";
import { patchIncidentSchema, toValidationErrors } from "../../_lib/validation";
import { requireAdmin } from "@/lib/api_guard";

type Context = { params: Promise<{ schoolId: string; incidentId: string }> };
type AdminDeps = { requireAdmin: typeof requireAdmin };

export async function GET(request: Request, context: Context) {
  return handleAdminSafeguardingIncidentDetailGet(request, context);
}

export async function handleAdminSafeguardingIncidentDetailGet(
  request: Request,
  context: Context,
  deps: AdminDeps = { requireAdmin },
) {
  const requestedAt = new Date().toISOString();
  const { schoolId, incidentId } = await context.params;
  const { session, response } = await deps.requireAdmin();
  if (!session) return response!;
  const role = normalizeRole("dsl");

  if (!canAccessDetail(role)) {
    return buildResponse({
      success: false,
      data: null,
      error: { code: "FORBIDDEN", message: "Role is not allowed to access safeguarding incident detail." },
      requestedAt,
      status: 403,
    });
  }

  const incident = await getIncident(schoolId, incidentId);
  if (!incident) {
    return buildResponse({
      success: false,
      data: null,
      error: { code: "NOT_FOUND", message: "Incident not found." },
      requestedAt,
      status: 404,
    });
  }

  return buildResponse({
    success: true,
    data: {
      incident: {
        ...incident,
        sla: computeSlaState(incident),
      },
    },
    requestedAt,
    status: 200,
  });
}

export async function PATCH(request: Request, context: Context) {
  return handleAdminSafeguardingIncidentPatch(request, context);
}

export async function handleAdminSafeguardingIncidentPatch(
  request: Request,
  context: Context,
  deps: AdminDeps = { requireAdmin },
) {
  const requestedAt = new Date().toISOString();
  const { schoolId, incidentId } = await context.params;
  const { session, response } = await deps.requireAdmin();
  if (!session) return response!;
  const actor = session.email || session.userId;
  const role = normalizeRole("dsl");

  if (!canManageSafeguarding(role)) {
    return buildResponse({
      success: false,
      data: null,
      error: { code: "FORBIDDEN", message: "Only DSL/Deputy DSL/Head Teacher/Safeguarding Officer can update incidents." },
      requestedAt,
      status: 403,
    });
  }

  const existing = await getIncident(schoolId, incidentId);
  if (!existing) {
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

  const parsed = patchIncidentSchema.safeParse(rawBody);
  if (!parsed.success) {
    return buildResponse({
      success: false,
      data: null,
      error: { code: "VALIDATION_FAILED", message: "Incident patch failed validation." },
      validationErrors: toValidationErrors(parsed.error),
      requestedAt,
      status: 422,
    });
  }

  const nowIso = new Date().toISOString();
  const requestedStatus = parsed.data.status;
  if (requestedStatus && !isValidTransition(existing.status, requestedStatus)) {
    return buildResponse({
      success: false,
      data: null,
      error: {
        code: "INVALID_TRANSITION",
        message: `Invalid status transition from '${existing.status}' to '${requestedStatus}'.`,
      },
      validationErrors: [{ field: "status", message: "Transition does not match safeguarding workflow rules." }],
      requestedAt,
      status: 422,
    });
  }

  const statusChanged = Boolean(requestedStatus && requestedStatus !== existing.status);
  const updated = await updateIncident(schoolId, incidentId, {
    ...parsed.data,
    status: requestedStatus ?? existing.status,
    triagedAt: requestedStatus === "Triage Required" ? nowIso : existing.triagedAt,
    escalatedAt: requestedStatus === "Escalated" || requestedStatus === "Referred" ? nowIso : existing.escalatedAt,
    resolvedAt: requestedStatus === "Resolved" ? nowIso : existing.resolvedAt,
    closedAt: requestedStatus === "Closed" ? nowIso : existing.closedAt,
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

  const auditEvent = await appendAuditEvent(
    schoolId,
    incidentId,
    makeAuditEvent({
      schoolId,
      incidentId,
      actionType: statusChanged ? "incident.status_changed" : "incident.updated",
      actor,
      previousStatus: existing.status,
      newStatus: updated.status,
      notes: parsed.data.notes ?? "Incident updated.",
      timestamp: nowIso,
    }),
  );

  return buildResponse({
    success: true,
    data: {
      incident: {
        ...updated,
        sla: computeSlaState(updated),
      },
    },
    auditEvent,
    requestedAt,
    status: 200,
  });
}
