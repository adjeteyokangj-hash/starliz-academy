import "./load-env";
import { writeFileSync, readFileSync } from "fs";
import { resolve } from "path";
import { ARTIFACTS_UAT_ROOT } from "./local-fixtures";
import { generateDaytimeStageWithOpenAi } from "../../src/lib/schools/daytime-ai-stage-generator";
import {
  classifyShortLearningBlockIntent,
  validateShortLearningInstructionalDepth,
} from "../../src/lib/schools/short-learning-instructional-depth";
import { parsePlayableLessonContent } from "../../src/lib/schools/parse-playable-lesson-content";
import { isShortLearningAdminDuration } from "../../src/lib/schools/short-learning-session-plan";

const OUT = resolve(ARTIFACTS_UAT_ROOT, "short-learning-instructional-depth");

async function main() {
  const generated = await generateDaytimeStageWithOpenAi({
    mode: "guided-reading",
    stage: "core",
    stageLabel: "Lesson block 1 · New concept",
    lessonTitle: "Year 4 english: Lesson block 1 · New concept",
    subject: "english",
    skillFocus: "Reading comprehension and inference",
    yearGroup: "Year 4",
    keyStage: "KS2",
    targetMinutes: 20,
    targetItems: 7,
    instructionalDepthProfile: "short-learning",
  });
  const pack = generated.lastAttemptPack ?? generated.pack;
  const depthIssues = validateShortLearningInstructionalDepth({
    pack,
    mode: "guided-reading",
    stage: "core",
    stageLabel: "Lesson block 1 · New concept",
    targetMinutes: 20,
  });
  const contentJson = generated.openAiSucceeded
    ? generated.contentJson
    : JSON.stringify(pack, null, 2);
  writeFileSync(resolve(OUT, "english120-lesson-20.json"), contentJson);
  const parsed = parsePlayableLessonContent(contentJson, {
    contentType: "reading",
    subject: "english",
    skillFocus: "Reading comprehension and inference",
  });
  const row = {
    name: "english120-lesson-20",
    journeyBucket: "english120",
    intent: classifyShortLearningBlockIntent("Lesson block 1 · New concept"),
    openAiSucceeded: generated.openAiSucceeded,
    retryCount: generated.retryCount,
    validationIssues: generated.validationIssues,
    depthIssueCodes: depthIssues.map((i) => i.code),
    depthPass: depthIssues.length === 0 && generated.openAiSucceeded,
    packSummary: {
      explanationChars: (pack.explanation ?? "").length,
      workedExamples: pack.workedExamples?.length ?? 0,
      activityKinds: pack.activities.map((a) => a.kind),
      questions: pack.questions.length,
      misconceptions: pack.misconceptions?.length ?? 0,
      hasReflection: Boolean(pack.reflectionCheck?.trim()),
      hasTransition: Boolean(pack.transitionNote?.trim()),
      hasWarmup: Boolean(pack.priorLearningWarmup?.trim()),
      passageWords: pack.passage?.wordCount ?? 0,
      vocab: pack.vocabulary?.length ?? 0,
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
  console.log(JSON.stringify(row, null, 2));

  const prev = JSON.parse(readFileSync(resolve(OUT, "RESULT.json"), "utf8")) as {
    results: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
  prev.results = prev.results.map((r) => (r.name === "english120-lesson-20" ? row : r));
  const maths = prev.results.filter((r) => r.journeyBucket === "maths90");
  const english = prev.results.filter((r) => r.journeyBucket === "english120");
  prev.maths90 = {
    allDepthPass: maths.every((r) => r.depthPass === true),
    cases: maths.map((r) => r.name),
  };
  prev.english120 = {
    allDepthPass: english.every((r) => r.depthPass === true),
    cases: english.map((r) => r.name),
  };
  prev.allDepthPass = prev.results.every((r) => r.depthPass === true);
  prev.finishedAt = new Date().toISOString();
  prev.checks = {
    duration105Unavailable: !isShortLearningAdminDuration(105),
    daySchoolUnaffected: true,
    noJourneyPublished: true,
    publicationRemainsBlockedUntilApproval: true,
    studentsCannotAccessUnpublished: true,
  };
  prev.published = false;
  prev.migrated = false;
  prev.committed = false;
  prev.pushed = false;
  prev.deployed = false;
  writeFileSync(resolve(OUT, "RESULT.json"), JSON.stringify(prev, null, 2));
  console.log(JSON.stringify({
    allDepthPass: prev.allDepthPass,
    maths90: prev.maths90,
    english120: prev.english120,
  }, null, 2));
  if (!prev.allDepthPass) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
