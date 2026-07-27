import { buildResponse } from "../../_lib/response";
import { computeSlaState, isValidTransition, makeAuditEvent } from "../../_lib/governance";
import { appendAuditEvent, getIncident, updateIncident } from "../../_lib/store";
import { patchIncidentSchema, toValidationErrors } from "../../_lib/validation";
import { requireSafeguardingAdmin } from "../../_lib/auth";
import { writeAuditLog } from "@/lib/audit";

type Context = { params: Promise<{ schoolId: string; incidentId: string }> };
type AdminDeps = { requireSafeguardingAdmin: typeof requireSafeguardingAdmin };

export async function GET(request: Request, context: Context) {
  return handleAdminSafeguardingIncidentDetailGet(request, context);
}

export async function handleAdminSafeguardingIncidentDetailGet(
  request: Request,
  context: Context,
  deps: AdminDeps = { requireSafeguardingAdmin },
) {
  const requestedAt = new Date().toISOString();
  const { schoolId, incidentId } = await context.params;
  const { session, response } = await deps.requireSafeguardingAdmin();
  if (!session) return response!;

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
  deps: AdminDeps = { requireSafeguardingAdmin },
) {
  const requestedAt = new Date().toISOString();
  const { schoolId, incidentId } = await context.params;
  const { session, response } = await deps.requireSafeguardingAdmin();
  if (!session) return response!;
  const actorUserId = session.userId;

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
      actor: actorUserId,
      previousStatus: existing.status,
      newStatus: updated.status,
      notes: parsed.data.notes ?? "Incident updated.",
      timestamp: nowIso,
    }),
    actorUserId,
  );

  if (statusChanged) {
    const action =
      updated.status === "Closed"
        ? "safeguarding_case_closed"
        : parsed.data.assignedOwner !== undefined && parsed.data.assignedOwner !== existing.assignedOwner
          ? "safeguarding_case_assigned"
          : "safeguarding_status_changed";
    await writeAuditLog({
      actorUserId,
      action,
      entityType: "safeguarding_incident",
      entityId: incidentId,
      metadata: {
        schoolId,
        previousStatus: existing.status,
        newStatus: updated.status,
      },
    });
  } else if (parsed.data.assignedOwner !== undefined && parsed.data.assignedOwner !== existing.assignedOwner) {
    await writeAuditLog({
      actorUserId,
      action: "safeguarding_case_assigned",
      entityType: "safeguarding_incident",
      entityId: incidentId,
      metadata: { schoolId, assignedOwner: updated.assignedOwner },
    });
  }

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

/** Safeguarding cases are retained; ordinary Admin routes must not hard-delete them. */
export async function DELETE(_request: Request, context: Context) {
  const requestedAt = new Date().toISOString();
  const { schoolId, incidentId } = await context.params;
  const { session, response } = await requireSafeguardingAdmin();
  if (!session) return response!;

  await writeAuditLog({
    actorUserId: session.userId,
    action: "safeguarding_access_denied",
    entityType: "safeguarding_incident",
    entityId: incidentId,
    metadata: {
      schoolId,
      reason: "hard_delete_forbidden",
    },
  });

  return buildResponse({
    success: false,
    data: null,
    error: {
      code: "HARD_DELETE_FORBIDDEN",
      message: "Safeguarding cases cannot be hard-deleted. Close or archive them through the workflow.",
    },
    requestedAt,
    status: 405,
  });
}
