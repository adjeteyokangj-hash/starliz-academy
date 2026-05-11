import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/api_guard";

function parseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const { session, response } = await requireAdminPermission("VIEW_AUDIT_LOGS");
  if (!session) return response;

  const schoolId = request.nextUrl.searchParams.get("schoolId")?.trim() ?? "";
  const severity = request.nextUrl.searchParams.get("severity")?.trim() ?? "";
  const action = request.nextUrl.searchParams.get("action")?.trim() ?? "";
  const actorUserId = request.nextUrl.searchParams.get("actorUserId")?.trim() ?? "";
  const cursor = request.nextUrl.searchParams.get("cursor")?.trim() ?? "";
  const format = request.nextUrl.searchParams.get("format")?.trim() ?? "json";
  const limitParam = Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "50", 10);
  const limit = Number.isFinite(limitParam) ? Math.min(200, Math.max(1, limitParam)) : 50;

  if (!schoolId) {
    return NextResponse.json({ error: "schoolId is required" }, { status: 400 });
  }

  const where = {
    schoolId,
    ...(severity ? { severity } : {}),
    ...(action ? { action } : {}),
    ...(actorUserId ? { actorUserId } : {}),
  };

  const logs = await prisma.schoolAuditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...(cursor
      ? {
          cursor: { id: cursor },
          skip: 1,
        }
      : {}),
    take: limit,
  });

  if (format === "csv") {
    const header = [
      "id",
      "createdAt",
      "severity",
      "action",
      "entityType",
      "entityId",
      "actorUserId",
      "operation",
      "source",
    ];
    const rows = logs.map((row) => [
      row.id,
      row.createdAt.toISOString(),
      row.severity,
      row.action,
      row.entityType,
      row.entityId ?? "",
      row.actorUserId ?? "",
      row.operation ?? "",
      row.source ?? "",
    ]);

    const body = [header, ...rows]
      .map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
      .join("\n");

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=school-audit-${schoolId}.csv`,
      },
    });
  }

  return NextResponse.json({
    items: logs.map((row) => ({
      id: row.id,
      schoolId: row.schoolId,
      actorUserId: row.actorUserId,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      requestId: row.requestId,
      correlationId: row.correlationId,
      source: row.source,
      operation: row.operation,
      actorType: row.actorType,
      actorAdminUserId: row.actorAdminUserId,
      actorSchoolTeacherId: row.actorSchoolTeacherId,
      actorEmail: row.actorEmail,
      impersonatedByUserId: row.impersonatedByUserId,
      metadata: parseJson<Record<string, unknown>>(row.metadataJson),
      before: parseJson<Record<string, unknown>>(row.beforeJson),
      after: parseJson<Record<string, unknown>>(row.afterJson),
      diff: parseJson<Record<string, unknown>>(row.diffJson),
      tags: parseJson<string[]>(row.tagsJson),
      severity: row.severity,
      createdAt: row.createdAt.toISOString(),
    })),
    nextCursor: logs.length === limit ? logs[logs.length - 1]?.id ?? null : null,
  });
}
