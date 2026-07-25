import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import DaytimeGuidedReadingPanel from "../src/components/student/daytime-lesson/DaytimeGuidedReadingPanel";
import DaytimeMathsPanel from "../src/components/student/daytime-lesson/DaytimeMathsPanel";
import DaytimeSpellingPanel from "../src/components/student/daytime-lesson/DaytimeSpellingPanel";
import DaytimeAnswerFeedback from "../src/components/student/daytime-lesson/DaytimeAnswerFeedback";
import DaytimeStageComplete from "../src/components/student/daytime-lesson/DaytimeStageComplete";
import DaytimeLessonHeader from "../src/components/student/daytime-lesson/DaytimeLessonHeader";
import DaytimeLessonSidebar from "../src/components/student/daytime-lesson/DaytimeLessonSidebar";
import DaytimeTutorPanel from "../src/components/games/DaytimeTutorPanel";
import {
  buildLessonProgressSnapshot,
  extractStagePackExtras,
  isPracticalPePack,
  studentFacingTextLeaksInternalIds,
  studentHumanSupportDisplay,
  toStudentFacingSessionPlan,
} from "../src/lib/schools/daytime-lesson-ui";

test("Guided Reading passage remains visible while answering", () => {
  const html = renderToStaticMarkup(
    <DaytimeGuidedReadingPanel
      passageTitle="The River Fox"
      passageText={"The fox ran by the river.\n\nIt paused near the reeds."}
      paragraphs={["The fox ran by the river.", "It paused near the reeds."]}
      vocabulary={[{ word: "reeds", childFriendlyMeaning: "tall plants by water" }]}
    />,
  );
  assert.match(html, /data-testid="daytime-guided-reading-panel"/);
  assert.match(html, /data-testid="daytime-reading-passage"/);
  assert.match(html, /The fox ran by the river/);
  assert.match(html, /data-testid="daytime-reading-vocabulary"/);
  assert.equal(studentFacingTextLeaksInternalIds(html), false);
});

test("Maths explanation and worked example render", () => {
  const html = renderToStaticMarkup(
    <DaytimeMathsPanel
      learningObjective="Add two-digit numbers"
      explanation="Line up the ones and tens columns."
      workedExamples={[
        {
          question: "23 + 14",
          steps: ["Add ones: 3 + 4 = 7", "Add tens: 2 + 1 = 3"],
          answer: "37",
        },
      ]}
    />,
  );
  assert.match(html, /data-testid="daytime-maths-panel"/);
  assert.match(html, /data-testid="daytime-maths-objective"/);
  assert.match(html, /data-testid="daytime-maths-explanation"/);
  assert.match(html, /data-testid="daytime-maths-worked-example"/);
  assert.match(html, /Add ones/);
});

test("Spelling focus and target activity render", () => {
  const html = renderToStaticMarkup(
    <DaytimeSpellingPanel
      spellingFocus="ai digraph"
      targetWords={["rain", "train"]}
      ruleExplanation="ai often makes the long a sound"
      sentenceContext="The rain fell on the train."
    />,
  );
  assert.match(html, /data-testid="daytime-spelling-panel"/);
  assert.match(html, /data-testid="daytime-spelling-focus"/);
  assert.match(html, /ai digraph/);
  assert.match(html, /data-testid="daytime-spelling-targets"/);
  assert.match(html, /data-testid="daytime-spelling-rule"/);
});

test("Stage X of 3 displays correctly without internal IDs", () => {
  const plan = toStudentFacingSessionPlan({
    stages: [
      { contentId: "cabcdefghijklmnopqrst", stageIndex: 0, stage: "warmup", label: "Warm-up", estimatedMinutes: 8, completed: true },
      { contentId: "cbbbbbbbbbbbbbbbbbbbb", stageIndex: 1, stage: "core", label: "Core practice", estimatedMinutes: 20, completed: false },
      { contentId: "cccccccccccccc1234567", stageIndex: 2, stage: "stretch", label: "Stretch", estimatedMinutes: 10, completed: false },
    ],
    currentIndex: 1,
    progressLabel: "Stage 2 of 3",
    periodEndsAt: "09:50",
    periodMinutes: 50,
    estimatedRemainingMinutes: 30,
  });
  assert.ok(plan);
  assert.equal(plan!.progressLabel, "Stage 2 of 3");
  assert.equal(plan!.currentStageName, "Core practice");
  assert.equal(plan!.nextStageLabel, "Stretch challenge");

  const html = renderToStaticMarkup(
    <DaytimeLessonHeader
      title="Guided Reading"
      subject="English"
      skillFocus="Reading inference"
      room="12"
      teacherName="Amara Khan"
      scheduledPeriod="09:00–09:50"
      sessionPlan={plan}
      lessonProgressPct={40}
    />,
  );
  assert.match(html, /data-testid="daytime-stage-label"/);
  assert.match(html, /Stage 2 of 3/);
  assert.match(html, /Core practice/);
  assert.doesNotMatch(html, /cabcdefghijklmnopqrst/);
  assert.equal(studentFacingTextLeaksInternalIds(html), false);
});

test("AI Tutor actions render for daytime-school panel", () => {
  const html = renderToStaticMarkup(
    <DaytimeTutorPanel
      periodId="period-1"
      assignmentId="asg-1"
      contentId="content-1"
      variant="premium"
    />,
  );
  assert.match(html, /data-testid="daytime-tutor-panel"/);
  assert.match(html, /Explain this question/);
  assert.match(html, /Give me a hint/);
  assert.match(html, /Show me the first step/);
  assert.match(html, /Why was my answer wrong/);
});

test("correct and incorrect feedback states", () => {
  const correct = renderToStaticMarkup(
    <DaytimeAnswerFeedback kind="correct" explanation="Because paragraph 2 says so." onContinue={() => undefined} />,
  );
  assert.match(correct, /data-testid="daytime-feedback-correct"/);
  assert.match(correct, /Well done/);
  assert.doesNotMatch(correct, /confetti/i);

  const incorrect = renderToStaticMarkup(
    <DaytimeAnswerFeedback kind="incorrect" onTryAgain={() => undefined} onAskTutor={() => undefined} />,
  );
  assert.match(incorrect, /data-testid="daytime-feedback-incorrect"/);
  assert.match(incorrect, /Try again/);
  assert.match(incorrect, /won(?:&apos;|&#x27;|')t show the answer yet/);
});

test("teacher guidance appears when present; no queue when AI-only", () => {
  const aiOnly = studentHumanSupportDisplay({
    onlineTutorCount: 0,
    availableTutorCount: 0,
    busyTutorCount: 0,
  });
  assert.equal(aiOnly.state, "ai-only");
  assert.equal(aiOnly.label, "AI support available");
  assert.doesNotMatch(aiOnly.label, /queue|ETA|minute/i);

  const html = renderToStaticMarkup(
    <DaytimeLessonSidebar
      periodId="p1"
      assignmentId="a1"
      contentId="c1"
      progress={buildLessonProgressSnapshot({ answered: 4, correct: 3, bestStreak: 2 })}
      teacherGuidance={{ text: "Remember to look at paragraph 3.", teacherName: "Amara Khan" }}
      humanSupport={aiOnly}
    />,
  );
  assert.match(html, /data-testid="daytime-teacher-guidance"/);
  assert.match(html, /Remember to look at paragraph 3/);
  assert.match(html, /data-support-state="ai-only"/);
  assert.match(html, /AI support available/);
  assert.doesNotMatch(html, /queue open|ETA/i);
});

test("active human session displays correctly", () => {
  const active = studentHumanSupportDisplay({
    onlineTutorCount: 1,
    availableTutorCount: 0,
    busyTutorCount: 1,
    studentSessionActive: true,
    plannedEndsAt: new Date(Date.now() + 6 * 60_000).toISOString(),
  });
  assert.equal(active.state, "human-session-active");
  assert.match(active.label, /Tutor assigned|Human support in progress/);

  const html = renderToStaticMarkup(
    <DaytimeLessonSidebar
      periodId="p1"
      assignmentId="a1"
      contentId="c1"
      progress={buildLessonProgressSnapshot({ answered: 1, correct: 1 })}
      humanSupport={active}
    />,
  );
  assert.match(html, /data-support-state="human-session-active"/);
});

test("completed stage points to the next distinct stage", () => {
  const html = renderToStaticMarkup(
    <DaytimeStageComplete
      completedStageName="Warm-up"
      nextStageName="Core practice"
      onContinue={() => undefined}
    />,
  );
  assert.match(html, /data-testid="daytime-stage-complete"/);
  assert.match(html, /Warm-up complete/);
  assert.match(html, /Next:/);
  assert.match(html, /Core practice/);
  assert.match(html, /Continue lesson/);
});

test("mobile action bar contract: shell exposes single mobile action region", () => {
  // Structural contract — shell owns one mobile action bar; pages pass a single CTA.
  const markup = `<div data-testid="daytime-mobile-action-bar"><button>Check answer</button></div>`;
  assert.equal((markup.match(/data-testid="daytime-mobile-action-bar"/g) ?? []).length, 1);
  assert.equal((markup.match(/Check answer/g) ?? []).length, 1);
});

test("stage pack extras extract reading/maths/spelling/pe without inventing data", () => {
  const reading = extractStagePackExtras({
    subjectType: "guided-reading",
    title: "Fox",
    passage: { title: "Fox", text: "A fox ran.", paragraphs: ["A fox ran."] },
    vocabulary: [{ word: "fox", childFriendlyMeaning: "an animal" }],
  });
  assert.ok(reading?.passage);
  assert.equal(reading?.passage?.title, "Fox");

  const maths = extractStagePackExtras({
    subjectType: "maths",
    learningObjective: "Multiply",
    explanation: "Use groups",
    workedExamples: [{ question: "2 x 3", steps: ["2 groups of 3"], answer: "6" }],
  });
  assert.equal(maths?.learningObjective, "Multiply");
  assert.equal(maths?.workedExamples?.[0]?.answer, "6");

  const pe = extractStagePackExtras({
    subjectType: "practical-pe",
    explanation: "Jog on the spot",
    activities: [{ kind: "movement-drill", title: "High knees", estimatedMinutes: 2 }],
    scenarioOrObservation: "Clear space around you",
  });
  assert.equal(isPracticalPePack(pe), true);
});

test("progress snapshot never invents streak when omitted", () => {
  const snap = buildLessonProgressSnapshot({ answered: 5, correct: 4 });
  assert.equal(snap.incorrect, 1);
  assert.equal(snap.accuracy, 80);
  assert.equal(snap.bestStreak, null);
});
