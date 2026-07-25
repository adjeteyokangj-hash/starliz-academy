import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyDaytimeSubjectMode } from "../src/lib/schools/daytime-subject-mode";
import {
  normalizeDaytimeStagePack,
  validateDaytimeStagePack,
  serializeDaytimeStageContentJson,
} from "../src/lib/schools/daytime-stage-validators";
import { buildStoredQuestionHelpSteps, extractHelpFromQuestionItem } from "../src/lib/schools/question-help";
import { studentFacingTextLeaksInternalIds, evaluateDaytimeLessonHealth } from "../src/lib/schools/daytime-lesson-health";
import { activitiesSupportTargetMinutes } from "../src/lib/schools/daytime-activity-types";

describe("daytime subject contracts", () => {
  it("classifies guided reading, spelling, maths, science, and PE", () => {
    assert.equal(classifyDaytimeSubjectMode("English — Guided reading", "Reading inference"), "guided-reading");
    assert.equal(classifyDaytimeSubjectMode("Spelling & phonics fluency", "Spelling patterns"), "spelling");
    assert.equal(classifyDaytimeSubjectMode("Maths — Number fluency", "Place value"), "maths");
    assert.equal(classifyDaytimeSubjectMode("Topic — Science enquiry", "Scientific enquiry"), "science");
    assert.equal(classifyDaytimeSubjectMode("PE — Invasion games", "Teamwork"), "practical-pe");
  });

  it("guided reading fails without a passage", () => {
    const pack = normalizeDaytimeStagePack({
      subjectType: "guided-reading",
      title: "Warm-up",
      estimatedMinutes: 8,
      targetItems: 5,
      activities: [{ kind: "multiple-choice", estimatedMinutes: 8 }],
      questions: [
        {
          prompt: "According to the passage, what happens first?",
          answer: "A",
          explanation: "Because the text says so.",
          hints: ["Look back", "Find evidence"],
          breakdown: {
            simplerQuestion: "What happens first?",
            steps: ["Read again", "Choose"],
            keyWords: [{ word: "first", meaning: "at the beginning" }],
            startingPoint: "Read the first paragraph.",
          },
        },
      ],
    }, "guided-reading");
    assert.ok(pack);
    const issues = validateDaytimeStagePack({
      pack,
      mode: "guided-reading",
      stage: "warmup",
      targetMinutes: 8,
      lessonTitle: "Guided reading",
    });
    assert.ok(issues.some((issue) => issue.code === "missing_passage"));
  });

  it("guided reading passes with passage, vocabulary, and timed activities", () => {
    const passageText = Array.from({ length: 50 }, (_, i) => `word${i}`).join(" ");
    const pack = normalizeDaytimeStagePack({
      subjectType: "guided-reading",
      title: "Core",
      estimatedMinutes: 23,
      targetItems: 6,
      passage: {
        title: "The River Path",
        text: passageText,
        paragraphs: [passageText],
        wordCount: 50,
      },
      vocabulary: [{ word: "current", childFriendlyMeaning: "moving water" }],
      activities: [
        { kind: "read-passage", estimatedMinutes: 6 },
        { kind: "vocabulary", estimatedMinutes: 4 },
        { kind: "multiple-choice", estimatedMinutes: 8 },
        { kind: "reasoning", estimatedMinutes: 5 },
      ],
      questions: [
        {
          prompt: "According to the passage, what does the river path show?",
          answer: "Moving water near the bank",
          explanation: "The passage describes the current near the bank.",
          hints: ["Find the river sentence", "Look for current"],
          breakdown: {
            simplerQuestion: "What is near the bank?",
            steps: ["Find river", "Read carefully"],
            keyWords: [{ word: "bank", meaning: "side of a river" }],
            startingPoint: "Scan for the word river.",
          },
        },
      ],
    }, "guided-reading");
    assert.ok(pack);
    const issues = validateDaytimeStagePack({
      pack,
      mode: "guided-reading",
      stage: "core",
      targetMinutes: 23,
      lessonTitle: "Guided reading",
    });
    assert.deepEqual(issues, []);
    const json = serializeDaytimeStageContentJson(pack);
    assert.ok(json.includes("The River Path"));
    assert.ok(!studentFacingTextLeaksInternalIds(json));
  });

  it("fails when internal IDs leak into pupil text", () => {
    const leak = studentFacingTextLeaksInternalIds(JSON.stringify({
      questions: [{
        prompt: "What should you do in the warmup-cmrxh6v9y00gzskmshbrosom6 stage?",
        answer: "Read",
      }],
    }));
    assert.equal(leak, true);
  });

  it("spelling core requires activity variety and target words", () => {
    const pack = normalizeDaytimeStagePack({
      subjectType: "spelling",
      title: "Core",
      estimatedMinutes: 23,
      targetItems: 8,
      spellingFocus: "double consonants",
      ruleExplanation: "Double the consonant before adding -ing when the vowel is short.",
      targetWords: ["running", "swimming", "dropping", "stopping", "hopping"],
      activities: [
        { kind: "teacher-explanation", estimatedMinutes: 3 },
        { kind: "fluency", estimatedMinutes: 3 },
        { kind: "word-sort", estimatedMinutes: 5 },
        { kind: "short-answer", estimatedMinutes: 5 },
        { kind: "proofreading", estimatedMinutes: 4 },
        { kind: "dictation", estimatedMinutes: 3 },
      ],
      questions: [
        {
          prompt: "Sort the word running into the double-consonant group.",
          answer: "running",
          explanation: "run + n + ing",
          hints: ["Say the sounds", "Check the short vowel"],
        },
      ],
    }, "spelling");
    assert.ok(pack);
    const issues = validateDaytimeStagePack({
      pack,
      mode: "spelling",
      stage: "core",
      targetMinutes: 23,
      lessonTitle: "Spelling",
    });
    assert.deepEqual(issues, []);
    assert.equal(activitiesSupportTargetMinutes(pack.activities, 23), true);
  });

  it("maths core requires explanation and worked example", () => {
    const pack = normalizeDaytimeStagePack({
      subjectType: "maths",
      title: "Core",
      estimatedMinutes: 23,
      targetItems: 6,
      explanation: "Place value means tens and ones.",
      workedExamples: [{ question: "How many tens in 40?", steps: ["4 tens"], answer: "4" }],
      activities: [
        { kind: "teacher-explanation", estimatedMinutes: 4 },
        { kind: "worked-example", estimatedMinutes: 4 },
        { kind: "scaffold", estimatedMinutes: 8 },
        { kind: "reasoning", estimatedMinutes: 5 },
        { kind: "challenge", estimatedMinutes: 2 },
      ],
      questions: [
        {
          prompt: "Explain why 36 has 3 tens. How do you know?",
          answer: "Because 30 is 3 tens",
          explanation: "Tens are groups of ten.",
          hints: ["Count tens", "Look at the tens digit"],
        },
      ],
    }, "maths");
    assert.ok(pack);
    const issues = validateDaytimeStagePack({
      pack,
      mode: "maths",
      stage: "core",
      targetMinutes: 23,
      lessonTitle: "Maths",
    });
    assert.deepEqual(issues, []);
  });

  it("science rejects generic placeholder questions", () => {
    const pack = normalizeDaytimeStagePack({
      subjectType: "science",
      title: "Warm-up",
      estimatedMinutes: 8,
      targetItems: 4,
      explanation: "Enquiry means asking questions and testing carefully.",
      vocabulary: [{ word: "variable", childFriendlyMeaning: "something you change" }],
      activities: [{ kind: "multiple-choice", estimatedMinutes: 8 }],
      questions: [
        {
          prompt: "According to the passage, what does reading fluency include?",
          answer: "x",
          explanation: "y",
          hints: ["a", "b"],
        },
        {
          prompt: "Which skill focus does this lesson practise, according to the passage?",
          answer: "x",
          explanation: "y",
          hints: ["a", "b"],
        },
      ],
    }, "science");
    assert.ok(pack);
    const issues = validateDaytimeStagePack({
      pack,
      mode: "science",
      stage: "warmup",
      targetMinutes: 8,
      lessonTitle: "Science",
    });
    assert.ok(issues.some((issue) => issue.code === "generic_science_questions"));
  });

  it("PE fails when framed as passage comprehension", () => {
    const pack = normalizeDaytimeStagePack({
      subjectType: "practical-pe",
      title: "Warm-up",
      estimatedMinutes: 8,
      targetItems: 3,
      activities: [{ kind: "multiple-choice", estimatedMinutes: 8 }],
      questions: [
        {
          prompt: "According to the PE passage, what should you do?",
          answer: "run",
          explanation: "x",
          hints: ["a", "b"],
        },
      ],
    }, "practical-pe");
    assert.ok(pack);
    const issues = validateDaytimeStagePack({
      pack,
      mode: "practical-pe",
      stage: "warmup",
      targetMinutes: 8,
      lessonTitle: "PE",
    });
    assert.ok(issues.some((issue) => issue.code === "pe_as_reading" || issue.code === "not_practical"));
  });
});

describe("question help", () => {
  it("first help step does not reveal the answer", () => {
    const help = extractHelpFromQuestionItem({
      answer: "SECRET_ANSWER",
      explanation: "The full answer is SECRET_ANSWER because of evidence.",
      hints: ["Look at the first sentence", "Find the key word", "Nearly there"],
      breakdown: {
        simplerQuestion: "What does the first sentence tell you?",
        steps: ["Read the first sentence", "Underline the clue"],
        keyWords: [{ word: "clue", meaning: "a helpful hint" }],
        startingPoint: "Start with the first sentence.",
      },
    });
    const steps = buildStoredQuestionHelpSteps(help);
    assert.ok(steps.length >= 2);
    assert.equal(steps[0].revealsAnswer, false);
    assert.ok(!steps[0].body.includes("SECRET_ANSWER"));
    assert.ok(steps[0].body.includes("simpler") || steps[0].body.includes("first sentence") || steps[0].body.includes("Start"));
  });
});

describe("lesson health subject awareness", () => {
  it("marks missing guided-reading passage as machine fail", () => {
    const health = evaluateDaytimeLessonHealth({
      startsAt: "09:00",
      endsAt: "09:50",
      subject: "English — Guided reading",
      skillFocus: "Reading inference",
      stages: [
        {
          id: "1",
          contentType: "reading",
          skillFocus: "Reading inference",
          contentJson: JSON.stringify({
            subjectType: "guided-reading",
            title: "Warm-up",
            estimatedMinutes: 8,
            targetItems: 5,
            activities: [{ kind: "multiple-choice", estimatedMinutes: 8 }],
            questions: [
              {
                prompt: "According to the passage, what happens?",
                answer: "A",
                explanation: "Because",
                hints: ["a", "b"],
              },
              { prompt: "Q2", answer: "B", explanation: "Because", hints: ["a", "b"] },
              { prompt: "Q3", answer: "C", explanation: "Because", hints: ["a", "b"] },
            ],
          }),
          metadataJson: JSON.stringify({
            daytimeSession: { stage: "warmup", stageIndex: 0, estimatedMinutes: 8 },
          }),
          blackBoxPassed: true,
        },
        {
          id: "2",
          contentType: "reading",
          skillFocus: "Reading inference",
          contentJson: JSON.stringify({
            subjectType: "guided-reading",
            title: "Core",
            estimatedMinutes: 23,
            targetItems: 5,
            activities: [
              { kind: "read-passage", estimatedMinutes: 6 },
              { kind: "multiple-choice", estimatedMinutes: 10 },
              { kind: "reasoning", estimatedMinutes: 7 },
            ],
            questions: [
              { prompt: "Q1", answer: "A", explanation: "Because", hints: ["a", "b"] },
              { prompt: "Q2", answer: "B", explanation: "Because", hints: ["a", "b"] },
              { prompt: "Q3", answer: "C", explanation: "Because", hints: ["a", "b"] },
            ],
          }),
          metadataJson: JSON.stringify({
            daytimeSession: { stage: "core", stageIndex: 1, estimatedMinutes: 23 },
          }),
          blackBoxPassed: true,
        },
      ],
    });
    assert.equal(health.overall, "FAIL");
    assert.ok(health.checks.some((check) => !check.passed && /passage|structure|completeness|answers/i.test(`${check.label} ${check.detail ?? ""}`)));
  });
});
