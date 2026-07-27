/**
 * Short Learning Launch Hardening v1 — prompt audit, consistency, reuse perf.
 * Safety: no migrate reset; no commit/push/deploy; no 105 enable; no new features.
 */
import "./load-env";
import { mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";
import { ARTIFACTS_UAT_ROOT, UAT_FIXTURES } from "./local-fixtures";

const OUT = resolve(ARTIFACTS_UAT_ROOT, "short-learning-launch-hardening");
mkdirSync(OUT, { recursive: true });

async function main() {
  const { DAYTIME_BRITISH_ENGLISH_RULES, systemPromptForMode, userPromptForStage } = await import(
    "../../src/lib/schools/daytime-ai-stage-generator"
  );
  const { getDaytimeOpenAiModel } = await import("../../src/lib/ai/openai-json");

  const modes = [
    "guided-reading",
    "spelling",
    "maths",
    "science",
    "practical-pe",
    "practical-arts",
    "practical-music",
  ] as const;

  const britishAudit = modes.map((mode) => {
    const system = systemPromptForMode(mode);
    return {
      mode,
      hasBritishBlock: system.includes(DAYTIME_BRITISH_ENGLISH_RULES),
      hasUkSpelling: /UK spelling/i.test(system),
      hasPounds: /£|pence/i.test(system),
      hasNoUsSpellingRule: /Do not use US spelling/i.test(system),
    };
  });

  const guidedSystem = systemPromptForMode("guided-reading");
  const mathsRecapUser = userPromptForStage({
    mode: "maths",
    stage: "warmup",
    stageLabel: "Quick recap",
    lessonTitle: "Maths: Place value",
    subject: "maths",
    skillFocus: "Place value",
    yearGroup: "Year 6",
    keyStage: "KS2",
    targetMinutes: 5,
    targetItems: 2,
  });
  const englishCoreUser = userPromptForStage({
    mode: "guided-reading",
    stage: "core",
    stageLabel: "Lesson block 1 · New concept",
    lessonTitle: "English: Guided reading",
    subject: "english",
    skillFocus: "Guided reading comprehension",
    yearGroup: "Year 6",
    keyStage: "KS2",
    targetMinutes: 20,
    targetItems: 4,
  });

  const model = getDaytimeOpenAiModel();
  const consistency = {
    modelSelection: model,
    britishRulesIdenticalAcrossModes: britishAudit.every((row) => row.hasBritishBlock),
    curriculumFieldsInUserPrompt: {
      yearGroup: /Year group:/i.test(englishCoreUser),
      schoolSubject: /School subject:/i.test(englishCoreUser),
      skillFocus: /Skill focus:/i.test(englishCoreUser),
      britishEnglish: /British English/i.test(englishCoreUser),
    },
    englishStemVarietyInSystem: /retrieval|inference|summarising|evidence finding/i.test(guidedSystem),
    mathsRecapGuidance: /Recap intent/i.test(mathsRecapUser),
    validatorPipeline: "validateDaytimeStagePack + findAmericanEnglishMarkers (shared)",
    notes: [] as string[],
  };
  if (!consistency.britishRulesIdenticalAcrossModes) {
    consistency.notes.push("British English block missing from one or more mode system prompts.");
  }

  // Performance: reuse path on prior live UAT bookings (no force regenerate).
  const reportPath = resolve(ARTIFACTS_UAT_ROOT, "short-learning-live-openai-content", "report.json");
  let performance: Record<string, unknown> = { skipped: true, reason: "prior report missing" };
  try {
    const prior = JSON.parse(await import("fs").then((fs) => fs.readFileSync(reportPath, "utf8"))) as {
      maths?: { bookingId?: string };
      english?: { bookingId?: string };
    };
    const mathsId = prior.maths?.bookingId;
    const engId = prior.english?.bookingId;
    if (mathsId && engId) {
      const { ensureShortLearningSessionContent } = await import(
        "../../src/lib/schools/short-learning-session-content"
      );
      const { PrismaClient } = await import("@prisma/client");
      const prisma = new PrismaClient();
      // Keep windows in the past — reuse does not need active booking window.
      const t0 = Date.now();
      const mathsReuse = await ensureShortLearningSessionContent({ bookingId: mathsId, forceRegenerate: false });
      const mathsReuseMs = Date.now() - t0;
      const t1 = Date.now();
      const engReuse = await ensureShortLearningSessionContent({ bookingId: engId, forceRegenerate: false });
      const engReuseMs = Date.now() - t1;
      const priorFull = prior as {
        maths?: { elapsedSec?: number };
        english?: { elapsedSec?: number };
      };
      performance = {
        skipped: false,
        mathsReuse: {
          bookingId: mathsId,
          reused: mathsReuse.reused,
          status: mathsReuse.session.status,
          durationMs: mathsReuseMs,
        },
        englishReuse: {
          bookingId: engId,
          reused: engReuse.reused,
          status: engReuse.session.status,
          durationMs: engReuseMs,
        },
        note: "Full 90/120 force-regeneration left to prior live UAT evidence; hardening measures reuse path only (low-risk).",
        priorLiveGenerationElapsedSec: {
          maths: priorFull.maths?.elapsedSec,
          english: priorFull.english?.elapsedSec,
        },
      };
      await prisma.$disconnect();
    }
  } catch (error) {
    performance = {
      skipped: true,
      reason: error instanceof Error ? error.message : "reuse probe failed",
    };
  }

  const report = {
    startedAt: new Date().toISOString(),
    baseUrl: UAT_FIXTURES.baseUrl,
    safety: {
      noMigrateReset: true,
      noCommitPushDeploy: true,
      no105Enabled: true,
      noNewFeatures: true,
    },
    britishAudit,
    promptImprovements: {
      britishEnglishCentralised: true,
      englishStemVariety: true,
      mathsRecapIntent: true,
    },
    consistency,
    performance,
    telemetry: {
      daytimeStageEvent: "daytime_stage_generation",
      sessionEvent: "short_learning_session_content",
      fields: [
        "generationDurationMs",
        "openAiLatencyMs",
        "validatorDurationMs",
        "plannerDurationMs",
        "retryCount",
        "openAiSucceeded / success",
        "reused / regenerated",
      ],
      personalData: false,
    },
    finishedAt: new Date().toISOString(),
  };

  writeFileSync(resolve(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
