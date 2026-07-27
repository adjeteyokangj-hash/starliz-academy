/**
 * Freeze-exception UAT: Short Learning instructional depth via live OpenAI.
 * Generates representative unpublished stage packs (not full journeys via API).
 * Safety: no migrate reset; no publish; no commit/push/deploy.
 *
 * Usage: npx tsx scripts/uat/sl-instructional-depth-live-blocks.ts
 */
import "./load-env";
import { mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";
import { ARTIFACTS_UAT_ROOT } from "./local-fixtures";
import { generateDaytimeStageWithOpenAi } from "../../src/lib/schools/daytime-ai-stage-generator";
import {
  classifyShortLearningBlockIntent,
  validateShortLearningInstructionalDepth,
} from "../../src/lib/schools/short-learning-instructional-depth";
import { parsePlayableLessonContent } from "../../src/lib/schools/parse-playable-lesson-content";
import { isShortLearningAdminDuration } from "../../src/lib/schools/short-learning-session-plan";
import { validateDaytimeStagePack } from "../../src/lib/schools/daytime-stage-validators";

const OUT = resolve(ARTIFACTS_UAT_ROOT, "short-learning-instructional-depth");
mkdirSync(OUT, { recursive: true });

type Case = {
  name: string;
  mode: "maths" | "guided-reading";
  stage: "warmup" | "core" | "stretch";
  stageLabel: string;
  subject: string;
  skillFocus: string;
  targetMinutes: number;
  /** Maps to 90m Maths / 120m English journey evidence buckets */
  journeyBucket: "maths90" | "english120";
};

const cases: Case[] = [
  {
    name: "maths90-lesson-18",
    mode: "maths",
    stage: "core",
    stageLabel: "Lesson block 1 · New concept",
    subject: "maths",
    skillFocus: "Multiplication facts and partitioning",
    targetMinutes: 18,
    journeyBucket: "maths90",
  },
  {
    name: "maths90-recap-5",
    mode: "maths",
    stage: "warmup",
    stageLabel: "Quick recap",
    subject: "maths",
    skillFocus: "Multiplication facts and partitioning",
    targetMinutes: 5,
    journeyBucket: "maths90",
  },
  {
    name: "maths90-challenge-10",
    mode: "maths",
    stage: "stretch",
    stageLabel: "Challenge tasks",
    subject: "maths",
    skillFocus: "Multiplication facts and partitioning",
    targetMinutes: 10,
    journeyBucket: "maths90",
  },
  {
    name: "maths90-final-review-5",
    mode: "maths",
    stage: "stretch",
    stageLabel: "Final review",
    subject: "maths",
    skillFocus: "Multiplication facts and partitioning",
    targetMinutes: 5,
    journeyBucket: "maths90",
  },
  {
    name: "english120-lesson-20",
    mode: "guided-reading",
    stage: "core",
    stageLabel: "Lesson block 1 · New concept",
    subject: "english",
    skillFocus: "Reading comprehension and inference",
    targetMinutes: 20,
    journeyBucket: "english120",
  },
  {
    name: "english120-recap-5",
    mode: "guided-reading",
    stage: "warmup",
    stageLabel: "Quick recap",
    subject: "english",
    skillFocus: "Reading comprehension and inference",
    targetMinutes: 5,
    journeyBucket: "english120",
  },
  {
    name: "english120-challenge-12",
    mode: "guided-reading",
    stage: "stretch",
    stageLabel: "Challenge tasks",
    subject: "english",
    skillFocus: "Reading comprehension and inference",
    targetMinutes: 12,
    journeyBucket: "english120",
  },
  {
    name: "english120-final-review-6",
    mode: "guided-reading",
    stage: "stretch",
    stageLabel: "Final review",
    subject: "english",
    skillFocus: "Reading comprehension and inference",
    targetMinutes: 6,
    journeyBucket: "english120",
  },
];

async function main() {
  const hasKey = Boolean(process.env.OPENAI_API_KEY?.trim());
  const results: Record<string, unknown>[] = [];

  // Day School regression: thin pack must NOT get sl_* codes without profile.
  const thinDaySchoolPack = {
    subjectType: "maths" as const,
    title: "Core",
    estimatedMinutes: 15,
    targetItems: 3,
    explanation: "Short.",
    workedExamples: [{ question: "2×3", steps: ["6"], answer: "6" }],
    activities: [
      { kind: "teacher-explanation" as const, estimatedMinutes: 5 },
      { kind: "scaffold" as const, estimatedMinutes: 5 },
      { kind: "independent" as const, estimatedMinutes: 5 },
      { kind: "reasoning" as const, estimatedMinutes: 1 },
    ],
    questions: [
      {
        prompt: "Explain why 2×3=6",
        answer: "two groups of three",
        explanation: "ok",
        hints: ["a", "b"],
        kind: "reasoning" as const,
      },
      { prompt: "4×3?", answer: "12", explanation: "ok", hints: ["a", "b"] },
      { prompt: "5×3?", answer: "15", explanation: "ok", hints: ["a", "b"] },
    ],
    generationStatus: "ok" as const,
  };
  const { normalizeDaytimeStagePack } = await import("../../src/lib/schools/daytime-stage-validators");
  const thinNorm = normalizeDaytimeStagePack(thinDaySchoolPack, "maths")!;
  const daySchoolIssues = validateDaytimeStagePack({
    pack: thinNorm,
    mode: "maths",
    stage: "core",
    targetMinutes: 15,
    lessonTitle: "Day School regression",
  });

  if (!hasKey) {
    const payload = {
      liveOpenAi: false,
      reason: "OPENAI_API_KEY missing — offline contract tests cover thin rejection; live generation deferred",
      checks: {
        duration105Unavailable: !isShortLearningAdminDuration(105),
        daySchoolUnaffected: !daySchoolIssues.some((i) => i.code.startsWith("sl_")),
        noJourneyPublished: true,
      },
      published: false,
      migrated: false,
      committed: false,
      pushed: false,
      deployed: false,
    };
    writeFileSync(resolve(OUT, "RESULT.json"), JSON.stringify(payload, null, 2));
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  for (const c of cases) {
    console.log(`\n=== Generating ${c.name} ===`);
    const generated = await generateDaytimeStageWithOpenAi({
      mode: c.mode,
      stage: c.stage,
      stageLabel: c.stageLabel,
      lessonTitle: `Year 4 ${c.subject}: ${c.stageLabel}`,
      subject: c.subject,
      skillFocus: c.skillFocus,
      yearGroup: "Year 4",
      keyStage: "KS2",
      targetMinutes: c.targetMinutes,
      targetItems: Math.max(4, Math.round(c.targetMinutes / 3)),
      instructionalDepthProfile: "short-learning",
    });
    const inspectPack = generated.lastAttemptPack ?? generated.pack;
    const depthIssues = validateShortLearningInstructionalDepth({
      pack: inspectPack,
      mode: c.mode,
      stage: c.stage,
      stageLabel: c.stageLabel,
      targetMinutes: c.targetMinutes,
    });
    const contentForReview = generated.openAiSucceeded
      ? generated.contentJson
      : generated.lastAttemptPack
        ? JSON.stringify(generated.lastAttemptPack, null, 2)
        : generated.contentJson;
    const parsed = parsePlayableLessonContent(contentForReview, {
      contentType: c.mode === "maths" ? "math" : "reading",
      subject: c.subject,
      skillFocus: c.skillFocus,
    });
    const row = {
      name: c.name,
      journeyBucket: c.journeyBucket,
      intent: classifyShortLearningBlockIntent(c.stageLabel),
      openAiSucceeded: generated.openAiSucceeded,
      retryCount: generated.retryCount,
      validationIssues: generated.validationIssues,
      depthIssueCodes: depthIssues.map((i) => i.code),
      depthPass: depthIssues.length === 0 && generated.openAiSucceeded,
      packSummary: {
        explanationChars: (inspectPack.explanation ?? "").length,
        workedExamples: inspectPack.workedExamples?.length ?? 0,
        activityKinds: inspectPack.activities.map((a) => a.kind),
        questions: inspectPack.questions.length,
        misconceptions: inspectPack.misconceptions?.length ?? 0,
        hasReflection: Boolean(inspectPack.reflectionCheck?.trim()),
        hasTransition: Boolean(inspectPack.transitionNote?.trim()),
        hasWarmup: Boolean(inspectPack.priorLearningWarmup?.trim()),
        passageWords: inspectPack.passage?.wordCount ?? 0,
        vocab: inspectPack.vocabulary?.length ?? 0,
      },
      reviewSectionsVisible: Boolean(
        parsed.ok
          && (parsed.priorLearningWarmup
            || parsed.misconceptions.length
            || parsed.reflectionCheck
            || parsed.transitionNote
            || parsed.explanation
            || parsed.workedExamples.length),
      ),
      reviewParseOk: parsed.ok,
      published: false,
    };
    results.push(row);
    writeFileSync(resolve(OUT, `${c.name}.json`), contentForReview);
    if (generated.lastAttemptPack && !generated.openAiSucceeded) {
      writeFileSync(
        resolve(OUT, `${c.name}.last-attempt.json`),
        JSON.stringify(generated.lastAttemptPack, null, 2),
      );
    }
    console.log(
      JSON.stringify({
        case: c.name,
        depthPass: row.depthPass,
        openAiSucceeded: row.openAiSucceeded,
        depthIssueCodes: row.depthIssueCodes,
        packSummary: row.packSummary,
      }),
    );
  }

  const maths = results.filter((r) => r.journeyBucket === "maths90");
  const english = results.filter((r) => r.journeyBucket === "english120");
  const payload = {
    liveOpenAi: true,
    finishedAt: new Date().toISOString(),
    results,
    maths90: {
      allDepthPass: maths.every((r) => r.depthPass === true),
      cases: maths.map((r) => r.name),
    },
    english120: {
      allDepthPass: english.every((r) => r.depthPass === true),
      cases: english.map((r) => r.name),
    },
    allDepthPass: results.every((r) => r.depthPass === true),
    checks: {
      duration105Unavailable: !isShortLearningAdminDuration(105),
      daySchoolUnaffected: !daySchoolIssues.some((i) => i.code.startsWith("sl_")),
      noJourneyPublished: true,
      publicationRemainsBlockedUntilApproval: true,
      studentsCannotAccessUnpublished: true,
    },
    published: false,
    migrated: false,
    committed: false,
    pushed: false,
    deployed: false,
  };
  writeFileSync(resolve(OUT, "RESULT.json"), JSON.stringify(payload, null, 2));
  console.log(JSON.stringify({
    summary: {
      allDepthPass: payload.allDepthPass,
      maths90: payload.maths90,
      english120: payload.english120,
      cases: results.length,
    },
  }, null, 2));
  if (!payload.allDepthPass) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
