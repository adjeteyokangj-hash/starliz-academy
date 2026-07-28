import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import {
  normalizeDaytimeStagePack,
  validateDaytimeStagePack,
} from "../../src/lib/schools/daytime-stage-validators";
import { classifyShortLearningBlockIntent } from "../../src/lib/schools/short-learning-instructional-depth";
import { parsePlayableLessonContent } from "../../src/lib/schools/parse-playable-lesson-content";
import { isShortLearningAdminDuration } from "../../src/lib/schools/short-learning-session-plan";
import { ARTIFACTS_UAT_ROOT } from "./local-fixtures";

const OUT = resolve(ARTIFACTS_UAT_ROOT, "short-learning-instructional-depth");
const LAST = resolve(OUT, "english120-lesson-20.last-attempt.json");
const RESULT_PATH = resolve(OUT, "RESULT.json");
const PACK_OUT = resolve(OUT, "english120-lesson-20.json");

const stageLabel = "Lesson block 1 · New concept";
const targetMinutes = 20;
const mode = "guided-reading" as const;

const raw = JSON.parse(readFileSync(LAST, "utf8"));
const pack = normalizeDaytimeStagePack(raw, mode);
if (!pack) {
  console.error("normalizeDaytimeStagePack returned null");
  process.exit(1);
}

const issues = validateDaytimeStagePack({
  pack,
  mode,
  stage: "core",
  targetMinutes,
  lessonTitle: pack.title || "Year 4 English: Lesson block 1 · New concept",
  instructionalDepthProfile: "short-learning",
  stageLabel,
});

console.log(
  JSON.stringify(
    {
      issueCount: issues.length,
      issues: issues.map((i) => `${i.code}: ${i.message}`),
      passageWordCount: pack.passage?.wordCount ?? 0,
      workedExamples: pack.workedExamples?.length ?? 0,
      questions: pack.questions.length,
    },
    null,
    2,
  ),
);

if (issues.length !== 0) {
  console.error("Validation failed; not updating RESULT.json");
  process.exit(1);
}

const contentJson = JSON.stringify(pack, null, 2);
writeFileSync(PACK_OUT, contentJson, "utf8");

const parsed = parsePlayableLessonContent(contentJson, {
  contentType: "reading",
  subject: "english",
  skillFocus: "Reading comprehension and inference",
});

const row = {
  name: "english120-lesson-20",
  journeyBucket: "english120",
  intent: classifyShortLearningBlockIntent(stageLabel),
  openAiSucceeded: true,
  retryCount: 3,
  validationIssues: [] as string[],
  depthIssueCodes: [] as string[],
  depthPass: true,
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

const prev = JSON.parse(readFileSync(RESULT_PATH, "utf8")) as {
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

writeFileSync(RESULT_PATH, JSON.stringify(prev, null, 2), "utf8");

console.log(
  JSON.stringify(
    {
      patched: true,
      allDepthPass: prev.allDepthPass,
      maths90: prev.maths90,
      english120: prev.english120,
      packSummary: row.packSummary,
      published: prev.published,
      migrated: prev.migrated,
      committed: prev.committed,
      pushed: prev.pushed,
      deployed: prev.deployed,
    },
    null,
    2,
  ),
);