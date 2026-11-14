import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/api_guard";
import { buildDocumentGenerationHealth } from "@/lib/reports/document-generation-orchestration";
import type { DocumentGenerationHealthCounts } from "@/lib/reports/document-generation-orchestration";

type Deps = {
  requireAdminPermission: typeof requireAdminPermission;
  collectCounts: () => Promise<DocumentGenerationHealthCounts>;
};

export type AdminDocumentGenerationHealthPayload = {
  status: "healthy" | "warning" | "informational";
  score: number;
  warnings: string[];
  summary: string;
  boundary: "draft_only";
  counts: DocumentGenerationHealthCounts;
  generatedAt: string;
};

async function defaultCollectCounts(): Promise<DocumentGenerationHealthCounts> {
  const [activeStudents, issuedCertificates, recentReportsGenerated, pendingDraftReviews, blockedByLifecycle] = await Promise.all([
    prisma.childProfile.count({ where: { archived: false } }),
    prisma.certificate.count({ where: { status: { in: ["issued", "valid"] } } }),
    prisma.auditLog.count({
      where: {
        action: { contains: "report", mode: "insensitive" },
        createdAt: { gte: new Date(Date.now() - (7 * 24 * 60 * 60 * 1000)) },
      },
    }),
    prisma.auditLog.count({ where: { action: "document_generation.draft_pending_review" } }),
    prisma.auditLog.count({ where: { action: "document_generation.lifecycle_blocked" } }),
  ]);

  return {
    activeStudents,
    issuedCertificates,
    recentReportsGenerated,
    pendingDraftReviews,
    blockedByLifecycle,
  };
}

export async function handleAdminDocumentGenerationHealthGet(
  request: Request,
  deps: Deps = {
    requireAdminPermission,
    collectCounts: defaultCollectCounts,
  },
) {
  void request;
  const { session, response } = await deps.requireAdminPermission("reports:view");
  if (!session) return response;

  const counts = await deps.collectCounts();
  const health = buildDocumentGenerationHealth(counts);

  const payload: AdminDocumentGenerationHealthPayload = {
    ...health,
    counts,
  };

  return NextResponse.json(payload);
}

export async function GET(request: Request) {
  return handleAdminDocumentGenerationHealthGet(request);
}
