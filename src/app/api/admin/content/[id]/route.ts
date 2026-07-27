import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin, requireAdminPermission } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { validateSpellingContentContract } from "@/lib/content-governance";
import {
  buildBlackBoxGateFailure,
  hasPassedBlackBoxGate,
  isBlackBoxGateTargetStatus,
  mergeBlackBoxGateMetadata,
  parseContentMetadataJson,
} from "@/lib/ai/content-black-box-gate";
import { analyzeContentSessionSlots, getIncompleteSlotsReason, isQuestionSlotFilled } from "@/lib/session-slot-validation";
import { analyzeSessionSlotDuplicates } from "@/lib/session-slot-duplicates";
import { summarizeQuestionDuplicatesForContent } from "@/lib/question-duplicate-detection";

const patchSchema = z
  .object({
    status: z.enum(["generated", "reviewed", "approved", "published", "rejected"]).optional(),
    contentJson: z.string().min(2).optional(),
  })
  .refine((value) => value.status !== undefined || value.contentJson !== undefined, {
    message: "Provide at least one field to update.",
  });

function toItems(parsed: unknown): Record<string, unknown>[] {
  if (Array.isArray(parsed)) {
    return parsed.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
  }
  if (parsed && typeof parsed === "object") {
    return [parsed as Record<string, unknown>];
  }
  return [];
}

function isValidForContentType(contentType: string, parsed: unknown): boolean {
  const items = toItems(parsed);
  if (!items.length) return false;
  const filledItems = items.filter((item) => isQuestionSlotFilled(item));

  if (contentType === "spelling") {
    if (!filledItems.length) return true;
    const contract = validateSpellingContentContract(filledItems);
    return contract.ok;
  }

  if (contentType === "math") {
    return filledItems.every((item) => {
      const prompt = typeof item.prompt === "string" ? item.prompt : typeof item.question === "string" ? item.question : "";
      const answer = item.answer;
      return prompt.trim().length > 0 && (typeof answer === "number" || (typeof answer === "string" && answer.trim().length > 0));
    });
  }

  if (contentType === "reading") {
    return filledItems.every((item) =>
      typeof item.passage === "string"
      && item.passage.trim().length > 0
      && typeof item.question === "string"
      && item.question.trim().length > 0
      && typeof item.answer === "string"
      && item.answer.trim().length > 0,
    );
  }

  return true;
}

type Context = { params: Promise<{ id: string }> };

type PatchableContentRecord = {
  id: string;
  contentType: string;
  keyStage?: string | null;
  yearGroup?: string | null;
  metadataJson: string | null;
  contentJson: string;
};

type PatchUpdateInput = {
  status?: "generated" | "reviewed" | "approved" | "published" | "rejected";
  reviewedAt?: Date;
  approvedAt?: Date;
  publishedAt?: Date;
  contentJson?: string;
  metadataJson?: string;
};

type PatchedContentRecord = {
  id: string;
  status: string;
  metadataJson?: string | null;
};

type AdminContentPatchDeps = {
  requireAdmin: typeof requireAdmin;
  findContentForPatch: (id: string) => Promise<PatchableContentRecord | null>;
  updateContent: (id: string, data: PatchUpdateInput) => Promise<PatchedContentRecord>;
  writeAuditLog: typeof writeAuditLog;
};

async function defaultFindContentForPatch(id: string): Promise<PatchableContentRecord | null> {
  return prisma.aIContentCache.findUnique({
    where: { id },
    select: { id: true, contentType: true, keyStage: true, yearGroup: true, metadataJson: true, contentJson: true },
  });
}

async function defaultUpdateContent(id: string, data: PatchUpdateInput): Promise<PatchedContentRecord> {
  return prisma.aIContentCache.update({
    where: { id },
    data,
    select: { id: true, status: true, metadataJson: true },
  });
}

const defaultPatchDeps: AdminContentPatchDeps = {
  requireAdmin: (() => requireAdminPermission("MANAGE_CONTENT")) as typeof requireAdmin,
  findContentForPatch: defaultFindContentForPatch,
  updateContent: defaultUpdateContent,
  writeAuditLog,
};

export async function GET(_request: Request, context: Context) {
  const { session, response } = await requireAdminPermission("content:approve");
  if (!session) return response;

  const { id } = await context.params;
  const item = await prisma.aIContentCache.findUnique({ where: { id } });
  if (!item) {
    return NextResponse.json({ error: "Content not found." }, { status: 404 });
  }

  return NextResponse.json({
    item: {
      ...item,
      createdAt: item.createdAt.toISOString(),
      reviewedAt: item.reviewedAt?.toISOString() ?? null,
      approvedAt: item.approvedAt?.toISOString() ?? null,
      publishedAt: item.publishedAt?.toISOString() ?? null,
    },
  });
}

async function handleAdminContentPatch(
  request: Request,
  context: Context,
  deps: AdminContentPatchDeps = defaultPatchDeps,
) {
  const { session, response } = await deps.requireAdmin();
  if (!session) return response;

  const { id } = await context.params;
  try {
    const body = patchSchema.parse(await request.json());
    const now = new Date();

    const existing = await deps.findContentForPatch(id);
    if (!existing) {
      return NextResponse.json({ error: "Content not found." }, { status: 404 });
    }

    let sanitizedContentJson: string | undefined;
    if (body.contentJson !== undefined) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(body.contentJson);
      } catch {
        return NextResponse.json({ error: "contentJson must be valid JSON." }, { status: 400 });
      }

      if (!isValidForContentType(existing.contentType, parsed)) {
        return NextResponse.json({ error: "JSON does not match expected content shape." }, { status: 400 });
      }

      sanitizedContentJson = JSON.stringify(parsed);
    }

    const contentChanged = sanitizedContentJson !== undefined && sanitizedContentJson !== existing.contentJson;
    const blackBoxMarkedStaleMetadata = contentChanged
      ? JSON.stringify(mergeBlackBoxGateMetadata(parseContentMetadataJson(existing.metadataJson), {
          blackBoxLiveTest: {
            status: "needs_review",
            testedAt: now.toISOString(),
            reasons: ["Content changed. Re-run Black Box before review/publish."],
          },
          blackBoxRuntimeTest: {
            status: "needs_review",
            testedAt: now.toISOString(),
            reasons: ["Content changed. Re-run Black Box before review/publish."],
          },
          blackBoxAdminVerification: {
            status: "pending",
            decision: "needs_changes",
            notes: "Content changed after prior verification. Re-run Black Box and verify again.",
            verifiedAt: null,
            verifiedBy: null,
          },
          blackBoxNeedsRerun: true,
          blackBoxStaleReason: "content_updated",
          blackBoxStaleAt: now.toISOString(),
        }))
      : undefined;

    const gateMetadata = blackBoxMarkedStaleMetadata ?? existing.metadataJson;
    if (body.status && isBlackBoxGateTargetStatus(body.status) && !hasPassedBlackBoxGate(gateMetadata)) {
      return NextResponse.json(buildBlackBoxGateFailure(), { status: 409 });
    }

    if (body.status === "published") {
      const slotValidation = analyzeContentSessionSlots({
        contentJson: sanitizedContentJson ?? existing.contentJson,
        contentType: existing.contentType,
        metadataJson: existing.metadataJson,
      });
      if (!slotValidation.isSessionComplete) {
        return NextResponse.json({ error: getIncompleteSlotsReason(slotValidation.missingSlots) }, { status: 422 });
      }

      const duplicateValidation = analyzeSessionSlotDuplicates({
        contentJson: sanitizedContentJson ?? existing.contentJson,
        contentType: existing.contentType,
        metadataJson: existing.metadataJson,
      });
      if (duplicateValidation.hasExactDuplicates) {
        return NextResponse.json({
          error: `Publishing blocked: ${duplicateValidation.exactCount} exact duplicate question pair${duplicateValidation.exactCount === 1 ? "" : "s"} found.`,
        }, { status: 422 });
      }

      const allRecords = await prisma.aIContentCache.findMany({
        select: { id: true, status: true, contentType: true, keyStage: true, yearGroup: true, contentJson: true },
        orderBy: { createdAt: "asc" },
      });
      const globalDuplicateValidation = summarizeQuestionDuplicatesForContent({
        contentId: existing.id,
        contentStatus: body.status,
        contentSubject: existing.contentType,
        contentYearGroup: existing.yearGroup,
        contentKeyStage: existing.keyStage,
        contentJson: sanitizedContentJson ?? existing.contentJson,
        historicalRecords: allRecords
          .filter((record) => record.id !== id)
          .map((record) => ({
            contentId: record.id,
            contentStatus: record.status,
            contentSubject: record.contentType,
            contentYearGroup: record.yearGroup,
            contentKeyStage: record.keyStage,
            contentJson: record.contentJson,
          })),
      });
      if (globalDuplicateValidation.hasDuplicates) {
        return NextResponse.json({
          error: "Publishing blocked: global duplicate questions remain. Replace or edit the duplicate slots before publishing.",
          duplicateMatches: globalDuplicateValidation.matches,
        }, { status: 422 });
      }
    }

    const item = await deps.updateContent(id, {
      ...(body.status ? { status: body.status } : {}),
      ...(body.status === "reviewed" ? { reviewedAt: now } : {}),
      ...(body.status === "approved" ? { approvedAt: now } : {}),
      ...(body.status === "published" ? { publishedAt: now } : {}),
      ...(sanitizedContentJson !== undefined ? { contentJson: sanitizedContentJson } : {}),
      ...(blackBoxMarkedStaleMetadata !== undefined ? { metadataJson: blackBoxMarkedStaleMetadata } : {}),
    });

    await deps.writeAuditLog({
      actorUserId: session.userId,
      action: body.status ? `ai_content.${body.status}` : "ai_content.updated",
      entityType: "content",
      entityId: item.id,
      metadata: { status: item.status, contentUpdated: sanitizedContentJson !== undefined },
    });

    return NextResponse.json({ item });
  } catch {
    return NextResponse.json({ error: "Invalid content status update." }, { status: 400 });
  }
}

export async function PATCH(request: Request, context: Context) {
  return handleAdminContentPatch(request, context);
}