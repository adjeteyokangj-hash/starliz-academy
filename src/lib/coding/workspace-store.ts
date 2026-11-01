import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { assessCodingStage, codingCertificateCopy, deriveSkillStatus, freshEvidence, stageUnlocked } from "@/lib/coding/assessment";
import { codingLessonById, stageBrief, UNDERSTANDING_LOOPS, type CodingLessonBrief } from "@/lib/coding/catalog";
import { recommendCodingPathway, type PlacementRecommendation } from "@/lib/coding/placement";
import { CODING_REWARD_AMOUNTS, EMPTY_REWARD_FLAGS, nextCodingRewards, type CodingRewardFlags } from "@/lib/coding/rewards";
import { codingRunSelection } from "@/lib/coding/editor";
import { emptyProgram, parseCodingProgram, runCodingProgram } from "@/lib/coding/runner";
import { buildCodingSupportHandoff, type CodingSupportHandoff } from "@/lib/coding/support-handoff";
import { nextCodingHint } from "@/lib/coding/tutor";
import {
  CODING_STAGES,
  PLACEMENT_LESSON_ID,
  type CodingEvidence,
  type CodingProgram,
  type CodingRunResult,
  type CodingSkillStatus,
  type CodingStage,
} from "@/lib/coding/types";
import { applyWalletMutation } from "@/lib/wallet_ledger";

const SKILL_FOCUS = "Understanding loops";
const SKILL_CODE = "coding_loops";

type HintState = {
  counts: Partial<Record<CodingStage, number>>;
  revealing: Partial<Record<CodingStage, number>>;
  messages: Partial<Record<CodingStage, string[]>>;
};

type ProgramMap = Partial<Record<CodingStage, CodingProgram>>;
type UndoMap = Partial<Record<CodingStage, CodingProgram[]>>;

export type CodingWorkspaceView = {
  lesson: CodingLessonBrief;
  stage: CodingStage;
  completedStages: CodingStage[];
  program: CodingProgram;
  evidence: CodingEvidence;
  skillStatus: CodingSkillStatus;
  feedback: string | null;
  run: CodingRunResult | null;
  teacherFeedback: string | null;
  privateProject: boolean;
  assignmentStatus: string;
  attemptCount: number;
  checksPassed: number;
  hintCount: number;
  yearGroup: string | null;
  placement: PlacementRecommendation | null;
};

function asStatus(value: string | null | undefined): CodingSkillStatus {
  if (value === "learning" || value === "practising" || value === "mastered") return value;
  return "not_started";
}

function asStage(value: string | null | undefined): CodingStage {
  if (CODING_STAGES.includes(value as CodingStage)) return value as CodingStage;
  return "discover";
}

function readJson(raw: string | null | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readPrograms(raw: string): ProgramMap {
  const parsed = readJson(raw);
  if (!isRecord(parsed)) return {};
  const programs: ProgramMap = {};
  for (const stage of CODING_STAGES) {
    const result = parseCodingProgram(parsed[stage]);
    if (result.ok) programs[stage] = result.program;
  }
  return programs;
}

function readUndo(raw: string): UndoMap {
  const parsed = readJson(raw);
  if (!isRecord(parsed)) return {};
  const undo: UndoMap = {};
  for (const stage of CODING_STAGES) {
    const list = parsed[stage];
    if (!Array.isArray(list)) continue;
    const programs: CodingProgram[] = [];
    for (const item of list) {
      const result = parseCodingProgram(item);
      if (result.ok) programs.push(result.program);
    }
    undo[stage] = programs.slice(-20);
  }
  return undo;
}

function readCompleted(raw: string): CodingStage[] {
  const parsed = readJson(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((stage): stage is CodingStage => CODING_STAGES.includes(stage as CodingStage));
}

function readEvidence(raw: string): CodingEvidence {
  const parsed = readJson(raw);
  const base = freshEvidence();
  if (!isRecord(parsed)) return base;
  return {
    prediction: parsed.prediction === true,
    practical: parsed.practical === true,
    debugging: parsed.debugging === true,
    explanation: parsed.explanation === true,
    independent: parsed.independent === true,
  };
}

function readHints(raw: string): HintState {
  const parsed = readJson(raw);
  const empty: HintState = { counts: {}, revealing: {}, messages: {} };
  if (!isRecord(parsed)) return empty;
  const counts = isRecord(parsed.counts) ? parsed.counts : {};
  const revealing = isRecord(parsed.revealing) ? parsed.revealing : {};
  const messages = isRecord(parsed.messages) ? parsed.messages : {};
  for (const stage of CODING_STAGES) {
    if (typeof counts[stage] === "number") empty.counts[stage] = counts[stage] as number;
    if (typeof revealing[stage] === "number") empty.revealing[stage] = revealing[stage] as number;
    if (Array.isArray(messages[stage])) {
      empty.messages[stage] = messages[stage].filter((item): item is string => typeof item === "string").slice(-6);
    }
  }
  return empty;
}

function readFlags(raw: string): CodingRewardFlags {
  const parsed = readJson(raw);
  if (!isRecord(parsed)) return { ...EMPTY_REWARD_FLAGS, failedStages: [] };
  return {
    persistence: parsed.persistence === true,
    improvement: parsed.improvement === true,
    mastery: parsed.mastery === true,
    failedStages: Array.isArray(parsed.failedStages)
      ? parsed.failedStages.filter((item): item is string => typeof item === "string")
      : [],
  };
}

function readPlacement(raw: string | null): PlacementRecommendation | null {
  const parsed = readJson(raw);
  if (!isRecord(parsed)) return null;
  if (typeof parsed.recommended !== "string" || typeof parsed.note !== "string") return null;
  return parsed as PlacementRecommendation;
}

function programFor(programs: ProgramMap, lesson: CodingLessonBrief, stage: CodingStage): CodingProgram {
  return programs[stage] ?? stageBrief(lesson, stage).starter ?? emptyProgram();
}

function masteryLevelFor(status: CodingSkillStatus): string {
  if (status === "mastered") return "mastered";
  if (status === "practising") return "developing";
  if (status === "learning") return "practising";
  return "new";
}

async function rememberVersion(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  stage: CodingStage,
  label: string,
  program: CodingProgram,
) {
  await tx.codingProjectVersion.create({
    data: { workspaceId, stage, label, programJson: JSON.stringify(program) },
  });
  const extra = await tx.codingProjectVersion.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    skip: 15,
    select: { id: true },
  });
  if (extra.length) {
    await tx.codingProjectVersion.deleteMany({ where: { id: { in: extra.map((row) => row.id) } } });
  }
}

async function syncProgress(
  tx: Prisma.TransactionClient,
  input: {
    childId: string;
    lesson: CodingLessonBrief;
    yearGroup: string | null;
    previousStatus: CodingSkillStatus;
    nextStatus: CodingSkillStatus;
    flags: CodingRewardFlags;
    stage: CodingStage;
    passed: boolean;
    attemptCount: number;
    checksPassed: number;
    hintsUsed: number;
  },
): Promise<CodingRewardFlags> {
  const reward = nextCodingRewards({
    flags: input.flags,
    previousStatus: input.previousStatus,
    nextStatus: input.nextStatus,
    stage: input.stage,
    passed: input.passed,
  });
  const accuracy = input.attemptCount > 0 ? Math.round((input.checksPassed / input.attemptCount) * 100) : 0;
  await tx.skillMastery.upsert({
    where: {
      childId_subject_skillFocus: {
        childId: input.childId,
        subject: "coding",
        skillFocus: SKILL_FOCUS,
      },
    },
    create: {
      childId: input.childId,
      subject: "coding",
      skillFocus: SKILL_FOCUS,
      masteryLevel: masteryLevelFor(input.nextStatus),
      attemptCount: 1,
      correctCount: input.passed ? 1 : 0,
      lastAttemptAt: new Date(),
      lastMasteredAt: input.nextStatus === "mastered" ? new Date() : null,
    },
    update: {
      masteryLevel: masteryLevelFor(input.nextStatus),
      attemptCount: { increment: 1 },
      correctCount: input.passed ? { increment: 1 } : undefined,
      lastAttemptAt: new Date(),
      lastMasteredAt: input.nextStatus === "mastered" ? new Date() : undefined,
    },
  });
  await tx.studentSkill.upsert({
    where: { studentId_skill: { studentId: input.childId, skill: SKILL_CODE } },
    create: {
      studentId: input.childId,
      skill: SKILL_CODE,
      accuracy,
      attempts: input.attemptCount,
      correct: input.checksPassed,
      status: input.nextStatus === "mastered" ? "mastered" : "improving",
    },
    update: {
      accuracy,
      attempts: input.attemptCount,
      correct: input.checksPassed,
      status: input.nextStatus === "mastered" ? "mastered" : "improving",
    },
  });
  await tx.attempt.create({
    data: {
      studentId: input.childId,
      subject: "coding",
      yearGroup: input.yearGroup,
      skillFocus: SKILL_FOCUS,
      questionText: input.stage,
      correct: input.passed,
      responseTimeMs: 0,
      hintsUsed: input.hintsUsed,
      difficulty: input.lesson.difficulty,
      skills: SKILL_CODE,
    },
  });
  for (const kind of reward.awards) {
    const amount = CODING_REWARD_AMOUNTS[kind];
    await applyWalletMutation(tx, {
      childId: input.childId,
      type: "earn",
      amount: amount.coins,
      source: "coding",
      reason: amount.reason,
      starsDelta: amount.stars,
      xpDelta: amount.xp,
      metadata: { subject: "coding", activityName: input.lesson.title },
    });
    await tx.progressRecord.create({
      data: {
        childId: input.childId,
        activityType: "coding",
        activityName: `${input.lesson.title} · ${kind}`,
        starsEarned: amount.stars,
        xpEarned: amount.xp,
        coinsEarned: amount.coins,
        score: input.passed ? 1 : 0,
        correct: input.passed,
        difficulty: input.lesson.difficulty,
        notes: amount.reason,
        accuracy,
        completed: input.nextStatus === "mastered",
      },
    });
  }
  if (input.nextStatus === "mastered") {
    const idempotencyKey = `coding-mastery:${input.childId}:${input.lesson.id}`;
    const existing = await tx.certificate.findUnique({ where: { idempotencyKey }, select: { id: true } });
    if (!existing) {
      const copy = codingCertificateCopy({
        pathwayTitle: input.lesson.pathwayTitle,
        skills: input.lesson.skills,
      });
      const hash = createHash("sha256").update(idempotencyKey).digest("hex");
      await tx.certificate.create({
        data: {
          studentId: input.childId,
          certificateNumber: `SLC-${hash.slice(0, 10).toUpperCase()}`,
          verificationCode: hash.slice(10, 22).toUpperCase(),
          idempotencyKey,
          certificateType: "subject_achievement",
          title: copy.title,
          awardReason: copy.body,
          subject: "coding",
          level: input.lesson.pathwayTitle,
          yearGroup: input.yearGroup,
          issuedAt: new Date(),
          metadataJson: JSON.stringify({
            pathway: input.lesson.pathwayTitle,
            course: input.lesson.courseTitle,
            module: input.lesson.moduleTitle,
            lesson: input.lesson.title,
            skills: input.lesson.skills,
          }),
          awardSourceType: "coding_lesson",
          awardSourceId: input.lesson.id,
        },
      });
    }
  }
  return reward.flags;
}

async function ensureWorkspace(childId: string, lessonId: string, yearGroup: string | null) {
  const lesson = codingLessonById(lessonId);
  if (!lesson) return null;
  return prisma.codingWorkspace.upsert({
    where: { childId_lessonId: { childId, lessonId } },
    create: {
      childId,
      lessonId,
      yearGroup,
      pathwayId: lesson.pathwayId,
      stage: "discover",
      privateProject: true,
    },
    update: yearGroup ? { yearGroup } : {},
  });
}

function toView(input: {
  lesson: CodingLessonBrief;
  row: {
    stage: string;
    programsJson: string;
    completedStagesJson: string;
    evidenceJson: string;
    hintCountsJson: string;
    skillStatus: string;
    lastFeedback: string | null;
    lastRunJson: string | null;
    teacherFeedback: string | null;
    privateProject: boolean;
    assignmentStatus: string;
    attemptCount: number;
    checksPassed: number;
    yearGroup: string | null;
  };
  placement: PlacementRecommendation | null;
}): CodingWorkspaceView {
  const stage = asStage(input.row.stage);
  const programs = readPrograms(input.row.programsJson);
  const hints = readHints(input.row.hintCountsJson);
  const run = readJson(input.row.lastRunJson);
  return {
    lesson: input.lesson,
    stage,
    completedStages: readCompleted(input.row.completedStagesJson),
    program: programFor(programs, input.lesson, stage),
    evidence: readEvidence(input.row.evidenceJson),
    skillStatus: asStatus(input.row.skillStatus),
    feedback: input.row.lastFeedback,
    run: isRecord(run) ? run as CodingRunResult : null,
    teacherFeedback: input.row.teacherFeedback,
    privateProject: input.row.privateProject,
    assignmentStatus: input.row.assignmentStatus,
    attemptCount: input.row.attemptCount,
    checksPassed: input.row.checksPassed,
    hintCount: hints.counts[stage] ?? 0,
    yearGroup: input.row.yearGroup,
    placement: input.placement,
  };
}

async function placementFor(childId: string): Promise<PlacementRecommendation | null> {
  const row = await prisma.codingWorkspace.findUnique({
    where: { childId_lessonId: { childId, lessonId: PLACEMENT_LESSON_ID } },
    select: { placementJson: true },
  });
  return readPlacement(row?.placementJson ?? null);
}

export async function loadCodingWorkspace(childId: string, lessonId: string, yearGroup: string | null): Promise<CodingWorkspaceView | null> {
  const lesson = codingLessonById(lessonId);
  if (!lesson) return null;
  const row = await ensureWorkspace(childId, lessonId, yearGroup);
  if (!row) return null;
  return toView({ lesson, row, placement: await placementFor(childId) });
}

export async function loadCodingHome(childId: string, yearGroup: string | null) {
  const placement = await placementFor(childId);
  const row = await prisma.codingWorkspace.findUnique({
    where: { childId_lessonId: { childId, lessonId: UNDERSTANDING_LOOPS.id } },
  });
  return {
    yearGroup,
    placement,
    workspace: row
      ? toView({ lesson: UNDERSTANDING_LOOPS, row, placement })
      : null,
  };
}

function sameProgram(left: CodingProgram, right: CodingProgram): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function saveCodingProgram(input: {
  childId: string;
  lessonId: string;
  yearGroup: string | null;
  stage: CodingStage;
  program: unknown;
}) {
  const lesson = codingLessonById(input.lessonId);
  if (!lesson) return { ok: false as const, error: "This coding lesson is not published yet." };
  const parsed = parseCodingProgram(input.program);
  if (!parsed.ok) return { ok: false as const, error: parsed.error };
  const row = await ensureWorkspace(input.childId, input.lessonId, input.yearGroup);
  if (!row) return { ok: false as const, error: "This coding lesson is not published yet." };
  const completed = readCompleted(row.completedStagesJson);
  if (!stageUnlocked(input.stage, completed)) {
    return { ok: false as const, error: "Finish the previous part of the lesson first." };
  }
  const programs = readPrograms(row.programsJson);
  const undo = readUndo(row.undoJson);
  const current = programFor(programs, lesson, input.stage);
  if (!sameProgram(current, parsed.program)) {
    const stack = undo[input.stage] ?? [];
    stack.push(current);
    undo[input.stage] = stack.slice(-20);
  }
  programs[input.stage] = parsed.program;
  const saved = await prisma.$transaction(async (tx) => {
    const updated = await tx.codingWorkspace.update({
      where: { id: row.id },
      data: {
        stage: input.stage,
        programsJson: JSON.stringify(programs),
        undoJson: JSON.stringify(undo),
        yearGroup: input.yearGroup ?? row.yearGroup,
        skillStatus: row.skillStatus === "not_started" ? "learning" : row.skillStatus,
        assignmentStatus: row.assignmentStatus === "assigned" ? "started" : row.assignmentStatus,
      },
    });
    await rememberVersion(tx, row.id, input.stage, "save", parsed.program);
    return updated;
  });
  return { ok: true as const, workspace: toView({ lesson, row: saved, placement: await placementFor(input.childId) }) };
}

export async function openCodingStage(input: { childId: string; lessonId: string; stage: CodingStage }) {
  const lesson = codingLessonById(input.lessonId);
  if (!lesson) return { ok: false as const, error: "This coding lesson is not published yet." };
  const row = await ensureWorkspace(input.childId, input.lessonId, null);
  if (!row) return { ok: false as const, error: "This coding lesson is not published yet." };
  const completed = readCompleted(row.completedStagesJson);
  if (!stageUnlocked(input.stage, completed) && input.stage !== asStage(row.stage)) {
    return { ok: false as const, error: "Finish the previous part of the lesson first." };
  }
  const saved = await prisma.codingWorkspace.update({
    where: { id: row.id },
    data: { stage: input.stage },
  });
  return { ok: true as const, workspace: toView({ lesson, row: saved, placement: await placementFor(input.childId) }) };
}

export async function undoCodingProgram(input: { childId: string; lessonId: string; stage: CodingStage }) {
  const lesson = codingLessonById(input.lessonId);
  if (!lesson) return { ok: false as const, error: "This coding lesson is not published yet." };
  const row = await prisma.codingWorkspace.findUnique({
    where: { childId_lessonId: { childId: input.childId, lessonId: input.lessonId } },
  });
  if (!row) return { ok: false as const, error: "Nothing to undo yet." };
  const programs = readPrograms(row.programsJson);
  const undo = readUndo(row.undoJson);
  const stack = undo[input.stage] ?? [];
  const previous = stack.pop();
  if (!previous) return { ok: false as const, error: "Nothing to undo yet." };
  undo[input.stage] = stack;
  programs[input.stage] = previous;
  const saved = await prisma.codingWorkspace.update({
    where: { id: row.id },
    data: { programsJson: JSON.stringify(programs), undoJson: JSON.stringify(undo), stage: input.stage },
  });
  return { ok: true as const, workspace: toView({ lesson, row: saved, placement: await placementFor(input.childId) }) };
}

export async function restoreCodingStarter(input: { childId: string; lessonId: string; stage: CodingStage }) {
  const lesson = codingLessonById(input.lessonId);
  if (!lesson) return { ok: false as const, error: "This coding lesson is not published yet." };
  const starter = stageBrief(lesson, input.stage).starter;
  const saved = await saveCodingProgram({
    childId: input.childId,
    lessonId: input.lessonId,
    yearGroup: null,
    stage: input.stage,
    program: starter,
  });
  if (!saved.ok) return saved;
  const row = await prisma.codingWorkspace.findUnique({
    where: { childId_lessonId: { childId: input.childId, lessonId: input.lessonId } },
  });
  if (!row) return saved;
  const hints = readHints(row.hintCountsJson);
  delete hints.counts[input.stage];
  delete hints.revealing[input.stage];
  delete hints.messages[input.stage];
  const updated = await prisma.codingWorkspace.update({
    where: { id: row.id },
    data: { hintCountsJson: JSON.stringify(hints) },
  });
  return { ok: true as const, workspace: toView({ lesson, row: updated, placement: await placementFor(input.childId) }) };
}

export async function runCodingStage(input: {
  childId: string;
  lessonId: string;
  yearGroup: string | null;
  stage: CodingStage;
  program: unknown;
  runSource?: "example" | "learner";
}) {
  const lesson = codingLessonById(input.lessonId);
  if (!lesson) return { ok: false as const, error: "This coding lesson is not published yet." };
  const parsed = parseCodingProgram(input.program);
  if (!parsed.ok) return { ok: false as const, error: parsed.error };
  const row = await ensureWorkspace(input.childId, input.lessonId, input.yearGroup);
  if (!row) return { ok: false as const, error: "This coding lesson is not published yet." };
  const completed = readCompleted(row.completedStagesJson);
  if (!stageUnlocked(input.stage, completed)) {
    return { ok: false as const, error: "Finish the previous part of the lesson first." };
  }
  const evidence = readEvidence(row.evidenceJson);
  const hints = readHints(row.hintCountsJson);
  const graded = input.stage === "build" || input.stage === "practise" || input.stage === "debug" || input.stage === "create";
  if (!graded) {
    const brief = stageBrief(lesson, input.stage);
    const selection = codingRunSelection({
      graded: false,
      example: brief.example,
      learner: parsed.program,
      source: input.runSource,
    });
    const preview = runCodingProgram(selection.program, brief.goal);
    const programs = readPrograms(row.programsJson);
    programs[input.stage] = parsed.program;
    const label = selection.source === "example" ? "Lesson example" : "Your program";
    const saved = await prisma.codingWorkspace.update({
      where: { id: row.id },
      data: {
        stage: input.stage,
        programsJson: JSON.stringify(programs),
        lastRunJson: JSON.stringify(preview),
        lastFeedback: preview.error
          ? label + ": " + preview.error
          : selection.source === "example"
            ? "This is the lesson example. Your blocks stayed where you put them."
            : "This is your program. It is not the lesson example.",
        skillStatus: row.skillStatus === "not_started" ? "learning" : row.skillStatus,
        yearGroup: input.yearGroup ?? row.yearGroup,
      },
    });
    return {
      ok: true as const,
      passed: true,
      feedback: saved.lastFeedback,
      run: preview,
      runSource: selection.source,
      workspace: toView({ lesson, row: saved, placement: await placementFor(input.childId) }),
    };
  }
  const assessment = assessCodingStage({
    lesson,
    stage: input.stage,
    program: parsed.program,
    evidence,
    revealingHints: hints.revealing[input.stage] ?? 0,
  });
  const programs = readPrograms(row.programsJson);
  programs[input.stage] = parsed.program;
  let nextCompleted = completed;
  let nextStage = asStage(row.stage);
  if (graded && assessment.passed && !nextCompleted.includes(input.stage)) {
    nextCompleted = [...nextCompleted, input.stage];
    const index = CODING_STAGES.indexOf(input.stage);
    const following = CODING_STAGES[index + 1];
    if (following) nextStage = following;
  } else {
    nextStage = input.stage;
  }
  const started = nextCompleted.length > 0 || row.attemptCount > 0 || graded;
  const previousStatus = asStatus(row.skillStatus);
  const nextStatus = deriveSkillStatus(started, assessment.evidence);
  const attemptCount = row.attemptCount + (graded ? 1 : 0);
  const checksPassed = row.checksPassed + (graded && assessment.passed ? 1 : 0);
  const saved = await prisma.$transaction(async (tx) => {
    const flags = graded
      ? await syncProgress(tx, {
          childId: input.childId,
          lesson,
          yearGroup: input.yearGroup ?? row.yearGroup,
          previousStatus,
          nextStatus,
          flags: readFlags(row.rewardFlagsJson),
          stage: input.stage,
          passed: assessment.passed,
          attemptCount,
          checksPassed,
          hintsUsed: hints.counts[input.stage] ?? 0,
        })
      : readFlags(row.rewardFlagsJson);
    const updated = await tx.codingWorkspace.update({
      where: { id: row.id },
      data: {
        stage: nextStage,
        programsJson: JSON.stringify(programs),
        completedStagesJson: JSON.stringify(nextCompleted),
        evidenceJson: JSON.stringify(assessment.evidence),
        skillStatus: nextStatus,
        lastFeedback: assessment.feedback,
        lastRunJson: JSON.stringify(assessment.run),
        rewardFlagsJson: JSON.stringify(flags),
        attemptCount,
        checksPassed,
        yearGroup: input.yearGroup ?? row.yearGroup,
        assignmentStatus: assessment.passed && nextStatus === "mastered"
          ? "completed"
          : row.assignmentStatus === "assigned" ? "started" : row.assignmentStatus,
      },
    });
    if (graded && assessment.passed) {
      await rememberVersion(tx, row.id, input.stage, "check-passed", parsed.program);
    }
    return updated;
  });
  return {
    ok: true as const,
    passed: graded ? assessment.passed : true,
    feedback: assessment.feedback,
    run: assessment.run,
    runSource: "learner" as const,
    workspace: toView({ lesson, row: saved, placement: await placementFor(input.childId) }),
  };
}

export async function submitCodingPrompt(input: {
  childId: string;
  lessonId: string;
  yearGroup: string | null;
  stage: "discover" | "predict" | "review";
  choiceId?: string | null;
  explanation?: string | null;
}) {
  const lesson = codingLessonById(input.lessonId);
  if (!lesson) return { ok: false as const, error: "This coding lesson is not published yet." };
  const row = await ensureWorkspace(input.childId, input.lessonId, input.yearGroup);
  if (!row) return { ok: false as const, error: "This coding lesson is not published yet." };
  const completed = readCompleted(row.completedStagesJson);
  if (!stageUnlocked(input.stage, completed)) {
    return { ok: false as const, error: "Finish the previous part of the lesson first." };
  }
  const programs = readPrograms(row.programsJson);
  const program = programFor(programs, lesson, input.stage);
  const assessment = assessCodingStage({
    lesson,
    stage: input.stage,
    program,
    evidence: readEvidence(row.evidenceJson),
    predictionChoice: input.choiceId,
    explanation: input.explanation,
    revealingHints: 0,
  });
  let nextCompleted = completed;
  let nextStage = input.stage as CodingStage;
  if (assessment.passed) {
    if (!nextCompleted.includes(input.stage)) nextCompleted = [...nextCompleted, input.stage];
    const index = CODING_STAGES.indexOf(input.stage);
    const following = CODING_STAGES[index + 1];
    if (following) nextStage = following;
  }
  const previousStatus = asStatus(row.skillStatus);
  const nextStatus = deriveSkillStatus(true, assessment.evidence);
  const attemptCount = row.attemptCount + 1;
  const checksPassed = row.checksPassed + (assessment.passed ? 1 : 0);
  const saved = await prisma.$transaction(async (tx) => {
    const flags = await syncProgress(tx, {
      childId: input.childId,
      lesson,
      yearGroup: input.yearGroup ?? row.yearGroup,
      previousStatus,
      nextStatus,
      flags: readFlags(row.rewardFlagsJson),
      stage: input.stage,
      passed: assessment.passed,
      attemptCount,
      checksPassed,
      hintsUsed: 0,
    });
    return tx.codingWorkspace.update({
      where: { id: row.id },
      data: {
        stage: nextStage,
        completedStagesJson: JSON.stringify(nextCompleted),
        evidenceJson: JSON.stringify(assessment.evidence),
        skillStatus: nextStatus,
        lastFeedback: assessment.feedback,
        rewardFlagsJson: JSON.stringify(flags),
        attemptCount,
        checksPassed,
        yearGroup: input.yearGroup ?? row.yearGroup,
        assignmentStatus: nextStatus === "mastered"
          ? "completed"
          : row.assignmentStatus === "assigned" ? "started" : row.assignmentStatus,
      },
    });
  });
  return {
    ok: true as const,
    passed: assessment.passed,
    feedback: assessment.feedback,
    workspace: toView({ lesson, row: saved, placement: await placementFor(input.childId) }),
  };
}

export async function askCodingTutor(input: {
  childId: string;
  lessonId: string;
  yearGroup: string | null;
  stage: CodingStage;
  program: unknown;
}) {
  const lesson = codingLessonById(input.lessonId);
  if (!lesson) return { ok: false as const, error: "This coding lesson is not published yet." };
  const parsed = parseCodingProgram(input.program);
  if (!parsed.ok) return { ok: false as const, error: parsed.error };
  const row = await ensureWorkspace(input.childId, input.lessonId, input.yearGroup);
  if (!row) return { ok: false as const, error: "This coding lesson is not published yet." };
  const hints = readHints(row.hintCountsJson);
  const used = hints.counts[input.stage] ?? 0;
  const goal = stageBrief(lesson, input.stage).goal;
  const run = goal ? runCodingProgram(parsed.program, goal) : null;
  const turn = nextCodingHint({ lesson, stage: input.stage, program: parsed.program, hintCount: used, run });
  hints.counts[input.stage] = used + 1;
  if (turn.revealsSolution) hints.revealing[input.stage] = (hints.revealing[input.stage] ?? 0) + 1;
  const messages = hints.messages[input.stage] ?? [];
  messages.push(turn.message);
  hints.messages[input.stage] = messages.slice(-6);
  const saved = await prisma.codingWorkspace.update({
    where: { id: row.id },
    data: {
      hintCountsJson: JSON.stringify(hints),
      stage: input.stage,
      skillStatus: row.skillStatus === "not_started" ? "learning" : row.skillStatus,
      lastFeedback: turn.message,
    },
  });
  return {
    ok: true as const,
    tutor: turn,
    workspace: toView({ lesson, row: saved, placement: await placementFor(input.childId) }),
  };
}

export async function handoffForWorkspace(childId: string, lessonId: string): Promise<CodingSupportHandoff | null> {
  const lesson = codingLessonById(lessonId);
  if (!lesson) return null;
  const row = await prisma.codingWorkspace.findUnique({
    where: { childId_lessonId: { childId, lessonId } },
  });
  if (!row) return null;
  const stage = asStage(row.stage);
  const programs = readPrograms(row.programsJson);
  const hints = readHints(row.hintCountsJson);
  const run = readJson(row.lastRunJson);
  const error = isRecord(run) && typeof run.error === "string" ? run.error : null;
  return buildCodingSupportHandoff({
    lesson,
    stage,
    program: programFor(programs, lesson, stage),
    error,
    feedback: row.lastFeedback,
    hintsAttempted: hints.messages[stage] ?? [],
    skillStatus: asStatus(row.skillStatus),
  });
}

export async function storeSupportHandoff(childId: string, lessonId: string, handoff: CodingSupportHandoff) {
  await prisma.codingWorkspace.update({
    where: { childId_lessonId: { childId, lessonId } },
    data: { supportHandoffJson: JSON.stringify(handoff) },
  });
}

export async function saveCodingPlacement(input: {
  childId: string;
  yearGroup: string | null;
  answers: Array<{ questionId: string; choiceId: string }>;
}) {
  const placement = recommendCodingPathway({ yearGroup: input.yearGroup, answers: input.answers });
  await prisma.codingWorkspace.upsert({
    where: { childId_lessonId: { childId: input.childId, lessonId: PLACEMENT_LESSON_ID } },
    create: {
      childId: input.childId,
      lessonId: PLACEMENT_LESSON_ID,
      yearGroup: input.yearGroup,
      pathwayId: placement.recommended,
      placementJson: JSON.stringify(placement),
      skillStatus: "learning",
      privateProject: true,
    },
    update: {
      yearGroup: input.yearGroup,
      pathwayId: placement.recommended,
      placementJson: JSON.stringify(placement),
    },
  });
  return placement;
}

export async function parentCodingSummary(childId: string) {
  const row = await prisma.codingWorkspace.findUnique({
    where: { childId_lessonId: { childId, lessonId: UNDERSTANDING_LOOPS.id } },
  });
  const placement = await placementFor(childId);
  if (!row) {
    return {
      started: false,
      lessonTitle: UNDERSTANDING_LOOPS.title,
      pathwayTitle: UNDERSTANDING_LOOPS.pathwayTitle,
      skillStatus: "not_started" as const,
      evidence: freshEvidence(),
      skills: UNDERSTANDING_LOOPS.skills,
      project: UNDERSTANDING_LOOPS.project,
      privateProject: true,
      supportNeeded: false,
      attempts: 0,
      checksPassed: 0,
      teacherFeedback: null as string | null,
      certificate: null as { title: string; body: string } | null,
      placement,
    };
  }
  const evidence = readEvidence(row.evidenceJson);
  const hints = readHints(row.hintCountsJson);
  const hintTotal = Object.values(hints.counts).reduce((sum, count) => sum + (count ?? 0), 0);
  const status = asStatus(row.skillStatus);
  return {
    started: true,
    lessonTitle: UNDERSTANDING_LOOPS.title,
    pathwayTitle: UNDERSTANDING_LOOPS.pathwayTitle,
    moduleTitle: UNDERSTANDING_LOOPS.moduleTitle,
    skillStatus: status,
    evidence,
    skills: UNDERSTANDING_LOOPS.skills,
    project: UNDERSTANDING_LOOPS.project,
    privateProject: true,
    supportNeeded: status !== "mastered" && hintTotal >= 3,
    attempts: row.attemptCount,
    checksPassed: row.checksPassed,
    teacherFeedback: row.teacherFeedback,
    certificate: status === "mastered"
      ? codingCertificateCopy({ pathwayTitle: UNDERSTANDING_LOOPS.pathwayTitle, skills: UNDERSTANDING_LOOPS.skills })
      : null,
    placement,
  };
}

export async function teacherCodingRows(childIds: string[]) {
  if (!childIds.length) return [];
  return prisma.codingWorkspace.findMany({
    where: { childId: { in: childIds }, lessonId: { not: PLACEMENT_LESSON_ID } },
    include: { child: { select: { id: true, name: true, yearGroup: true } } },
    orderBy: { updatedAt: "desc" },
  });
}

export async function assignCodingLesson(input: { childId: string; yearGroup: string | null }) {
  const row = await ensureWorkspace(input.childId, UNDERSTANDING_LOOPS.id, input.yearGroup);
  if (!row) throw new Error("Coding lesson is not available.");
  if (row.assignmentStatus === "completed") return row;
  return prisma.codingWorkspace.update({
    where: { id: row.id },
    data: { assignmentStatus: row.skillStatus === "not_started" ? "assigned" : row.assignmentStatus },
  });
}

export async function saveTeacherCodingFeedback(input: { workspaceId: string; childIds: string[]; feedback: string }) {
  const feedback = input.feedback.trim().slice(0, 2000);
  if (!feedback) return { ok: false as const, error: "Write a short note for the learner." };
  const row = await prisma.codingWorkspace.findFirst({
    where: { id: input.workspaceId, childId: { in: input.childIds } },
  });
  if (!row) return { ok: false as const, error: "That coding project is not in your classes." };
  const saved = await prisma.codingWorkspace.update({
    where: { id: row.id },
    data: { teacherFeedback: feedback },
  });
  return { ok: true as const, workspace: saved };
}

export function hintTotalForRow(hintCountsJson: string): number {
  const hints = readHints(hintCountsJson);
  return Object.values(hints.counts).reduce((sum, count) => sum + (count ?? 0), 0);
}

export function programFromRow(programsJson: string, stage: string): CodingProgram {
  const programs = readPrograms(programsJson);
  const current = asStage(stage);
  return programs[current] ?? stageBrief(UNDERSTANDING_LOOPS, current).starter;
}
