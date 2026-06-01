import { buildResponse, actorFromHeaders } from "../../../_lib/response";
import { canAccessDetail, normalizeRole } from "../../../_lib/governance";
import { getIncident, listAuditEvents } from "../../../_lib/store";
import { requireAdmin } from "@/lib/api_guard";

type Context = { params: Promise<{ schoolId: string; incidentId: string }> };

export async function GET(request: Request, context: Context) {
  const requestedAt = new Date().toISOString();
  const { schoolId, incidentId } = await context.params;
  const { session, response } = await requireAdmin();
  if (!session) return response!;
  const role = normalizeRole("dsl");

  if (!canAccessDetail(role)) {
    return buildResponse({
      success: false,
      data: null,
      error: { code: "FORBIDDEN", message: "Role is not allowed to access safeguarding audit events." },
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

  return buildResponse({
    success: true,
    data: {
      incidentId,
      audit: listAuditEvents(schoolId, incidentId),
    },
    requestedAt,
    status: 200,
  });
}
