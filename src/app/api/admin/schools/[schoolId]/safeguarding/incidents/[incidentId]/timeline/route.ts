import { randomUUID } from "crypto";
import { buildResponse } from "../../../_lib/response";
import { canAccessDetail, makeAuditEvent, normalizeRole } from "../../../_lib/governance";
import { appendAuditEvent, appendTimelineEvent, getIncident, listTimelineEvents, updateIncident } from "../../../_lib/store";
import { timelineSchema, toValidationErrors } from "../../../_lib/validation";
import { requireAdmin } from "@/lib/api_guard";

type Context = { params: Promise<{ schoolId: string; incidentId: string }> };
type AdminDeps = { requireAdmin: typeof requireAdmin };

export async function POST(request: Request, context: Context) {
  return handleAdminSafeguardingIncidentTimelinePost(request, context);
}

export async function handleAdminSafeguardingIncidentTimelinePost(
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

  if (!canAccessDetail(role)) {
    return buildResponse({
      success: false,
      data: null,
      error: { code: "FORBIDDEN", message: "Role is not allowed to add safeguarding timeline events." },
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

  const parsed = timelineSchema.safeParse(rawBody);
  if (!parsed.success) {
    return buildResponse({
      success: false,
      data: null,
      error: { code: "VALIDATION_FAILED", message: "Timeline payload failed validation." },
      validationErrors: toValidationErrors(parsed.error),
      requestedAt,
      status: 422,
    });
  }

  const timestamp = parsed.data.timestamp ?? new Date().toISOString();
  const event = await appendTimelineEvent(schoolId, incidentId, {
    id: randomUUID(),
    schoolId,
    incidentId,
    actor,
    action: parsed.data.action,
    note: parsed.data.note,
    timestamp,
  });

  const updated = await updateIncident(schoolId, incidentId, {
    chronologyNotes: `${incident.chronologyNotes}\n${timestamp}: ${parsed.data.note}`,
    updatedAt: new Date().toISOString(),
  });

  const auditEvent = await appendAuditEvent(
    schoolId,
    incidentId,
    makeAuditEvent({
      schoolId,
      incidentId,
      actionType: "timeline.added",
      actor,
      previousStatus: incident.status,
      newStatus: incident.status,
      notes: parsed.data.note,
      timestamp,
    }),
  );

  return buildResponse({
    success: true,
    data: {
      timelineEvent: event,
      timeline: await listTimelineEvents(schoolId, incidentId),
      incident: updated,
    },
    auditEvent,
    requestedAt,
    status: 201,
  });
}
