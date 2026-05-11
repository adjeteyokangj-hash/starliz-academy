/**
 * School audit log API — read-only, school-scoped.
 *
 * GET /api/school/audit?schoolId=...&page=1&action=...&severity=...
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSchoolAccess } from "@/lib/schools/guards";
import { withSchoolId } from "@/lib/schools/tenant";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const schoolId = url.searchParams.get("schoolId");

  if (!schoolId) {
    return NextResponse.json({ error: "schoolId is required" }, { status: 400 });
  }

  const { response } = await requireSchoolAccess({
    schoolId,
    minRole: "support",
    method: "GET",
    route: "/api/school/audit",
    resourceType: "audit",
  });
  if (response) return response;

  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const pageSize = 50;
  const action = url.searchParams.get("action") ?? undefined;
  const severity = url.searchParams.get("severity") ?? undefined;
  const entityType = url.searchParams.get("entityType") ?? undefined;

  const [logs, total] = await Promise.all([
    prisma.schoolAuditLog.findMany({
      where: withSchoolId(schoolId, {
        ...(action ? { action } : {}),
        ...(severity ? { severity } : {}),
        ...(entityType ? { entityType } : {}),
      }),
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.schoolAuditLog.count({
      where: withSchoolId(schoolId, {
        ...(action ? { action } : {}),
        ...(severity ? { severity } : {}),
        ...(entityType ? { entityType } : {}),
      }),
    }),
  ]);

  return NextResponse.json({
    logs: logs.map((l) => ({
      id: l.id,
      action: l.action,
      entityType: l.entityType,
      entityId: l.entityId,
      actorUserId: l.actorUserId,
      severity: l.severity,
      ipAddress: l.ipAddress,
      metadata: l.metadataJson ? JSON.parse(l.metadataJson) : null,
      createdAt: l.createdAt.toISOString(),
    })),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
}
