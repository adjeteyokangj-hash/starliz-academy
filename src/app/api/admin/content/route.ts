import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { validateAiContentQuality } from "@/lib/ai/content-quality";
import { runContentBlackBoxTest, type BlackBoxContentTestResult } from "@/lib/ai/content-black-box-test";
import { validateSpellingContentContract } from "@/lib/content-governance";
import { resolveBlackBoxGatedSaveStatus } from "@/lib/ai/content-black-box-gate";
import { validateQuestionBatch } from "@/lib/starliz-question-validator";
import {
  GCSE_EXAM_BOARD_WARNING,
  GENERATION_CONTENT_TYPE_BY_SUBJECT,
  mapSubjectToLegacyContentType,
  normalizeExamBoard,
  normalizeSubject,
  shouldApplyExamBoardTag,
  type Subject,
} from "@/lib/curriculum";
import type { DiagnosticOutcomeCode } from "@/lib/ai/generator-tuple-validation";

type SaveRequestTuple = {
  yearGroup: string | null;
  keyStage: string | null;
  subject: string;
  strand: string | null;
  skillFocus: string;
  difficulty: number;
  itemCount: number;
};

export type ContentSaveBlockPayload = {
  error: string;
  diagnosticOutcome: DiagnosticOutcomeCode;
  requestTuple: SaveRequestTuple | null;
  formulaErrors?: string[];
  blackBoxContentTest?: BlackBoxContentTestResult;
};

export function buildContentSaveBlockPayload(input: ContentSaveBlockPayload): ContentSaveBlockPayload {
  return {
    error: input.error,
    diagnosticOutcome: input.diagnosticOutcome,
    requestTuple: input.requestTuple,
    ...(input.formulaErrors ? { formulaErrors: input.formulaErrors } : {}),
    ...(input.blackBoxContentTest ? { blackBoxContentTest: input.blackBoxContentTest } : {}),
  };
}

function isReadingComprehensionSkill(skillFocus: string | null | undefined): boolean {
  const normalized = String(skillFocus ?? "").trim().toLowerCase();
  return normalized === "reading comprehension" || normalized.includes("reading comprehension");
}

function mapSubjectToGenerationType(
  subject: Subject,
  skillFocus?: string,
): "spelling" | "phonics" | "punctuation" | "grammar" | "writing" | "reading" | "maths" | "languages" | "science" {
  const mapped = GENERATION_CONTENT_TYPE_BY_SUBJECT[subject];
  if (mapped === "phonics") return "phonics";
  if (mapped === "spelling") return "spelling";
  if (mapped === "punctuation") return "punctuation";
  if (mapped === "grammar") return "grammar";
  if (mapped === "science") return "science";
  if (mapped === "languages") return "languages";
  if (mapped === "english-language" && isReadingComprehensionSkill(skillFocus)) return "reading";
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
  curriculumFramework: z.string().optional(),
  countryRegion: z.string().optional(),
  examBoard: z.string().optional(),
  examBoardSource: z.enum(["auto", "manual", "school_default"]).optional(),
  examBoardConfidence: z.number().min(0).max(1).optional(),
  examBoardReason: z.string().optional(),
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
  visualSettings: z.object({
    enabled: z.boolean().optional(),
    mode: z.enum(["none", "planned_only", "generate_now"]).optional(),
    maxPerLesson: z.number().int().min(0).max(6).optional(),
    allowedSubjects: z.array(z.string()).optional(),
    requireApproval: z.boolean().optional(),
  }).optional(),
});

function extractGeneratedItems(items: unknown): unknown {
  if (items && typeof items === "object" && !Array.isArray(items) && Array.isArray((items as Record<string, unknown>).items)) {
    return (items as Record<string, unknown>).items;
  }
  return items;
}

function normalizeToken(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function classifySaveDiagnosticOutcome(message: unknown): DiagnosticOutcomeCode {
  const normalized = String(message ?? "").toLowerCase();
  if (normalized.includes("difficulty") || normalized.includes("too easy") || normalized.includes("too hard")) {
    return "difficulty_mismatch";
  }
  if (normalized.includes("contamination") || normalized.includes("subject drift") || normalized.includes("subject containment")) {
    return "subject_contamination";
  }
  if (normalized.includes("unsupported") || normalized.includes("map") || normalized.includes("exam board")) {
    return "policy_mismatch";
  }
  if (normalized.includes("invalid")) {
    return "invalid_generated_content";
  }
  return "save_blocked";
}

function contentItemSignature(item: unknown): string {
  if (!item || typeof item !== "object") return normalizeToken(item);
  const row = item as Record<string, unknown>;
  return [
    row.type,
    row.question,
    row.prompt,
    row.word,
    row.title,
    row.answer,
    row.sentence,
    row.sentenceContext,
    row.topic,
  ]
    .map((value) => normalizeToken(value))
    .filter(Boolean)
    .join("|");
}

function lessonContentSignature(content: unknown): string {
  const records = Array.isArray(content)
    ? content
    : content && typeof content === "object"
      ? [content]
      : [];
  return records
    .map((item) => contentItemSignature(item))
    .filter(Boolean)
    .sort()
    .join("||");
}

function attachSelectedMetadataToItems(
  items: unknown,
  meta: {
    subject: string;
    yearGroup?: string;
    keyStage?: string;
    curriculumPathway?: string;
    examBoard?: string | null;
    examBoardSource?: string;
    examBoardConfidence?: number;
    examBoardReason?: string;
    curriculumFramework?: string;
    countryRegion?: string;
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
      examBoardSource: meta.examBoardSource ?? "auto",
      examBoardConfidence: typeof meta.examBoardConfidence === "number" ? meta.examBoardConfidence : 0,
      examBoardReason: meta.examBoardReason ?? null,
      curriculumFramework: meta.curriculumFramework ?? "National Curriculum England",
      countryRegion: meta.countryRegion ?? "UK",
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
    select: {
      id: true,
      contentType: true,
      level: true,
      topic: true,
      contentJson: true,
      usedCount: true,
      createdAt: true,
      createdBy: true,
      status: true,
      model: true,
      prompt: true,
      keyStage: true,
      yearGroup: true,
      skillFocus: true,
      metadataJson: true,
      reviewedAt: true,
      approvedAt: true,
      publishedAt: true,
    },
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
    const rawItems = extractGeneratedItems(body.items);
    const requestTuple: SaveRequestTuple = {
      yearGroup: body.yearGroup ?? null,
      keyStage: body.keyStage ?? null,
      subject: String(body.type ?? ""),
      strand: typeof (body as Record<string, unknown>).englishStrand === "string"
        ? String((body as Record<string, unknown>).englishStrand)
        : null,
      skillFocus: body.skillFocus ?? "",
      difficulty: body.difficulty,
      itemCount: Array.isArray(rawItems) ? rawItems.length : rawItems ? 1 : 0,
    };
    
    const normalizedSubject = normalizeSubject(body.type);
    if (!normalizedSubject) {
      return NextResponse.json(
        {
          error: `Unsupported subject type: ${body.type}`,
          diagnosticOutcome: "policy_mismatch",
          requestTuple,
        },
        { status: 422 },
      );
    }
    requestTuple.subject = normalizedSubject;

    // Map explicit subject into legacy content type used by student routes.
    const legacyType = mapSubjectToLegacyContentType(normalizedSubject);
    if (!legacyType) {
      return NextResponse.json(
        {
          error: `Unable to map subject to content type: ${body.type}`,
          diagnosticOutcome: "policy_mismatch",
          requestTuple,
        },
        { status: 422 },
      );
    }
    const generationType = mapSubjectToGenerationType(normalizedSubject, body.skillFocus);
    const maxDifficulty = legacyType === "reading" ? 10 : 5;
    
    if (body.difficulty > maxDifficulty) {
      return NextResponse.json(
        {
          error: `Difficulty must be between 1 and ${maxDifficulty} for ${normalizedSubject}.`,
          diagnosticOutcome: "difficulty_mismatch",
          requestTuple,
        },
        { status: 422 },
      );
    }
    const status = resolveBlackBoxGatedSaveStatus(body.status);
    const contentItems = attachSelectedMetadataToItems(extractGeneratedItems(body.items), {
      subject: normalizedSubject,
      yearGroup: body.yearGroup,
      keyStage: body.keyStage,
      curriculumPathway: body.curriculumPathway,
      examBoard: normalizeExamBoard(body.examBoard),
      examBoardSource: body.examBoardSource,
      examBoardConfidence: body.examBoardConfidence,
      examBoardReason: body.examBoardReason,
      curriculumFramework: body.curriculumFramework,
      countryRegion: body.countryRegion,
      skillFocus: body.skillFocus,
      difficulty: body.difficulty,
      topic: body.topic,
    });
    const blackBoxContentTest = runContentBlackBoxTest({
      subject: normalizedSubject,
      strand: requestTuple.strand,
      keyStage: body.keyStage,
      yearGroup: body.yearGroup,
      level: body.difficulty,
      difficulty: body.difficulty,
      topic: body.topic,
      skillFocus: body.skillFocus,
      questionType: body.itemSchema ?? generationType,
      items: rawItems,
    });
    const blockedPayload = (input: Omit<ContentSaveBlockPayload, "requestTuple" | "blackBoxContentTest">) =>
      buildContentSaveBlockPayload({
        ...input,
        requestTuple,
        blackBoxContentTest,
      });

    if (legacyType === "spelling") {
      const spellingContract = validateSpellingContentContract(contentItems);
      if (!spellingContract.ok) {
        return NextResponse.json(blockedPayload({
          error: spellingContract.reason ?? "Invalid spelling content.",
          diagnosticOutcome: "invalid_generated_content",
        }), { status: 422 });
      }
    }
    const quality = validateAiContentQuality({
      type: generationType,
      keyStage: body.keyStage,
      yearGroup: body.yearGroup,
      skillFocus: body.skillFocus,
      items: contentItems,
    });
    if (!quality.ok) {
      const qualityError = quality.error ?? "Generated content failed validation.";
      return NextResponse.json(blockedPayload({
        error: qualityError,
        diagnosticOutcome: classifySaveDiagnosticOutcome(qualityError),
      }), { status: 422 });
    }

    // ── StarLiz question formula validation ──────────────────────────────────
    // Applied to maths/reading/science question-style content.
    // Blocks hard errors (missing prompt/answer/explanation).
    // Warnings are collected and returned alongside the saved item.
    const questionFormulaWarnings: string[] = [];
    if (
      Array.isArray(contentItems) &&
      (generationType === "maths" || generationType === "reading")
    ) {
      const formulaResult = validateQuestionBatch(contentItems, { mode: "warn" });
      if (!formulaResult.ok) {
        // Hard errors: missing prompt or answer — block the save.
        const hardErrors = formulaResult.invalid.flatMap(({ errors }) =>
          errors.filter(
            (e) =>
              e.includes("missing a prompt") ||
              e.includes("missing the correct answer"),
          ),
        );
        if (hardErrors.length > 0) {
          return NextResponse.json(
            blockedPayload({
              error: `Question formula validation failed: ${hardErrors.join("; ")}`,
              formulaErrors: hardErrors,
              diagnosticOutcome: "save_blocked",
            }),
            { status: 422 },
          );
        }
      }
      // Soft warnings (missing explanation, hints, workedSolution) — pass through.
      if (formulaResult.errors.length > 0) {
        questionFormulaWarnings.push(...formulaResult.errors);
      }
    }
    if (blackBoxContentTest.decision === "REJECT") {
      return NextResponse.json(
        blockedPayload({
          error: "Black box content test rejected generated content.",
          diagnosticOutcome: "invalid_generated_content",
        }),
        { status: 422 },
      );
    }

    if (blackBoxContentTest.decision !== "APPROVE") {
      questionFormulaWarnings.push(
        `Black box content test decision: ${blackBoxContentTest.decision}. Admin review is required before publishing.`,
      );
    }

    const shouldTagExamBoard = shouldApplyExamBoardTag({
      yearGroup: body.yearGroup,
      keyStage: body.keyStage,
      curriculumPathway: body.curriculumPathway,
      subject: normalizedSubject,
    });
    const normalizedExamBoard = shouldTagExamBoard ? normalizeExamBoard(body.examBoard) : null;
    const warnings: string[] = [];
    const topicKey = body.topic || body.skillFocus || body.ageGroup || "";
    const incomingSignature = lessonContentSignature(contentItems);

    if (incomingSignature) {
      const candidates = await prisma.aIContentCache.findMany({
        where: {
          contentType: legacyType,
          level: body.difficulty,
          topic: topicKey,
          keyStage: body.keyStage,
          yearGroup: body.yearGroup,
          skillFocus: body.skillFocus,
        },
        orderBy: { createdAt: "desc" },
        take: 25,
      });

      const duplicate = candidates.find((candidate) => {
        let parsedContent: unknown = [];
        try {
          parsedContent = candidate.contentJson ? JSON.parse(candidate.contentJson) : [];
        } catch {
          parsedContent = [];
        }
        const candidateSignature = lessonContentSignature(extractGeneratedItems(parsedContent));
        return Boolean(candidateSignature) && candidateSignature === incomingSignature;
      });

      if (duplicate) {
        return NextResponse.json({
          duplicate: true,
          message: "Duplicate lesson already exists in Content Library.",
          item: duplicate,
          warnings: [...warnings, ...questionFormulaWarnings],
          diagnosticOutcome: "save_blocked",
          requestTuple,
        }, { status: 200 });
      }
    }

    if (shouldTagExamBoard && !normalizedExamBoard) {
      warnings.push(GCSE_EXAM_BOARD_WARNING);
    }

    const item = await prisma.aIContentCache.create({
      data: {
        contentType: legacyType,
        level: body.difficulty,
        topic: topicKey,
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
          curriculumFramework: body.curriculumFramework,
          countryRegion: body.countryRegion,
          examBoard: normalizedExamBoard,
          examBoardSource: body.examBoardSource ?? "auto",
          examBoardConfidence: body.examBoardConfidence ?? null,
          examBoardReason: body.examBoardReason ?? null,
          skillFocus: body.skillFocus,
          difficulty: body.difficulty,
          topic: body.topic,
          qualityScore: (body.items as Record<string, unknown> | null)?.qualityScore ?? null,
          safetyStatus: (body.items as Record<string, unknown> | null)?.safetyStatus ?? null,
          blackBoxContentTest,
          approvalStatus: body.status,
          visualSettings: body.visualSettings,
          visualAssets: (() => {
            const preview = body.items && typeof body.items === "object" && !Array.isArray(body.items)
              ? body.items as Record<string, unknown>
              : null;
            return Array.isArray(preview?.visualAssets) ? preview?.visualAssets : [];
          })(),
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
        examBoardSource: body.examBoardSource ?? "auto",
        examBoardConfidence: body.examBoardConfidence ?? null,
        examBoardReason: body.examBoardReason ?? null,
        curriculumFramework: body.curriculumFramework,
        countryRegion: body.countryRegion,
        skillFocus: body.skillFocus,
        blackBoxContentTest: {
          decision: blackBoxContentTest.decision,
          score: Math.round(blackBoxContentTest.passRate * 100),
          maxScore: 100,
          rawScore: blackBoxContentTest.score,
          rawMaxScore: blackBoxContentTest.maxScore,
          passRate: blackBoxContentTest.passRate,
          reasons: blackBoxContentTest.reasons,
          itemChecks: blackBoxContentTest.itemResults.map((result) => ({
            itemIndex: result.index,
            score: Math.round((result.score / Math.max(1, result.maxScore)) * 100),
            reasons: result.reasons,
          })),
          recommendation: blackBoxContentTest.recommendation ?? null,
        },
      },
    });

    return NextResponse.json({ item, warnings: [...warnings, ...questionFormulaWarnings] }, { status: 201 });
  } catch (error) {
    console.error("Content save error:", error);
    return NextResponse.json({
      error: "Invalid content payload.",
      diagnosticOutcome: "save_blocked",
      requestTuple: null,
    }, { status: 400 });
  }
}
