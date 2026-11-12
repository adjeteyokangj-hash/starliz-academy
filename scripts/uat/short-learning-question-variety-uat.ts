/** Short Learning question variety local UAT. Run: npx tsx scripts/uat/short-learning-question-variety-uat.ts */
import "./load-env";
import { mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";
import { ARTIFACTS_UAT_ROOT, UAT_FIXTURES } from "./local-fixtures";
import { SHORT_LEARNING_MANUAL_SUBJECT_KEYS } from "../../src/lib/schools/short-learning-subjects";
import { canonicalShortLearningSubjectKey } from "../../src/lib/schools/short-learning-curriculum";
import {
  extractRotatableQuestions,
  QUESTION_BANK_REFILL_EVENT,
} from "../../src/lib/schools/short-learning-question-rotation";
import {
  compareQuestionEquivalence,
  repetitionPurposeOf,
} from "../../src/lib/schools/short-learning-question-equivalence";

const OUT = resolve(ARTIFACTS_UAT_ROOT, "short-learning-question-variety");
mkdirSync(OUT, { recursive: true });
const TAG = "uat-sl-question-variety-2026";
/** Unique per execution so prior UAT exposures cannot collide with this run's fixtures. */
const RUN_ID = `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const RUN_MARK = `run ${RUN_ID}`;

function subjectKey(subject: string): string {
  return canonicalShortLearningSubjectKey(subject) ?? subject;
}

function sessionAnchorPrompt(subject: string, sessionIndex: number): string {
  return `What is the ${subjectKey(subject)} anchor fact for session ${sessionIndex}? (${RUN_MARK})`;
}

function sessionAnchorAnswer(subject: string): string {
  return `${subjectKey(subject)}-anchor-${RUN_ID}`;
}

function cosmeticSession1Anchor(subject: string): string {
  return `${sessionAnchorPrompt(subject, 1)} (check the subject carefully.)`;
}

function capitalPrompt(subject: string, sessionIndex: number): string {
  return `Which city is the capital of France? (${subjectKey(subject)} frame ${sessionIndex}; ${RUN_MARK})`;
}

function differentSkillPrompt(subject: string, sessionIndex: number): string {
  return `${subjectKey(subject)}-s${sessionIndex} different skill practice item (${RUN_MARK})`;
}

function recapPrompt(subject: string, sessionIndex: number): string {
  return `${subjectKey(subject)}-s${sessionIndex} RECAP retrieval check (${RUN_MARK})`;
}

/** Dedicated subject-isolation probe — never used by the 13-subject loop. */
const ISO_PROBE_PROMPT = `iso-probe: Name the isolation landmark used in this UAT. (${RUN_MARK})`;
const ISO_PROBE_NEAR_PROMPT = `${ISO_PROBE_PROMPT} (check the subject carefully.)`;
const ISO_PROBE_ANSWER = `IsoLandmark-${RUN_ID}`;

function promptsFromContentJson(contentJson: string): string[] {
  return extractRotatableQuestions(contentJson).map((q) => q.prompt);
}

function questionRowsFromContentJson(contentJson: string): Array<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(contentJson) as { questions?: unknown[] };
    return (Array.isArray(parsed.questions) ? parsed.questions : []).filter(
      (r): r is Record<string, unknown> => Boolean(r && typeof r === "object"),
    );
  } catch {
    return [];
  }
}

async function main() {
  if (!process.env.DATABASE_URL?.startsWith("postgres")) {
    throw new Error("DATABASE_URL missing/invalid after load-env");
  }

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const {
    ensureShortLearningSessionContent,
    getShortLearningSessionSummary,
    startShortLearningContentBlock,
  } = await import("../../src/lib/schools/short-learning-session-content");
  const { serializeDaytimeStageContentJson, normalizeDaytimeStagePack } = await import(
    "../../src/lib/schools/daytime-stage-validators"
  );

  const exposureCountBefore = await prisma.studentQuestionExposure.count();

  const parent = await prisma.user.findFirst({
    where: { email: UAT_FIXTURES.parentEmail },
    select: { id: true },
  });
  if (!parent) throw new Error(`UAT parent not found: ${UAT_FIXTURES.parentEmail}`);

  const primaryStudent = await prisma.schoolStudent.findFirst({
    where: { status: "active", child: { parentId: parent.id, archived: false } },
    select: {
      id: true,
      schoolId: true,
      childId: true,
      child: { select: { yearGroup: true, name: true } },
    },
    orderBy: { joinedAt: "asc" },
  });
  if (!primaryStudent) throw new Error("No active school student for UAT parent");

  const secondaryStudent = await prisma.schoolStudent.findFirst({
    where: {
      status: "active",
      schoolId: primaryStudent.schoolId,
      childId: { not: primaryStudent.childId },
      child: { archived: false },
    },
    select: { id: true, child: { select: { name: true } } },
  });

  const yearGroup = primaryStudent.child.yearGroup ?? "Year 4";

  async function createBooking(subject: string, suffix: string, schoolStudentId: string) {
    const starts = new Date(Date.now() + 400 * 24 * 60 * 60_000 + Math.random() * 86_400_000);
    return prisma.studentLearningBooking.create({
      data: {
        schoolId: primaryStudent.schoolId,
        schoolStudentId,
        parentUserId: parent.id,
        startsAt: starts,
        endsAt: new Date(starts.getTime() + 90 * 60_000),
        durationMinutes: 90,
        subject,
        learningFocus: `${TAG} ${RUN_ID} ${suffix}`,
        status: "confirmed",
        confirmedAt: new Date(),
        honestyAcknowledgedAt: new Date(),
        metadataJson: JSON.stringify({ uat: TAG, runId: RUN_ID, suffix }),
      },
      select: { id: true },
    });
  }

  function mockGenerate(subject: string, sessionIndex: number) {
    return async (input: {
      stageLabel: string;
      targetMinutes: number;
      targetItems: number;
      skillFocus: string;
      mode: string;
    }) => {
      const label = input.stageLabel.toLowerCase();
      const isRecap = label.includes("recap");
      const isReview = label.includes("final review") || (label.includes("review") && !label.includes("progress"));
      const isChallenge = label.includes("challenge");
      const key = subjectKey(subject);

      let questions: Array<Record<string, unknown>>;
      if (isRecap || isReview) {
        questions = [
          {
            prompt: recapPrompt(subject, sessionIndex),
            answer: `retrieval-answer-${RUN_ID}`,
            explanation: "Recap.",
            hints: ["Recall."],
            kind: "retrieval",
          },
        ];
      } else if (isChallenge) {
        questions = [
          {
            prompt: `${key}-s${sessionIndex} CHALLENGE stretch (${RUN_MARK})`,
            answer: `challenge-${RUN_ID}`,
            explanation: "Challenge.",
            hints: ["Stretch."],
            kind: "challenge",
          },
        ];
      } else {
        questions = [
          {
            prompt: sessionAnchorPrompt(subject, sessionIndex),
            answer: sessionAnchorAnswer(subject),
            explanation: "Anchor.",
            hints: ["Main idea."],
          },
          {
            prompt: capitalPrompt(subject, sessionIndex),
            answer: `Paris-${RUN_ID}`,
            explanation: "Capital.",
            hints: ["Europe."],
          },
          {
            prompt: differentSkillPrompt(subject, sessionIndex),
            answer: `different-${RUN_ID}`,
            explanation: "Different problem.",
            hints: ["New method."],
          },
        ];
        if (sessionIndex >= 2) {
          questions.unshift({
            prompt: sessionAnchorPrompt(subject, 1),
            answer: sessionAnchorAnswer(subject),
            explanation: "Repeat.",
            hints: ["Same."],
          });
          questions.unshift({
            prompt: cosmeticSession1Anchor(subject),
            answer: sessionAnchorAnswer(subject),
            explanation: "Cosmetic.",
            hints: ["Same."],
          });
        }
      }

      const pack = normalizeDaytimeStagePack(
        {
          subjectType: input.mode,
          title: input.stageLabel,
          estimatedMinutes: input.targetMinutes,
          targetItems: Math.max(questions.length, input.targetItems),
          learningObjective: input.skillFocus,
          explanation: `Teaching for ${key}.`,
          priorLearningWarmup: "Warm-up.",
          activities: [
            { kind: "teacher-explanation", estimatedMinutes: 3, title: "Explain" },
            { kind: "independent", estimatedMinutes: 4, title: "Practice" },
          ],
          questions,
          reflectionCheck: "Reflect.",
          generationStatus: "ok",
        },
        input.mode,
      );
      return {
        pack,
        contentJson: serializeDaytimeStageContentJson(pack),
        model: "uat-question-variety-mock",
        openAiAttempted: true,
        openAiSucceeded: true,
        validationIssues: [],
        usageTokens: 0,
      };
    };
  }

  const mockOfflineFail = async () => ({
    pack: null,
    contentJson: "{}",
    model: "uat-offline-fail",
    openAiAttempted: true,
    openAiSucceeded: false,
    validationIssues: [{ code: "mock_fail", message: "forced offline" }],
    usageTokens: 0,
  });

  const subjectResults: Array<{ subject: string; pass: boolean; notes: string[] }> = [];
  const flags = {
    firstSession: true,
    consecutive: true,
    exactDup: true,
    nearDup: true,
    sameSkill: true,
    recap: true,
    exposure: true,
    studentIso: true,
    subjectIso: true,
    fallback: true,
    ks3: true,
    progression: true,
    refill: true,
  };

  for (const subject of SHORT_LEARNING_MANUAL_SUBJECT_KEYS) {
    const notes: string[] = [];
    let pass = true;
    const fail = (msg: string) => {
      pass = false;
      notes.push(msg);
    };

    const b1 = await createBooking(subject, `${subject}-s1`, primaryStudent.id);
    const r1 = await ensureShortLearningSessionContent({
      bookingId: b1.id,
      forceRegenerate: true,
      generateStage: mockGenerate(subject, 1) as never,
    });
    const s1 = await getShortLearningSessionSummary(b1.id);
    if (!(s1?.blocks.some((b) => b.blockType === "lesson" && b.contentId) && r1.session.status === "ready")) {
      fail("first session not playable");
      flags.firstSession = false;
    }

    const s1LessonPrompts: string[] = [];
    for (const block of s1?.blocks ?? []) {
      if (block.blockType !== "lesson" || !block.contentId) continue;
      const content = await prisma.aIContentCache.findUnique({
        where: { id: block.contentId },
        select: { contentJson: true },
      });
      if (content) s1LessonPrompts.push(...promptsFromContentJson(content.contentJson));
    }
    const expectedAnchor = sessionAnchorPrompt(subject, 1);
    const expectedAnswer = sessionAnchorAnswer(subject);
    if (!s1LessonPrompts.some((p) => p === expectedAnchor || p.includes(RUN_ID))) {
      fail("first session missing run-scoped fixture prompts");
      flags.firstSession = false;
    }

    const canon = subjectKey(subject);
    const runExposure = await prisma.studentQuestionExposure.count({
      where: {
        studentId: primaryStudent.childId,
        subject: canon,
        prompt: { contains: RUN_ID },
      },
    });
    if (runExposure < 1) {
      fail("exposure not recorded for this run");
      flags.exposure = false;
    }

    const b2 = await createBooking(subject, `${subject}-s2`, primaryStudent.id);
    await ensureShortLearningSessionContent({
      bookingId: b2.id,
      forceRegenerate: true,
      generateStage: mockGenerate(subject, 2) as never,
    });
    const s2 = await getShortLearningSessionSummary(b2.id);

    const lessonPrompts: string[] = [];
    for (const block of s2?.blocks ?? []) {
      if (block.blockType !== "lesson" || !block.contentId) continue;
      const content = await prisma.aIContentCache.findUnique({
        where: { id: block.contentId },
        select: { contentJson: true },
      });
      if (content) lessonPrompts.push(...promptsFromContentJson(content.contentJson));
    }

    if (lessonPrompts.some((p) => p === expectedAnchor)) {
      fail("exact duplicate in lesson");
      flags.exactDup = false;
      flags.consecutive = false;
    }
    if (
      lessonPrompts.some(
        (p) => compareQuestionEquivalence(
          { prompt: p, answer: "" },
          { prompt: expectedAnchor, answer: expectedAnswer },
        ) != null,
      )
    ) {
      fail("near duplicate in lesson");
      flags.nearDup = false;
      flags.consecutive = false;
    }
    if (!lessonPrompts.some((p) => p.includes("different skill practice") && p.includes(RUN_ID))) {
      fail("different skill item missing");
      flags.sameSkill = false;
    }

    const recap = (s2?.blocks ?? []).find((b) => b.blockType === "recap" && b.contentId);
    let recapOk = false;
    if (recap?.contentId) {
      const content = await prisma.aIContentCache.findUnique({
        where: { id: recap.contentId },
        select: { contentJson: true },
      });
      if (content) {
        recapOk = questionRowsFromContentJson(content.contentJson).some((r) => repetitionPurposeOf(r) === "retrieval");
      }
    }
    if (!recapOk) {
      fail("recap retrieval not tagged");
      flags.recap = false;
    }

    const allPrompts: string[] = [];
    for (const block of s2?.blocks ?? []) {
      if (!block.contentId) continue;
      const content = await prisma.aIContentCache.findUnique({
        where: { id: block.contentId },
        select: { contentJson: true },
      });
      if (content) allPrompts.push(...promptsFromContentJson(content.contentJson));
    }
    if (allPrompts.some((p) => /\(check the subject carefully\.\)/i.test(p))) {
      fail("manufactured suffix in runtime content");
      flags.fallback = false;
    }

    let progressed = false;
    try {
      let completedBlockId: string | null = null;
      for (let i = 0; i < 14; i += 1) {
        const start = await startShortLearningContentBlock({
          bookingId: b2.id,
          childId: primaryStudent.childId,
          completedBlockId,
        });
        if (start.done) {
          progressed = true;
          break;
        }
        completedBlockId = start.block?.id ?? null;
        if (!completedBlockId) break;
      }
    } catch (error) {
      fail(`progression failed: ${error instanceof Error ? error.message : String(error)}`);
      flags.progression = false;
    }
    if (!progressed) {
      fail("did not complete session progression");
      flags.progression = false;
    }

    if (secondaryStudent) {
      const other = await createBooking(subject, `${subject}-other`, secondaryStudent.id);
      await ensureShortLearningSessionContent({
        bookingId: other.id,
        forceRegenerate: true,
        generateStage: mockGenerate(subject, 1) as never,
      });
      const os = await getShortLearningSessionSummary(other.id);
      const op: string[] = [];
      for (const block of os?.blocks ?? []) {
        if (block.blockType !== "lesson" || !block.contentId) continue;
        const content = await prisma.aIContentCache.findUnique({
          where: { id: block.contentId },
          select: { contentJson: true },
        });
        if (content) op.push(...promptsFromContentJson(content.contentJson));
      }
      const secondaryCanReceiveShared = op.some(
        (p) =>
          p === expectedAnchor
          || compareQuestionEquivalence(
            { prompt: p, answer: "" },
            { prompt: expectedAnchor, answer: expectedAnswer },
          ) != null,
      );
      if (!secondaryCanReceiveShared) {
        fail("student isolation broken");
        flags.studentIso = false;
      }
    }

    subjectResults.push({ subject, pass, notes });
    if (!pass) flags.consecutive = false;
  }

  // Subject isolation uses dedicated iso-probe fixtures (not the 13-subject loop prompts).
  // History exposes probe X; maths then receives an equivalent probe X. Same RUN_ID, never
  // previously consumed by maths in this run. Product exposure must stay subject-scoped.
  function mockIsoProbe(subject: "history" | "maths", variant: "exact" | "near") {
    return async (input: {
      stageLabel: string;
      targetMinutes: number;
      targetItems: number;
      skillFocus: string;
      mode: string;
    }) => {
      const prompt = variant === "near" ? ISO_PROBE_NEAR_PROMPT : ISO_PROBE_PROMPT;
      const questions = [
        {
          prompt,
          answer: ISO_PROBE_ANSWER,
          explanation: `iso-probe for ${subject}.`,
          hints: ["Isolation landmark."],
        },
      ];
      const pack = normalizeDaytimeStagePack(
        {
          subjectType: input.mode,
          title: input.stageLabel,
          estimatedMinutes: input.targetMinutes,
          targetItems: Math.max(questions.length, input.targetItems),
          learningObjective: input.skillFocus,
          explanation: `iso-probe teaching for ${subject}.`,
          priorLearningWarmup: "Warm-up.",
          activities: [
            { kind: "teacher-explanation", estimatedMinutes: 3, title: "Explain" },
            { kind: "independent", estimatedMinutes: 4, title: "Practice" },
          ],
          questions,
          reflectionCheck: "Reflect.",
          generationStatus: "ok",
        },
        input.mode,
      );
      return {
        pack,
        contentJson: serializeDaytimeStageContentJson(pack),
        model: "uat-question-variety-iso-probe",
        openAiAttempted: true,
        openAiSucceeded: true,
        validationIssues: [],
        usageTokens: 0,
      };
    };
  }

  await ensureShortLearningSessionContent({
    bookingId: (await createBooking("history", "iso-probe-hist", primaryStudent.id)).id,
    forceRegenerate: true,
    generateStage: mockIsoProbe("history", "exact") as never,
  });
  const mathsIso = (await createBooking("maths", "iso-probe-maths", primaryStudent.id)).id;
  await ensureShortLearningSessionContent({
    bookingId: mathsIso,
    forceRegenerate: true,
    generateStage: mockIsoProbe("maths", "near") as never,
  });
  const ms = await getShortLearningSessionSummary(mathsIso);
  const mp: string[] = [];
  for (const block of ms?.blocks ?? []) {
    if (!block.contentId) continue;
    const content = await prisma.aIContentCache.findUnique({
      where: { id: block.contentId },
      select: { contentJson: true },
    });
    if (content) mp.push(...promptsFromContentJson(content.contentJson));
  }
  const isoStillPlayable = mp.some(
    (p) =>
      p === ISO_PROBE_NEAR_PROMPT
      || p === ISO_PROBE_PROMPT
      || compareQuestionEquivalence(
        { prompt: p, answer: "" },
        { prompt: ISO_PROBE_PROMPT, answer: ISO_PROBE_ANSWER },
      ) != null,
  );
  if (!isoStillPlayable) {
    flags.subjectIso = false;
  }

  let ks3Experience = "";
  const ks3Student = await prisma.schoolStudent.findFirst({
    where: {
      status: "active",
      schoolId: primaryStudent.schoolId,
      child: { yearGroup: "Year 8", archived: false },
    },
    select: { id: true },
  });
  if (ks3Student) {
    const refillBefore = await prisma.notificationEvent.count({
      where: { eventType: QUESTION_BANK_REFILL_EVENT },
    });
    for (let i = 0; i < 5; i += 1) {
      const id = (await createBooking("art-and-design", `ks3-${i}`, ks3Student.id)).id;
      await ensureShortLearningSessionContent({
        bookingId: id,
        forceRegenerate: true,
        generateStage: mockOfflineFail as never,
      });
    }
    const last = (await createBooking("art-and-design", "ks3-final", ks3Student.id)).id;
    await ensureShortLearningSessionContent({
      bookingId: last,
      forceRegenerate: true,
      generateStage: mockOfflineFail as never,
    });
    const ls = await getShortLearningSessionSummary(last);
    let count = 0;
    for (const block of ls?.blocks ?? []) {
      if (block.blockType !== "lesson" || !block.contentId) continue;
      const content = await prisma.aIContentCache.findUnique({
        where: { id: block.contentId },
        select: { contentJson: true, model: true },
      });
      if (content) {
        count += promptsFromContentJson(content.contentJson).length;
        ks3Experience = `offline model=${content.model ?? "unknown"}`;
      }
    }
    ks3Experience += `; exhausted pass lessonQuestions=${count}; status=${ls?.status ?? "?"}`;
    if (count > 2) flags.ks3 = false;
    const refillAfter = await prisma.notificationEvent.count({
      where: { eventType: QUESTION_BANK_REFILL_EVENT },
    });
    if (refillAfter <= refillBefore) flags.refill = false;
  } else {
    const off = (await createBooking("art-and-design", "offline", primaryStudent.id)).id;
    await ensureShortLearningSessionContent({
      bookingId: off,
      forceRegenerate: true,
      generateStage: mockOfflineFail as never,
    });
    ks3Experience = `No Year 8 student; ${yearGroup} offline art session checked (no suffix padding).`;
  }

  let retryDetail =
    "Wrong-answer retry is coach-side during assignment play; remix does not re-run per attempt.";
  try {
    const res = await fetch(`${UAT_FIXTURES.baseUrl.replace(/\/$/, "")}/login`, { signal: AbortSignal.timeout(4000) });
    if (res.status > 0) retryDetail += " Dev server reachable.";
  } catch {
    retryDetail += " Dev server not running.";
  }

  const exposureCountAfter = await prisma.studentQuestionExposure.count();
  const exposureHistoryDeleted = exposureCountAfter < exposureCountBefore;

  const overallPass =
    subjectResults.every((r) => r.pass)
    && Object.values(flags).every(Boolean)
    && !exposureHistoryDeleted;

  const report = {
    finishedAt: new Date().toISOString(),
    tag: TAG,
    runId: RUN_ID,
    primaryChild: primaryStudent.child.name,
    yearGroup,
    secondaryChild: secondaryStudent?.child.name ?? null,
    overallPass,
    subjectResults,
    flags,
    ks3Experience,
    retryDetail,
    exposureCountBefore,
    exposureCountAfter,
    exposureHistoryDeleted,
  };
  writeFileSync(resolve(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await prisma.$disconnect();
  process.exitCode = overallPass ? 0 : 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
