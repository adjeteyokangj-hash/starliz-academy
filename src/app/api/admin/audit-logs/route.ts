import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/api_guard";

const MAX_LIMIT = 200;
const MAX_EXPORT = 5000;

function parseDateStart(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function parseDateEnd(value: string | null): Date | null {
  if (!value) return null;
  // Date-only inputs (yyyy-mm-dd) should include the whole day.
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (dateOnly) date.setHours(23, 59, 59, 999);
  return date;
}

/**
 * Builds a Prisma where clause from the shared filter object so that list,
 * pagination and export all apply the exact same authorised filters.
 */
function buildWhere(searchParams: URLSearchParams): {
  where: Prisma.AuditLogWhereInput;
  invalid: string | null;
} {
  const where: Prisma.AuditLogWhereInput = {};
  const action = searchParams.get("action")?.trim();
  const entityType = searchParams.get("entityType")?.trim();
  const entityId = searchParams.get("entityId")?.trim();
  const actorUserId = searchParams.get("actorUserId")?.trim();
  const result = searchParams.get("result")?.trim().toLowerCase();

  if (action) where.action = action;
  if (entityType) where.entityType = entityType;
  if (entityId) where.entityId = entityId;
  if (actorUserId) where.actorUserId = actorUserId;

  // Success/denied is derived from action naming conventions (`*_rejected`,
  // `*_denied`, `*_failed`). This is a best-effort classification, not editable data.
  if (result === "denied") {
    where.OR = [
      { action: { contains: "_denied" } },
      { action: { contains: "_rejected" } },
      { action: { contains: "_failed" } },
    ];
  } else if (result === "success") {
    where.NOT = [
      { action: { contains: "_denied" } },
      { action: { contains: "_rejected" } },
      { action: { contains: "_failed" } },
    ];
  }

  const from = parseDateStart(searchParams.get("from"));
  const to = parseDateEnd(searchParams.get("to"));
  if (searchParams.get("from") && !from) return { where, invalid: "Invalid 'from' date." };
  if (searchParams.get("to") && !to) return { where, invalid: "Invalid 'to' date." };
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    };
  }

  return { where, invalid: null };
}

function csvCell(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(raw)) {
    return `"${raw.replaceAll('"', '""')}"`;
  }
  return raw;
}

export async function GET(req: NextRequest) {
  const { session, response } = await requireAdminPermission("VIEW_AUDIT_LOGS");
  if (!session) return response!;

  try {
    const { searchParams } = new URL(req.url);
    const { where, invalid } = buildWhere(searchParams);
    if (invalid) {
      return NextResponse.json({ error: invalid }, { status: 400 });
    }

    const isExport = searchParams.get("format") === "csv";

    if (isExport) {
      const logs = await prisma.auditLog.findMany({
        where,
        include: { actor: { select: { id: true, email: true, name: true } } },
        orderBy: { createdAt: "desc" },
        take: MAX_EXPORT,
      });
      const header = ["timestamp", "actorUserId", "actorEmail", "action", "entityType", "entityId"];
      const lines = [header.join(",")];
      for (const log of logs) {
        lines.push(
          [
            log.createdAt.toISOString(),
            log.actorUserId ?? "",
            log.actor?.email ?? "",
            log.action,
            log.entityType,
            log.entityId ?? "",
          ]
            .map(csvCell)
            .join(","),
        );
      }
      return new NextResponse(lines.join("\n"), {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="audit-logs-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(searchParams.get("limit") || "50", 10) || 50));
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10) || 0);

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          actor: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return NextResponse.json({
      logs: logs.map((log) => ({
        id: log.id,
        actorUserId: log.actorUserId,
        actorEmail: log.actor?.email ?? null,
        actorName: log.actor?.name ?? null,
        actor: log.actor
          ? {
              email: log.actor.email,
              name: log.actor.name,
            }
          : null,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        metadata: log.metadataJson ? JSON.parse(log.metadataJson) : null,
        timestamp: log.createdAt,
      })),
      total,
      limit,
      offset,
    });
  } catch (err) {
    console.error("Error fetching audit logs:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
