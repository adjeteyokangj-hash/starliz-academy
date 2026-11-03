import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { getAiUseDisclosureSummary } from "@/lib/privacy/ai-disclosure";

const requestSchema = z.object({
  type: z.enum(["export", "deletion"]),
  childId: z.string().min(1),
  reason: z.string().trim().max(1500).optional(),
});

const trackedActions = [
  "gdpr_export_request_created",
  "gdpr_export_completed",
  "gdpr_deletion_request_created",
  "gdpr_deletion_completed",
] as const;

type DataRequestDeps = {
  requireSession: typeof requireSession;
  resolveParentScope: typeof resolveParentScope;
  findChildByParent: (childId: string, parentId: string) => Promise<{ id: string; name: string } | null>;
  createAuditLog: (input: {
    actorUserId: string;
    action: string;
    entityType: string;
    entityId: string;
    metadataJson?: string;
  }) => Promise<{ id: string; createdAt: Date }>;
  listAuditLogs: (actorUserId: string) => Promise<Array<{ id: string; action: string; entityId: string | null; metadataJson: string | null; createdAt: Date }>>;
};

const defaultDeps: DataRequestDeps = {
  requireSession,
  resolveParentScope,
  findChildByParent: async (childId, parentId) => {
    const child = await prisma.childProfile.findFirst({
      where: { id: childId, parentId },
      select: { id: true, name: true },
    });
    return child;
  },
  createAuditLog: async (input) => {
    const row = await prisma.auditLog.create({ data: input });
    return { id: row.id, createdAt: row.createdAt };
  },
  listAuditLogs: async (actorUserId) => {
    return await prisma.auditLog.findMany({
      where: {
        actorUserId,
        action: { in: [...trackedActions] },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  },
};

function safeParseMetadata(metadataJson: string | null): Record<string, unknown> {
  if (!metadataJson) return {};
  try {
    const parsed = JSON.parse(metadataJson) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function statusFromAction(action: string): "requested" | "completed" {
  return action.endsWith("_completed") ? "completed" : "requested";
}

function typeFromAction(action: string): "export" | "deletion" {
  return action.includes("export") ? "export" : "deletion";
}

export async function GET() {
  return handleParentDataRequestsGet();
}

export async function POST(request: Request) {
  return handleParentDataRequestsPost(request);
}

export async function handleParentDataRequestsGet(
  deps: DataRequestDeps = defaultDeps,
) {
  const { session, response } = await deps.requireSession();
  if (!session) return response;

  const parentScope = await deps.resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  const logs = await deps.listAuditLogs(parentScope.parentId);
  return NextResponse.json({
    requests: logs.map((row) => {
      const metadata = safeParseMetadata(row.metadataJson);
      return {
        id: row.id,
        type: typeFromAction(row.action),
        status: statusFromAction(row.action),
        childId: (metadata.childId as string | undefined) ?? row.entityId,
        childName: (metadata.childName as string | undefined) ?? null,
        reason: (metadata.reason as string | undefined) ?? null,
        requestedAt: row.createdAt.toISOString(),
      };
    }),
    aiUseDisclosure: getAiUseDisclosureSummary(),
  });
}

export async function handleParentDataRequestsPost(
  request: Request,
  deps: DataRequestDeps = defaultDeps,
) {
  const { session, response } = await deps.requireSession();
  if (!session) return response;

  const parentScope = await deps.resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data request payload." }, { status: 400 });
  }

  const child = await deps.findChildByParent(parsed.data.childId, parentScope.parentId);
  if (!child) {
    return NextResponse.json({ error: "Child not found." }, { status: 404 });
  }

  const action = parsed.data.type === "export"
    ? "gdpr_export_request_created"
    : "gdpr_deletion_request_created";

  const created = await deps.createAuditLog({
    actorUserId: parentScope.parentId,
    action,
    entityType: "child_profile",
    entityId: child.id,
    metadataJson: JSON.stringify({
      parentId: parentScope.parentId,
      childId: child.id,
      childName: child.name,
      type: parsed.data.type,
      status: "requested",
      reason: parsed.data.reason ?? null,
      source: "parent_portal",
    }),
  });

  return NextResponse.json(
    {
      ok: true,
      request: {
        id: created.id,
        type: parsed.data.type,
        status: "requested",
        childId: child.id,
        childName: child.name,
        reason: parsed.data.reason ?? null,
        requestedAt: created.createdAt.toISOString(),
      },
    },
    { status: 201 },
  );
}
