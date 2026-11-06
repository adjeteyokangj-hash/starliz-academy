import test from "node:test";
import assert from "node:assert/strict";
import { assessCodingStage, deriveSkillStatus, freshEvidence, stageCountsAsAssessment, stageUnlocked } from "../src/lib/coding/assessment";
import { REFERENCE_PROGRAMS } from "../src/lib/coding/answers";
import { codingPathwayIntro, pathwayForYear, publishedPathwayIds, UNDERSTANDING_LOOPS } from "../src/lib/coding/catalog";
import { publishedLessonValidation, validateCodingLessonDraft } from "../src/lib/coding/draft-validation";
import { publicPlacementQuestions, recommendCodingPathway } from "../src/lib/coding/placement";
import { nextCodingRewards } from "../src/lib/coding/rewards";
import { masteredTotal } from "../src/lib/coding/dashboard-lessons";
import { visibleCodingStage } from "../src/lib/coding/types";
import { parseCodingProgram, runCodingProgram } from "../src/lib/coding/runner";
import { buildCodingSupportHandoff } from "../src/lib/coding/support-handoff";
import { nextCodingHint } from "../src/lib/coding/tutor";
import { parentSubjectsForYearGroup } from "../src/lib/subject-selection";
import { practiceHrefForPeriod } from "../src/lib/schools/start-daytime-period";
import { taskHrefForContentType } from "../src/lib/assignments";

test("coding is offered from Year 1 and not in Reception", () => {
  assert.equal(parentSubjectsForYearGroup("Reception").some((subject) => subject.key === "coding"), false);
  assert.equal(parentSubjectsForYearGroup("Year 1").some((subject) => subject.key === "coding"), true);
  assert.equal(parentSubjectsForYearGroup("Year 11").some((subject) => subject.key === "coding"), true);
  assert.equal(pathwayForYear("Year 2"), "foundations");
  assert.equal(pathwayForYear("Year 4"), "block-coding");
  assert.equal(pathwayForYear("Year 10"), "applied");
});

test("the published loops lesson passes executable checks and other pathways stay unpublished", () => {
  const validation = publishedLessonValidation();
  assert.equal(validation.ok, true, validation.issues.map((issue) => issue.message).join("; "));
  const draft = {
    ...UNDERSTANDING_LOOPS,
    stages: UNDERSTANDING_LOOPS.stages.filter((stage) => stage.stage !== "debug"),
  };
  const broken = validateCodingLessonDraft(draft);
  assert.equal(broken.ok, false);
  assert.equal(broken.issues.some((issue) => issue.code === "stage-missing"), true);
});

test("placement can recommend revision without ignoring the year group", () => {
  const recommendation = recommendCodingPathway({
    yearGroup: "Year 8",
    answers: [{ questionId: "sequence", choiceId: "spread-then-slice" }],
  });
  assert.equal(recommendation.yearPathway, "programming-web");
  assert.equal(recommendation.recommended, "foundations");
  assert.equal(recommendation.adjustment, "revision");
});

test("the block runner is isolated and stops runaway repeats", () => {
  const rejected = parseCodingProgram({ blocks: [{ id: "x", kind: "eval", code: "process.exit(1)" }] });
  assert.equal(rejected.ok, false);

  const nested = parseCodingProgram({
    blocks: [{
      id: "a",
      kind: "repeat",
      times: 8,
      body: [{
        id: "b",
        kind: "repeat",
        times: 8,
        body: [{ id: "d", kind: "move", direction: "right" }, { id: "e", kind: "move", direction: "left" }],
      }],
    }],
  });
  assert.equal(nested.ok, true);
  if (!nested.ok) return;
  const run = runCodingProgram(nested.program, { x: 1, y: 0 });
  assert.equal(run.limitHit, true);
  assert.equal(run.ok, false);
  assert.ok(run.steps <= 40);
});

test("a correct loop reaches the star and copied moves do not count", () => {
  const looped = runCodingProgram(REFERENCE_PROGRAMS.build, { x: 4, y: 0 });
  assert.equal(looped.reachedGoal, true);
  assert.equal(looped.usedLoop, true);

  const copied = runCodingProgram({
    blocks: [
      { id: "1", kind: "move", direction: "right" },
      { id: "2", kind: "move", direction: "right" },
      { id: "3", kind: "move", direction: "right" },
      { id: "4", kind: "move", direction: "right" },
    ],
  }, { x: 4, y: 0 });
  const assessment = assessCodingStage({
    lesson: UNDERSTANDING_LOOPS,
    stage: "build",
    program: { blocks: copied.frames.length ? [
      { id: "1", kind: "move", direction: "right" },
      { id: "2", kind: "move", direction: "right" },
      { id: "3", kind: "move", direction: "right" },
      { id: "4", kind: "move", direction: "right" },
    ] : [] },
    evidence: freshEvidence(),
    revealingHints: 0,
  });
  assert.equal(assessment.passed, false);
  assert.match(assessment.feedback, /loop/i);
});

test("working code alone does not equal mastery", () => {
  const createOnly = assessCodingStage({
    lesson: UNDERSTANDING_LOOPS,
    stage: "create",
    program: REFERENCE_PROGRAMS.create,
    evidence: freshEvidence(),
    revealingHints: 0,
  });
  assert.equal(createOnly.passed, true);
  assert.equal(createOnly.evidence.independent, true);
  assert.equal(deriveSkillStatus(true, createOnly.evidence), "practising");
  assert.notEqual(deriveSkillStatus(true, createOnly.evidence), "mastered");

  const mastered = deriveSkillStatus(true, {
    prediction: true,
    practical: true,
    debugging: true,
    explanation: true,
    independent: true,
  });
  assert.equal(mastered, "mastered");
});

test("debug starter fails until the direction inside the loop is repaired", () => {
  const starter = UNDERSTANDING_LOOPS.stages.find((stage) => stage.stage === "debug")!.starter;
  const broken = assessCodingStage({
    lesson: UNDERSTANDING_LOOPS,
    stage: "debug",
    program: starter,
    evidence: freshEvidence(),
    revealingHints: 0,
  });
  assert.equal(broken.passed, false);
  const fixed = assessCodingStage({
    lesson: UNDERSTANDING_LOOPS,
    stage: "debug",
    program: REFERENCE_PROGRAMS.debug,
    evidence: freshEvidence(),
    revealingHints: 0,
  });
  assert.equal(fixed.passed, true);
  assert.equal(fixed.evidence.debugging, true);
});

test("the tutor asks before it reveals, and uses the learner's blocks", () => {
  const first = nextCodingHint({
    lesson: UNDERSTANDING_LOOPS,
    stage: "create",
    program: { blocks: [] },
    hintCount: 0,
    run: null,
  });
  assert.equal(first.revealsSolution, false);
  assert.equal(first.guidingQuestion, true);
  assert.doesNotMatch(first.message, /repeat 2 with move right/i);

  const revealed = nextCodingHint({
    lesson: UNDERSTANDING_LOOPS,
    stage: "debug",
    program: UNDERSTANDING_LOOPS.stages.find((stage) => stage.stage === "debug")!.starter,
    hintCount: 2,
    run: runCodingProgram(UNDERSTANDING_LOOPS.stages.find((stage) => stage.stage === "debug")!.starter, { x: 3, y: 0 }),
  });
  assert.equal(revealed.revealsSolution, true);
  assert.match(revealed.message, /left|right/i);
});

test("prediction hints never give the answer away", () => {
  for (const count of [0, 1, 2]) {
    const turn = nextCodingHint({
      lesson: UNDERSTANDING_LOOPS,
      stage: "predict",
      program: UNDERSTANDING_LOOPS.stages[0]!.starter,
      hintCount: count,
      run: null,
    });
    assert.equal(turn.revealsSolution, false);
    assert.doesNotMatch(turn.message, /three times to the right/i);
  }
});

test("support handoff carries the task, code, error and hints", () => {
  const handoff = buildCodingSupportHandoff({
    lesson: UNDERSTANDING_LOOPS,
    stage: "debug",
    program: UNDERSTANDING_LOOPS.stages.find((stage) => stage.stage === "debug")!.starter,
    error: "The character walked the wrong way.",
    feedback: "Change the move inside the loop.",
    hintsAttempted: ["Which way is the star?"],
    skillStatus: "learning",
  });
  assert.equal(handoff.subject, "coding");
  assert.equal(handoff.privateProject, true);
  assert("blocks" in handoff.program);
  assert.equal(handoff.program.blocks[0]?.kind, "repeat");
  assert.match(handoff.task, /wrong way/i);
  assert.deepEqual(handoff.hintsAttempted, ["Which way is the star?"]);
  assert.equal(handoff.error, "The character walked the wrong way.");
});

test("rewards cover persistence, improvement and mastery, not a single successful run", () => {
  const flags = { persistence: false, improvement: false, mastery: false, failedStages: ["build"] };
  const persisted = nextCodingRewards({
    flags,
    previousStatus: "learning",
    nextStatus: "practising",
    stage: "build",
    passed: true,
  });
  assert.deepEqual(persisted.awards.sort(), ["improvement", "persistence"]);
  const firstSuccess = nextCodingRewards({
    flags: { persistence: false, improvement: false, mastery: false, failedStages: [] },
    previousStatus: "practising",
    nextStatus: "practising",
    stage: "create",
    passed: true,
  });
  assert.deepEqual(firstSuccess.awards, []);
});

test("day school and assignment links open the coding workspace", () => {
  const href = practiceHrefForPeriod("Coding", "Loops", "period-1");
  assert.match(href ?? "", /\/student\/coding\/understanding-loops/);
  assert.match(href ?? "", /daytimePeriodId=period-1/);
  assert.equal(taskHrefForContentType("coding"), "/student/coding/understanding-loops");
  assert.equal(practiceHrefForPeriod("Computing", "Networks"), null);
});

test("discover does not count as an assessment and later stages stay locked", () => {
  assert.equal(stageCountsAsAssessment("discover"), false);
  assert.equal(stageCountsAsAssessment("predict"), true);
  assert.equal(stageUnlocked("predict", []), false);
  assert.equal(stageUnlocked("predict", ["discover"]), true);
  assert.equal(visibleCodingStage("predict", []), "discover");
  assert.equal(visibleCodingStage("review", ["discover", "predict", "build", "practise", "debug", "create"]), "review");
});

test("debug names the left move even when the character leaves the board", () => {
  const starter = UNDERSTANDING_LOOPS.stages.find((stage) => stage.stage === "debug")!.starter;
  const broken = assessCodingStage({
    lesson: UNDERSTANDING_LOOPS,
    stage: "debug",
    program: starter,
    evidence: freshEvidence(),
    revealingHints: 0,
  });
  assert.equal(broken.passed, false);
  assert.match(broken.feedback, /points left/);
  assert.match(broken.feedback, /star is to the right/);
  assert.match(broken.run?.error ?? "", /off the board/);
});

test("build credits the learner unless the tutor gave a full answer", () => {
  const alone = assessCodingStage({
    lesson: UNDERSTANDING_LOOPS,
    stage: "build",
    program: REFERENCE_PROGRAMS.build,
    evidence: freshEvidence(),
    revealingHints: 0,
  });
  assert.equal(alone.passed, true);
  assert.equal(alone.evidence.practical, true);
  assert.doesNotMatch(alone.feedback, /tutor/);
  const helped = assessCodingStage({
    lesson: UNDERSTANDING_LOOPS,
    stage: "build",
    program: REFERENCE_PROGRAMS.build,
    evidence: freshEvidence(),
    revealingHints: 1,
  });
  assert.match(helped.feedback, /tutor/);
});

test("review accepts an explanation that matches the loops and rejects a generic sentence", () => {
  const generic = assessCodingStage({
    lesson: UNDERSTANDING_LOOPS,
    stage: "review",
    program: REFERENCE_PROGRAMS.create,
    explanation: "A loop repeats the move, so I did not write the same move many times.",
    evidence: freshEvidence(),
    revealingHints: 0,
  });
  assert.equal(generic.passed, false);
  assert.match(generic.feedback, /direction/);
  const matched = assessCodingStage({
    lesson: UNDERSTANDING_LOOPS,
    stage: "review",
    program: REFERENCE_PROGRAMS.create,
    explanation: "My loops move right 2 times and up 2 times, so I did not write the move again and again.",
    evidence: freshEvidence(),
    revealingHints: 0,
  });
  assert.equal(matched.passed, true);
  assert.equal(matched.evidence.explanation, true);
});

test("placement questions follow published lessons and keep the learner year group", () => {
  const questions = publicPlacementQuestions(publishedPathwayIds());
  assert.equal(questions.some((question) => /variable/i.test(question.prompt)), false);
  assert.equal(questions.some((question) => /sorting/i.test(question.prompt)), false);
  assert.equal(questions.some((question) => /hop/i.test(question.prompt)), true);
  const intro = codingPathwayIntro({
    yearGroup: "Year 11",
    yearPathwayTitle: "Applied Computing",
    yearPathwayPublished: false,
    liveLessonTitle: "Understanding Loops",
  });
  assert.match(intro, /Year 11/);
  assert.match(intro, /not published yet/);
  assert.match(intro, /Understanding Loops/);
  assert.doesNotMatch(intro, /starts on Applied Computing/);
});

test("a mastered coding lesson is counted once on the dashboard", () => {
  const lessons = [{ id: "understanding-loops", title: "Understanding Loops", status: "mastered", href: "/student/coding/understanding-loops", skillCode: "coding_loops" }];
  assert.equal(masteredTotal([{ skill: "coding_loops", status: "mastered" }, { skill: "reading_cvc", status: "mastered" }], lessons), 2);
  assert.equal(masteredTotal([], lessons), 1);
  assert.equal(masteredTotal([], [{ ...lessons[0], status: "learning" }]), 0);
});
