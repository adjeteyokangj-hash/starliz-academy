import { buildResponse } from "../_lib/response";
import { computeSlaState, makeAuditEvent } from "../_lib/governance";
import { appendAuditEvent, createIncident, listIncidents } from "../_lib/store";
import { createIncidentSchema, toValidationErrors } from "../_lib/validation";
import { requireSafeguardingAdmin } from "../_lib/auth";
import { writeAuditLog } from "@/lib/audit";

type Context = { params: Promise<{ schoolId: string }> };
type AdminDeps = { requireSafeguardingAdmin: typeof requireSafeguardingAdmin };

export async function GET(request: Request, context: Context) {
  return handleAdminSafeguardingIncidentListGet(request, context);
}

export async function handleAdminSafeguardingIncidentListGet(
  request: Request,
  context: Context,
  deps: AdminDeps = { requireSafeguardingAdmin },
) {
  const requestedAt = new Date().toISOString();
  const { schoolId } = await context.params;
  const { session, response } = await deps.requireSafeguardingAdmin();
  if (!session) return response!;

  const incidents = (await listIncidents(schoolId)).map((incident) => ({
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
  return handleAdminSafeguardingIncidentCreatePost(request, context);
}

export async function handleAdminSafeguardingIncidentCreatePost(
  request: Request,
  context: Context,
  deps: AdminDeps = { requireSafeguardingAdmin },
) {
  const requestedAt = new Date().toISOString();
  const { schoolId } = await context.params;
  const { session, response } = await deps.requireSafeguardingAdmin();
  if (!session) return response!;
  const actorUserId = session.userId;
  const actorLabel = session.email || session.userId;

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

  const incident = await createIncident(
    schoolId,
    {
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
    },
    actorUserId,
  );

  const auditEvent = await appendAuditEvent(
    schoolId,
    incident.id,
    makeAuditEvent({
      schoolId,
      incidentId: incident.id,
      actionType: "incident.created",
      actor: actorUserId,
      previousStatus: null,
      newStatus: incident.status,
      notes: `Concern created by authorised Admin (${actorLabel}).`,
      timestamp: nowIso,
    }),
    actorUserId,
  );

  await writeAuditLog({
    actorUserId,
    action: "safeguarding_case_created",
    entityType: "safeguarding_incident",
    entityId: incident.id,
    metadata: { schoolId, status: incident.status, riskLevel: incident.riskLevel },
  });

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
