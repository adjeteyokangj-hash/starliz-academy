import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateMisconceptionAnalytics,
  deriveAttemptPatternSignals,
  deriveAiHelpSignals,
  deriveHumanSessionSignals,
  deriveLearningDnaSignals,
  deriveSpellingMistakeSignals,
  latestMisconceptionFromTutorPayloads,
} from "../src/lib/misconception-analytics";
import { SUPPORT_SESSION_META_VERSION } from "../src/lib/schools/human-support-session";

const NOW = "2026-07-24T12:00:00.000Z";

test("deriveAttemptPatternSignals flags repeated incorrect skill answers", () => {
  const signals = deriveAttemptPatternSignals(
    [
      {
        id: "a1",
        studentId: "s1",
        subject: "math",
        skillFocus: "fractions",
        correct: false,
        questionText: "What is 1/2 + 1/4?",
        answerGiven: "1/3",
        hintsUsed: 2,
        createdAt: "2026-07-24T10:00:00.000Z",
      },
      {
        id: "a2",
        studentId: "s1",
        subject: "math",
        skillFocus: "fractions",
        correct: false,
        questionText: "What is 1/2 + 1/4?",
        answerGiven: "2/6",
        hintsUsed: 1,
        createdAt: "2026-07-24T10:05:00.000Z",
      },
      {
        id: "a3",
        studentId: "s1",
        subject: "math",
        skillFocus: "fractions",
        correct: false,
        questionText: "What is 1/2 + 1/4?",
        answerGiven: "3/4",
        hintsUsed: 0,
        createdAt: "2026-07-24T10:10:00.000Z",
      },
    ],
    NOW,
  );

  assert.equal(signals.length, 1);
  assert.equal(signals[0].source, "attempt_pattern");
  assert.equal(signals[0].skillFocus, "fractions");
  assert.ok(signals[0].confidence >= 0.45);
  assert.equal(signals[0].evidenceRefs.length, 3);
});

test("deriveAiHelpSignals persists labeled misconception and exhaustion", () => {
  const labeled = deriveAiHelpSignals(
    [
      {
        id: "c1",
        studentId: "s1",
        subject: "math",
        skillFocus: "dts:p1:asg1:q1:conv1",
        questionText: JSON.stringify({
          message: "Try finding a common denominator.",
          intent: "why-wrong",
          source: "openai",
          needsTeacher: false,
          misconception: "Adding numerators and denominators separately",
          questionKey: "q1",
        }),
        hintLevel: 2,
        mode: "daytime_tutor",
        createdAt: "2026-07-24T11:00:00.000Z",
      },
    ],
    NOW,
  );
  assert.equal(labeled.length, 1);
  assert.equal(labeled[0].source, "ai_help");
  assert.match(labeled[0].text ?? "", /common denominator|Adding numerators/i);

  const exhausted = deriveAiHelpSignals(
    [
      {
        id: "c2",
        studentId: "s2",
        subject: "reading",
        skillFocus: "dts:p1:asg2:q2:conv2",
        questionText: JSON.stringify({
          message: "Please ask your teacher.",
          intent: "give-hint",
          source: "fallback",
          needsTeacher: true,
          questionKey: "q2",
        }),
        hintLevel: 4,
        mode: "daytime_tutor",
        createdAt: "2026-07-24T11:30:00.000Z",
      },
    ],
    NOW,
  );
  assert.equal(exhausted.length, 1);
  assert.match(exhausted[0].text ?? "", /exhausted/i);
});

test("latestMisconceptionFromTutorPayloads returns newest labeled string", () => {
  const value = latestMisconceptionFromTutorPayloads([
    JSON.stringify({ message: "a", misconception: "old" }),
    JSON.stringify({ message: "b" }),
    JSON.stringify({ message: "c", misconception: "new sticky idea" }),
  ]);
  assert.equal(value, "new sticky idea");
  assert.equal(latestMisconceptionFromTutorPayloads([null, "{}"]), null);
});

test("deriveHumanSessionSignals reads notes, Needs monitoring, and unresolved report", () => {
  const metadataJson = JSON.stringify({
    metaVersion: SUPPORT_SESSION_META_VERSION,
    supportContextSnapshot: {
      acceptedAt: NOW,
      schoolId: "school-1",
      classroomId: "class-1",
      dayLessonId: "period-1",
      lessonId: "lesson-1",
      subject: "math",
      lessonTitle: "Fractions",
      curriculumSkill: "equivalent fractions",
      stage: "core",
      stageOrder: 1,
      contentId: null,
      assignmentId: null,
      questionKey: null,
      questionText: null,
      answerType: null,
      modelAnswerOrMarkingGuide: null,
      recentAttempts: [],
      wrongAttemptCount: 3,
      latestStudentAttempt: null,
      aiSupportState: null,
      aiHintsShown: 2,
      aiTutorHistory: [],
      misconception: null,
      recoveryState: null,
      needsTeacherReason: null,
      periodEndsAt: null,
      minutesRemainingAtAccept: 10,
      budgetMinutes: 8,
      plannedEndsAt: NOW,
    },
    sessionNotes: {
      privateNotes: "Worked on common denominators",
      misconception: "Treats fractions as whole-number addition",
      actionsTaken: ["reteach"],
      followUpNeeded: true,
    },
    guidanceMessages: [],
    returnAction: "resume_current",
  });

  const { signals, links } = deriveHumanSessionSignals(
    [
      {
        id: "sess-1",
        studentId: "s1",
        outcome: "partially_resolved",
        outcomeNotes: null,
        unresolvedReportJson: null,
        metadataJson,
        endedAt: NOW,
        startedAt: "2026-07-24T11:00:00.000Z",
      },
      {
        id: "sess-2",
        studentId: "s1",
        outcome: "unresolved",
        outcomeNotes: null,
        unresolvedReportJson: JSON.stringify({
          summary: "Student still cannot find equivalent fractions reliably.",
          whatWasTried: ["worked example", "manipulatives"],
          remainingDifficulty: "Cannot convert to common denominators",
          recommendedFollowUp: "Assign short reteach tomorrow morning",
          urgency: "medium",
        }),
        metadataJson: JSON.stringify({
          metaVersion: 1,
          supportContextSnapshot: null,
          sessionNotes: { privateNotes: "", actionsTaken: [], followUpNeeded: false },
          guidanceMessages: [],
          returnAction: "resume_current",
        }),
        endedAt: NOW,
        startedAt: "2026-07-24T11:20:00.000Z",
      },
    ],
    NOW,
  );

  assert.ok(signals.some((row) => row.source === "human_notes" && /whole-number/i.test(row.text ?? "")));
  assert.ok(signals.some((row) => row.source === "unresolved_report"));
  assert.equal(links.filter((row) => row.outcome === "partially_resolved").length, 1);
  assert.equal(links.find((row) => row.outcome === "partially_resolved")?.outcomeLabel, "Needs monitoring");
});

test("deriveLearningDnaSignals and spelling mistakes contribute", () => {
  const dna = deriveLearningDnaSignals(
    [
      {
        studentId: "s1",
        aiLearningProfileJson: JSON.stringify({
          learningDna: {
            version: 1,
            updatedAt: NOW,
            totalAttempts: 10,
            correctAttempts: 4,
            confidenceEma: 0.4,
            frustrationEma: 0.5,
            independenceEma: 0.4,
            focusEma: 0.5,
            guessingRiskEma: 0.2,
            modalityScores: { visual: 1, verbal: 1, interactive: 1, repetition: 1, logic: 1 },
            paceScores: { slow: 1, balanced: 1, challenge: 1 },
            recurringMistakes: {
              "math:fractions:incorrect": 4,
              "math:place-value:incorrect": 1,
            },
            subjectStates: {
              spelling: { attempts: 0, correct: 0, accuracy: 0, avgResponseMs: 0, avgHintsUsed: 0, confidenceEma: 0.5 },
              math: { attempts: 10, correct: 4, accuracy: 40, avgResponseMs: 12000, avgHintsUsed: 1, confidenceEma: 0.4 },
              reading: { attempts: 0, correct: 0, accuracy: 0, avgResponseMs: 0, avgHintsUsed: 0, confidenceEma: 0.5 },
            },
            tutorPersona: { pace: "slow", style: "guided_reasoning", tone: "calm" },
            recommendations: [],
          },
        }),
      },
    ],
    NOW,
  );
  assert.equal(dna.length, 1);
  assert.equal(dna[0].source, "learning_dna");
  assert.match(dna[0].code ?? "", /fractions/);

  const spelling = deriveSpellingMistakeSignals(
    [
      {
        id: "w1",
        studentId: "s1",
        word: "because",
        mistakeType: "vowel_pattern",
        status: "weak",
        attempts: 5,
        correctCount: 1,
        lastSeen: NOW,
      },
    ],
    NOW,
  );
  assert.equal(spelling.length, 1);
  assert.equal(spelling[0].source, "spelling_mistake");
});

test("aggregateMisconceptionAnalytics builds cohort summary", () => {
  const cohort = aggregateMisconceptionAnalytics({
    nowIso: NOW,
    windowDays: 30,
    schoolId: "school-1",
    studentNames: { s1: "Alex" },
    attempts: [
      {
        id: "a1",
        studentId: "s1",
        subject: "math",
        skillFocus: "fractions",
        correct: false,
        questionText: "1/2 + 1/4",
        answerGiven: "1/3",
        hintsUsed: 2,
        createdAt: "2026-07-24T10:00:00.000Z",
      },
      {
        id: "a2",
        studentId: "s1",
        subject: "math",
        skillFocus: "fractions",
        correct: false,
        questionText: "1/2 + 1/4",
        answerGiven: "2/6",
        hintsUsed: 1,
        createdAt: "2026-07-24T10:05:00.000Z",
      },
      {
        id: "a3",
        studentId: "s1",
        subject: "math",
        skillFocus: "fractions",
        correct: false,
        questionText: "1/2 + 1/4",
        answerGiven: "3/4",
        hintsUsed: 0,
        createdAt: "2026-07-24T10:10:00.000Z",
      },
    ],
    aiHelpTurns: [
      {
        id: "c1",
        studentId: "s1",
        subject: "math",
        skillFocus: "dts:x",
        questionText: JSON.stringify({
          message: "hint",
          needsTeacher: true,
          misconception: "Adds across numerator and denominator",
          source: "openai",
          intent: "why-wrong",
        }),
        hintLevel: 3,
        mode: "daytime_tutor",
        createdAt: "2026-07-24T10:20:00.000Z",
      },
    ],
    humanSessions: [],
    learningDna: [],
    spellingMistakes: [],
  });

  assert.equal(cohort.version, 1);
  assert.ok(cohort.totalSignals >= 2);
  assert.equal(cohort.students.length, 1);
  assert.equal(cohort.students[0].studentName, "Alex");
  assert.ok(cohort.bySource.some((row) => row.source === "attempt_pattern"));
  assert.ok(cohort.bySource.some((row) => row.source === "ai_help"));
  assert.ok(cohort.topSkills.some((row) => row.skillFocus === "fractions"));
});
