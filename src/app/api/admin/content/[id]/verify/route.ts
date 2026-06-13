import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import {
  mergeBlackBoxGateMetadata,
  parseContentMetadataJson,
  type ContentMetadata,
} from "@/lib/ai/content-black-box-gate";
import { runContentRuntimeBlackBoxTest, type ContentRuntimeBlackBoxResult } from "@/lib/ai/content-runtime-black-box-test";

type Context = { params: Promise<{ id: string }> };

const verificationSchema = z.object({
  action: z.enum(["approve", "reject", "reclassify", "needs_changes", "send_back"]),
  notes: z.string().trim().max(2000).optional(),
  /** Item-level context for richer review history (Part 3) */
  questionContext: z.object({
    questionIndex: z.number().int().min(0).optional(),
    questionPreview: z.string().max(300).optional(),
    itemId: z.string().max(200).optional(),
  }).optional(),
  reclassification: z.object({
    subject: z.string().trim().optional(),
    strand: z.string().trim().optional(),
    keyStage: z.string().trim().optional(),
    yearGroup: z.string().trim().optional(),
    level: z.number().int().min(1).max(10).optional(),
  }).optional(),
});

type VerificationBody = z.infer<typeof verificationSchema>;

type VerifiableContentRecord = {
  id: string;
  contentType: string;
  level: number;
  topic: string;
  contentJson: string;
  status: string;
  metadataJson: string | null;
  skillFocus: string | null;
};

type VerifiedContentRecord = {
  id: string;
  status: string;
  metadataJson: string | null;
  reviewedAt: Date | null;
  approvedAt: Date | null;
};

type ContentVerificationUpdate = {
  status: string;
  metadataJson: string;
  reviewedAt?: Date;
  approvedAt?: Date | null;
};

type AdminContentVerificationDeps = {
  requireAdmin: typeof requireAdmin;
  findContent: (id: string) => Promise<VerifiableContentRecord | null>;
  updateContent: (id: string, data: ContentVerificationUpdate) => Promise<VerifiedContentRecord>;
  writeAuditLog: typeof writeAuditLog;
  runRuntimeTest: typeof runContentRuntimeBlackBoxTest;
  now: () => Date;
};

/** Reads a string field from ContentMetadata safely */
function metaString(metadata: ContentMetadata, key: string): string | null {
  const val = metadata[key];
  return typeof val === "string" && val.trim() ? val.trim() : null;
}

/** Reads a number field from ContentMetadata safely */
function metaNumber(metadata: ContentMetadata, key: string): number | null {
  const val = metadata[key];
  return typeof val === "number" && Number.isFinite(val) ? val : null;
}

async function defaultFindContent(id: string): Promise<VerifiableContentRecord | null> {
  return prisma.aIContentCache.findUnique({
    where: { id },
    select: {
      id: true,
      contentType: true,
      level: true,
      topic: true,
      contentJson: true,
      status: true,
      metadataJson: true,
      skillFocus: true,
    },
  });
}

async function defaultUpdateContent(id: string, data: ContentVerificationUpdate): Promise<VerifiedContentRecord> {
  return prisma.aIContentCache.update({
    where: { id },
    data,
    select: { id: true, status: true, metadataJson: true, reviewedAt: true, approvedAt: true },
  });
}

const defaultDeps: AdminContentVerificationDeps = {
  requireAdmin,
  findContent: defaultFindContent,
  updateContent: defaultUpdateContent,
  writeAuditLog,
  runRuntimeTest: runContentRuntimeBlackBoxTest,
  now: () => new Date(),
};

function notesRequired(action: VerificationBody["action"]): boolean {
  return action !== "approve";
}

function actionStatus(action: VerificationBody["action"]): string {
  if (action === "approve") return "approved";
  if (action === "reject") return "rejected";
  if (action === "reclassify") return "reviewed";
  return "generated";
}

function verificationStatus(action: VerificationBody["action"]): "verified" | "rejected" | "needs_changes" {
  if (action === "reject") return "rejected";
  if (action === "needs_changes" || action === "send_back") return "needs_changes";
  return "verified";
}

function appendReviewHistory(metadata: ContentMetadata, entry: ContentMetadata): ContentMetadata[] {
  const existing = Array.isArray(metadata.reviewHistory) ? metadata.reviewHistory : [];
  return [...existing.filter((item): item is ContentMetadata => Boolean(item && typeof item === "object" && !Array.isArray(item))), entry];
}

function blackBoxDecision(metadata: ContentMetadata): string | null {
  const test = metadata.blackBoxContentTest;
  if (!test || typeof test !== "object" || Array.isArray(test)) return null;
  const decision = (test as Record<string, unknown>).decision;
  return typeof decision === "string" ? decision : null;
}

function blackBoxScore(metadata: ContentMetadata): number | null {
  const test = metadata.blackBoxContentTest;
  if (!test || typeof test !== "object" || Array.isArray(test)) return null;
  const raw = test as Record<string, unknown>;
  if (typeof raw.passRate === "number" && Number.isFinite(raw.passRate)) return Math.round(raw.passRate * 100);
  if (typeof raw.score === "number" && typeof raw.maxScore === "number" && raw.score > 100 && raw.maxScore > 100) {
    return Math.round((raw.score / raw.maxScore) * 100);
  }
  return typeof raw.score === "number" && Number.isFinite(raw.score) ? Math.max(0, Math.min(100, raw.score)) : null;
}

function shouldRequirePassedRuntime(action: VerificationBody["action"]): boolean {
  return action === "approve" || action === "reclassify";
}

function buildNextMetadata(input: {
  existingMetadata: ContentMetadata;
  body: VerificationBody;
  runtime: ContentRuntimeBlackBoxResult;
  actor: string;
  now: Date;
  contentId: string;
}): ContentMetadata {
  const { existingMetadata, body, runtime, actor, now, contentId } = input;
  const status = verificationStatus(body.action);
  const nextStatus = actionStatus(body.action);
  const reclassification = body.action === "reclassify" ? body.reclassification ?? null : null;
  const bbDecision = blackBoxDecision(existingMetadata);
  const bbScore = blackBoxScore(existingMetadata);
  const reviewEntry = {
    action: body.action,
    status: nextStatus,
    score: bbScore,
    decision: bbDecision,
    notes: body.notes ?? null,
    actor,
    createdAt: now.toISOString(),
    // Rich item-level context (Parts 3 & 4)
    questionIndex: body.questionContext?.questionIndex ?? null,
    questionPreview: body.questionContext?.questionPreview ?? null,
    itemId: body.questionContext?.itemId ?? null,
    contentId,
    contentTitle: metaString(existingMetadata, "title"),
    subject: metaString(existingMetadata, "subject"),
    strandTopic: metaString(existingMetadata, "strand"),
    yearGroup: metaString(existingMetadata, "yearGroup"),
    keyStage: metaString(existingMetadata, "keyStage"),
    level: metaNumber(existingMetadata, "difficulty"),
    examBoard: metaString(existingMetadata, "examBoard"),
    blackBoxDecision: bbDecision,
    blackBoxScore: bbScore,
    metadata: {
      runtimeStatus: runtime.status,
      runtimeScore: runtime.score,
      reclassification,
    },
  };

  return mergeBlackBoxGateMetadata(existingMetadata, {
    ...(reclassification ? {
      subject: reclassification.subject ?? existingMetadata.subject,
      strand: reclassification.strand ?? existingMetadata.strand,
      keyStage: reclassification.keyStage ?? existingMetadata.keyStage,
      yearGroup: reclassification.yearGroup ?? existingMetadata.yearGroup,
      difficulty: reclassification.level ?? existingMetadata.difficulty,
    } : {}),
    blackBoxLiveTest: runtime,
    blackBoxRuntimeTest: runtime,
    blackBoxAdminVerification: {
      status,
      decision: body.action,
      notes: body.notes ?? null,
      verifiedAt: now.toISOString(),
      verifiedBy: actor,
      reclassification,
      // Preserve original machine BB result separately (Part 4)
      originalBlackBoxDecision: bbDecision,
      originalBlackBoxScore: bbScore,
    },
    reviewHistory: appendReviewHistory(existingMetadata, reviewEntry),
  });
}

export async function handleAdminContentVerifyPost(
  request: Request,
  context: Context,
  deps: AdminContentVerificationDeps = defaultDeps,
) {
  const { session, response } = await deps.requireAdmin();
  if (!session) return response;

  const { id } = await context.params;
  const body = verificationSchema.parse(await request.json());
  const notes = body.notes?.trim() ?? "";
  if (notesRequired(body.action) && notes.length === 0) {
    return NextResponse.json({ error: "Review notes are required for this verification decision." }, { status: 422 });
  }
  if (body.action === "reclassify" && !body.reclassification?.subject && !body.reclassification?.strand) {
    return NextResponse.json({ error: "Reclassification requires a subject or strand." }, { status: 422 });
  }

  const content = await deps.findContent(id);
  if (!content) {
    return NextResponse.json({ error: "Content not found." }, { status: 404 });
  }
  if (content.status === "published") {
    return NextResponse.json({ error: "Published content cannot be verified again." }, { status: 422 });
  }

  const runtime = deps.runRuntimeTest({
    contentType: content.contentType,
    level: content.level,
    topic: content.topic,
    skillFocus: content.skillFocus,
    contentJson: content.contentJson,
  });
  if (shouldRequirePassedRuntime(body.action) && runtime.status !== "passed") {
    return NextResponse.json({
      error: "Runtime black box test must pass before this verification decision can be saved.",
      blackBoxLiveTest: runtime,
    }, { status: 422 });
  }

  const now = deps.now();
  const nextStatus = actionStatus(body.action);
  const existingMetadata = parseContentMetadataJson(content.metadataJson);
  const metadata = buildNextMetadata({
    existingMetadata,
    body: { ...body, notes },
    runtime,
    actor: session.userId,
    now,
    contentId: content.id,
  });

  const updated = await deps.updateContent(id, {
    status: nextStatus,
    reviewedAt: nextStatus === "reviewed" || nextStatus === "approved" || nextStatus === "rejected" ? now : undefined,
    approvedAt: nextStatus === "approved" ? now : nextStatus === "generated" || nextStatus === "rejected" ? null : undefined,
    metadataJson: JSON.stringify(metadata),
  });

  await deps.writeAuditLog({
    actorUserId: session.userId,
    action: `ai_content.verification.${body.action}`,
    entityType: "AIContentCache",
    entityId: content.id,
    metadata: {
      status: updated.status,
      notes: notes || null,
      runtimeStatus: runtime.status,
      runtimeScore: runtime.score,
      reclassification: body.reclassification ?? null,
    },
  });

  return NextResponse.json({
    item: {
      id: updated.id,
      status: updated.status,
      reviewedAt: updated.reviewedAt?.toISOString() ?? null,
      approvedAt: updated.approvedAt?.toISOString() ?? null,
      metadataJson: updated.metadataJson,
    },
    blackBoxLiveTest: runtime,
    blackBoxAdminVerification: metadata.blackBoxAdminVerification,
  });
}

export async function POST(request: Request, context: Context) {
  try {
    return await handleAdminContentVerifyPost(request, context);
  } catch {
    return NextResponse.json({ error: "Invalid verification request." }, { status: 400 });
  }
}
