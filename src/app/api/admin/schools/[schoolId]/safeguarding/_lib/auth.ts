import { requireAdminPermission } from "@/lib/api_guard";
import { auditAdminAccessDenial } from "@/lib/admin-permissions";

/**
 * Platform Admin safeguarding gate (Gate 1C).
 * Uses MANAGE_SAFEGUARDING — does not hard-code DSL / head_teacher roles.
 */
export async function requireSafeguardingAdmin() {
  const result = await requireAdminPermission("MANAGE_SAFEGUARDING");
  if (!result.session) {
    // requireAdminPermission already audited admin_access_denied / admin_permission_denied.
    // Emit the domain-specific denial ID when we can attribute an actor.
    return result;
  }
  return result;
}

export async function denySafeguardingAccess(input: {
  actorUserId: string;
  schoolId?: string;
  incidentId?: string;
  reason: string;
}) {
  await auditAdminAccessDenial({
    actorUserId: input.actorUserId,
    action: "safeguarding_access_denied",
    reason: input.reason,
    permission: "MANAGE_SAFEGUARDING",
    metadata: {
      schoolId: input.schoolId ?? null,
      incidentId: input.incidentId ?? null,
    },
  });
}
