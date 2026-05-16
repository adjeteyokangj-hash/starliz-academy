import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { validateAiContentQuality } from "@/lib/ai/content-quality";
import {
  GCSE_EXAM_BOARD_WARNING,
  GENERATION_CONTENT_TYPE_BY_SUBJECT,
  mapSubjectToLegacyContentType,
  normalizeExamBoard,
  normalizeSubject,
  shouldApplyExamBoardTag,
  type Subject,
} from "@/lib/curriculum";

function mapSubjectToGenerationType(subject: Subject): "spelling" | "phonics" | "punctuation" | "grammar" | "writing" | "reading" | "maths" {
  const mapped = GENERATION_CONTENT_TYPE_BY_SUBJECT[subject];
  if (mapped === "phonics") return "phonics";
  if (mapped === "spelling") return "spelling";
  if (mapped === "punctuation") return "punctuation";
  if (mapped === "grammar") return "grammar";
  if (mapped === "writing" || mapped === "english-language") return "writing";
  if (mapped === "reading" || mapped === "vocabulary" || mapped === "english-literature") return "reading";
  return "maths";
}

const saveContentSchema = z.object({
  type: z.string(), // Accept both legacy types and new Subject types
  ageGroup: z.string().optional(),
  keyStage: z.string().optional(),
  yearGroup: z.string().optional(),
  curriculumPathway: z.string().optional(),
  examBoard: z.string().optional(),
  skillFocus: z.string().optional(),
  generationType: z.string().optional(),
  itemSchema: z.string().optional(),
  difficulty: z.number().int().min(1).max(10),
  topic: z.string().optional(),
  items: z.unknown(),
  status: z.enum(["generated", "review", "reviewed", "approved", "published", "rejected"]).default("generated"),
  model: z.string().optional(),
  prompt: z.string().optional(),
  estimatedCostPence: z.number().int().min(0).optional(),
});

function extractGeneratedItems(items: unknown): unknown {
  if (items && typeof items === "object" && !Array.isArray(items) && Array.isArray((items as Record<string, unknown>).items)) {
    return (items as Record<string, unknown>).items;
  }
  return items;
}

function attachSelectedMetadataToItems(
  items: unknown,
  meta: {
    subject: string;
    yearGroup?: string;
    keyStage?: string;
    curriculumPathway?: string;
    examBoard?: string | null;
    skillFocus?: string;
    difficulty: number;
    topic?: string;
  },
) {
  const records = Array.isArray(items) ? items : items && typeof items === "object" ? [items] : [];
  return records.map((item) => {
    const row = (item && typeof item === "object") ? (item as Record<string, unknown>) : {};
    return {
      ...row,
      subject: meta.subject,
      yearGroup: meta.yearGroup ?? null,
      keyStage: meta.keyStage ?? null,
      curriculumPathway: meta.curriculumPathway ?? null,
      examBoard: meta.examBoard ?? null,
      skillFocus: meta.skillFocus ?? null,
      difficulty: meta.difficulty,
      topic: meta.topic ?? row.topic ?? null,
    };
  });
}

export async function GET(req: Request) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  const { searchParams } = new URL(req.url);
  const contentType = searchParams.get("type") ?? undefined;
  const level = searchParams.get("level") ? Number(searchParams.get("level")) : undefined;
  const skillParam = searchParams.get("skill") ?? undefined;
  const keyStage = searchParams.get("keyStage") ?? undefined;
  const yearGroup = searchParams.get("yearGroup") ?? undefined;

  const items = await prisma.aIContentCache.findMany({
    where: {
      ...(contentType ? { contentType } : {}),
      ...(level !== undefined ? { level } : {}),
      ...(keyStage ? { keyStage } : {}),
      ...(yearGroup ? { yearGroup } : {}),
      ...(skillParam ? { OR: [{ skillFocus: { contains: skillParam } }, { skills: { contains: skillParam } }] } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({
    items: items.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      reviewedAt: item.reviewedAt?.toISOString() ?? null,
      approvedAt: item.approvedAt?.toISOString() ?? null,
      publishedAt: item.publishedAt?.toISOString() ?? null,
    })),
  });
}

export async function DELETE(req: Request) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  const { id } = await req.json();
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  await prisma.aIContentCache.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  try {
    const body = saveContentSchema.parse(await req.json());
    
    const normalizedSubject = normalizeSubject(body.type);
    if (!normalizedSubject) {
      return NextResponse.json(
        { error: `Unsupported subject type: ${body.type}` },
        { status: 422 },
      );
    }

    // Map explicit subject into legacy content type used by student routes.
    const legacyType = mapSubjectToLegacyContentType(normalizedSubject);
    if (!legacyType) {
      return NextResponse.json(
        { error: `Unable to map subject to content type: ${body.type}` },
        { status: 422 },
      );
    }
    const generationType = mapSubjectToGenerationType(normalizedSubject);
    const maxDifficulty = legacyType === "reading" ? 10 : 5;
    
    if (body.difficulty > maxDifficulty) {
      return NextResponse.json(
        { error: `Difficulty must be between 1 and ${maxDifficulty} for ${normalizedSubject}.` },
        { status: 422 },
      );
    }
    const status = body.status === "review" ? "reviewed" : body.status;
    const contentItems = attachSelectedMetadataToItems(extractGeneratedItems(body.items), {
      subject: normalizedSubject,
      yearGroup: body.yearGroup,
      keyStage: body.keyStage,
      curriculumPathway: body.curriculumPathway,
      examBoard: normalizeExamBoard(body.examBoard),
      skillFocus: body.skillFocus,
      difficulty: body.difficulty,
      topic: body.topic,
    });
    const quality = validateAiContentQuality({
      type: generationType,
      keyStage: body.keyStage,
      yearGroup: body.yearGroup,
      skillFocus: body.skillFocus,
      items: contentItems,
    });
    if (!quality.ok) {
      return NextResponse.json({ error: quality.error }, { status: 422 });
    }

    const shouldTagExamBoard = shouldApplyExamBoardTag({
      yearGroup: body.yearGroup,
      keyStage: body.keyStage,
      curriculumPathway: body.curriculumPathway,
      subject: normalizedSubject,
    });
    const normalizedExamBoard = shouldTagExamBoard ? normalizeExamBoard(body.examBoard) : null;
    const warnings: string[] = [];
    if (shouldTagExamBoard && !normalizedExamBoard) {
      warnings.push(GCSE_EXAM_BOARD_WARNING);
    }

    const item = await prisma.aIContentCache.create({
      data: {
        contentType: legacyType,
        level: body.difficulty,
        topic: body.topic || body.skillFocus || body.ageGroup || "",
        contentJson: JSON.stringify(contentItems),
        status,
        reviewedAt: status === "reviewed" ? new Date() : undefined,
        approvedAt: status === "approved" || status === "published" ? new Date() : undefined,
        publishedAt: status === "published" ? new Date() : undefined,
        createdBy: session.email,
        model: body.model,
        prompt: body.prompt,
        keyStage: body.keyStage,
        yearGroup: body.yearGroup,
        skillFocus: body.skillFocus,
        estimatedCostPence: body.estimatedCostPence ?? 0,
        metadataJson: JSON.stringify({
          ageGroup: body.ageGroup,
          source: "ai-generator",
          version: 2,
          subject: normalizedSubject,
          legacyType: legacyType,
          generationType,
          itemSchema: body.itemSchema ?? generationType,
          yearGroup: body.yearGroup,
          keyStage: body.keyStage,
          curriculumPathway: body.curriculumPathway,
          examBoard: normalizedExamBoard,
          skillFocus: body.skillFocus,
          difficulty: body.difficulty,
          topic: body.topic,
          qualityScore: (body.items as Record<string, unknown> | null)?.qualityScore ?? null,
          safetyStatus: (body.items as Record<string, unknown> | null)?.safetyStatus ?? null,
          approvalStatus: body.status,
          generatedPreview: body.items && typeof body.items === "object" && !Array.isArray(body.items) ? body.items : undefined,
        }),
      },
    });

    await writeAuditLog({
      actorUserId: session.userId,
      action: "ai_content.saved",
      entityType: "AIContentCache",
      entityId: item.id,
      metadata: {
        subject: normalizedSubject,
        legacyType,
        generationType,
        status,
        ageGroup: body.ageGroup,
        keyStage: body.keyStage,
        yearGroup: body.yearGroup,
        curriculumPathway: body.curriculumPathway,
        examBoard: normalizedExamBoard,
        skillFocus: body.skillFocus,
      },
    });

    return NextResponse.json({ item, warnings }, { status: 201 });
  } catch (error) {
    console.error("Content save error:", error);
    return NextResponse.json({ error: "Invalid content payload." }, { status: 400 });
  }
}
