import "./load-env";
import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { generateDaytimeStageWithOpenAi } from "../../src/lib/schools/daytime-ai-stage-generator";
import { validateShortLearningInstructionalDepth } from "../../src/lib/schools/short-learning-instructional-depth";

const out = resolve("artifacts/uat/short-learning-instructional-depth");
mkdirSync(out, { recursive: true });

async function main() {
  const generated = await generateDaytimeStageWithOpenAi({
    mode: "maths",
    stage: "core",
    stageLabel: "Lesson block 1 · New concept",
    lessonTitle: "Year 4 maths: Lesson block 1 · New concept",
    subject: "maths",
    skillFocus: "Multiplication facts and partitioning",
    yearGroup: "Year 4",
    keyStage: "KS2",
    targetMinutes: 18,
    targetItems: 6,
    instructionalDepthProfile: "short-learning",
  });
  const pack = generated.lastAttemptPack ?? generated.pack;
  const depth = validateShortLearningInstructionalDepth({
    pack,
    mode: "maths",
    stage: "core",
    stageLabel: "Lesson block 1 · New concept",
    targetMinutes: 18,
  });
  const summary = {
    openAiSucceeded: generated.openAiSucceeded,
    retryCount: generated.retryCount,
    validationIssues: generated.validationIssues,
    depthCodes: depth.map((i) => i.code),
    explanationChars: (pack.explanation ?? "").length,
    workedExamples: pack.workedExamples?.length ?? 0,
    questions: pack.questions.length,
    misconceptions: pack.misconceptions?.length ?? 0,
    hasWarmup: Boolean(pack.priorLearningWarmup?.trim()),
    hasReflection: Boolean(pack.reflectionCheck?.trim()),
    hasTransition: Boolean(pack.transitionNote?.trim()),
    activityKinds: pack.activities.map((a) => a.kind),
  };
  writeFileSync(resolve(out, "probe-maths-lesson.json"), JSON.stringify({ summary, pack }, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}
main().catch((e) => { console.error(e); process.exitCode = 1; });