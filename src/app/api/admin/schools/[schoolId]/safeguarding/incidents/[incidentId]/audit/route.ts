import { buildResponse } from "../../../_lib/response";
import { getIncident, listAuditEvents } from "../../../_lib/store";
import { requireSafeguardingAdmin } from "../../../_lib/auth";

type Context = { params: Promise<{ schoolId: string; incidentId: string }> };
type AdminDeps = { requireSafeguardingAdmin: typeof requireSafeguardingAdmin };

export async function GET(request: Request, context: Context) {
  return handleAdminSafeguardingIncidentAuditGet(request, context);
}

export async function handleAdminSafeguardingIncidentAuditGet(
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
      incidentId,
      audit: await listAuditEvents(schoolId, incidentId),
    },
    requestedAt,
    status: 200,
  });
}
