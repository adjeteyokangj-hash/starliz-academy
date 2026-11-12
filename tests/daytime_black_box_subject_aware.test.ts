import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  normalizeDaytimeActivityKind,
  questionKindRequiresFixedAnswer,
} from "../src/lib/schools/daytime-activity-kind";
import {
  hasPassedDaytimeMachineBlackBox,
  prepareDaytimeBlackBoxItems,
  runDaytimeSubjectBlackBox,
} from "../src/lib/schools/daytime-black-box";
import {
  normalizeDaytimeStagePack,
  validateDaytimeStagePack,
} from "../src/lib/schools/daytime-stage-validators";
import { repairHintForIssues } from "../src/lib/schools/daytime-ai-stage-generator";
import { evaluateDaytimeLessonHealth } from "../src/lib/schools/daytime-lesson-health";

describe("activity kind normalization", () => {
  it("maps known aliases", () => {
    assert.equal(normalizeDaytimeActivityKind("vocabulary preview").ok && normalizeDaytimeActivityKind("vocabulary preview").kind, "vocabulary");
    assert.equal(normalizeDaytimeActivityKind("guided explanation").ok && normalizeDaytimeActivityKind("guided explanation").kind, "teacher-explanation");
    assert.equal(normalizeDaytimeActivityKind("practice questions").ok && normalizeDaytimeActivityKind("practice questions").kind, "short-answer");
    assert.equal(normalizeDaytimeActivityKind("movement drill").ok && normalizeDaytimeActivityKind("movement drill").kind, "practical");
    assert.equal(normalizeDaytimeActivityKind("group game").ok && normalizeDaytimeActivityKind("group game").kind, "practical");
    assert.equal(normalizeDaytimeActivityKind("think and explain").ok && normalizeDaytimeActivityKind("think and explain").kind, "reasoning");
    assert.equal(normalizeDaytimeActivityKind("fluency/vocabulary").ok && normalizeDaytimeActivityKind("fluency/vocabulary").kind, "fluency");
  });

  it("rejects unknown kinds safely", () => {
    const result = normalizeDaytimeActivityKind("quantum teleportation ritual");
    assert.equal(result.ok, false);
  });

  it("does not require fixed answers for open kinds", () => {
    assert.equal(questionKindRequiresFixedAnswer("reflection"), false);
    assert.equal(questionKindRequiresFixedAnswer("practical"), false);
    assert.equal(questionKindRequiresFixedAnswer("dictation"), false);
    assert.equal(questionKindRequiresFixedAnswer("multiple-choice"), true);
    assert.equal(questionKindRequiresFixedAnswer("short-answer"), true);
  });
});

describe("daytime subject-aware black box", () => {
  const passageText = [
    "In a quiet harbour by the sea, fishing boats rested beside the wooden pier.",
    "Lily walked carefully along the path and watched the calm water sparkle in the morning light.",
    "She noticed a rusty key half buried in the sand near the harbour wall.",
    "The air smelled of salt and seaweed, and seagulls called above the quiet harbour.",
    "Lily wondered what adventure the key might unlock beyond the boats and the pier.",
  ].join(" ");

  function guidedReadingJson() {
    return JSON.stringify({
      subjectType: "guided-reading",
      title: "Core",
      estimatedMinutes: 23,
      targetItems: 4,
      passage: {
        title: "The Quiet Harbour",
        text: passageText,
        paragraphs: [passageText],
        wordCount: passageText.split(/\s+/).length,
      },
      vocabulary: [{ word: "harbour", childFriendlyMeaning: "a safe place for boats" }],
      activities: [
        { kind: "vocabulary preview", estimatedMinutes: 4 },
        { kind: "reading comprehension", estimatedMinutes: 12 },
        { kind: "discussion", estimatedMinutes: 7 },
      ],
      questions: [
        {
          prompt: "According to the passage, what rested beside the wooden pier?",
          answer: "Fishing boats rested beside the wooden pier",
          explanation: "The first sentence says fishing boats rested beside the wooden pier in the harbour.",
          hints: ["Find the pier", "Look at the first sentence"],
          kind: "short-answer",
        },
        {
          prompt: "Why might the author mention the quiet harbour?",
          answer: "To show the calm mood near the boats and water",
          explanation: "The harbour is described as quiet and the water is calm.",
          hints: ["Think about mood", "Look for calm words"],
          kind: "reasoning",
        },
      ],
    });
  }

  it("recognizes structured guided-reading answers and flattens passage objects", () => {
    const prep = prepareDaytimeBlackBoxItems({
      contentJson: guidedReadingJson(),
      mode: "guided-reading",
      contentType: "reading",
      metadata: { yearGroup: "Year 6", keyStage: "KS2", skillFocus: "Reading inference" },
    });
    assert.ok(prep.items.length >= 2);
    assert.equal(typeof prep.items[0].passage, "string");
    assert.ok(String(prep.items[0].passage).includes("harbour"));
    assert.equal(prep.questionType, "reading response");

    const result = runDaytimeSubjectBlackBox({
      contentJson: guidedReadingJson(),
      mode: "guided-reading",
      contentType: "reading",
      level: 3,
      topic: "English — Guided reading · Core",
      skillFocus: "Reading inference",
      metadataJson: JSON.stringify({
        subject: "reading",
        yearGroup: "Year 6",
        keyStage: "KS2",
        difficulty: 3,
      }),
    });
    assert.notEqual(result.decision, "REJECT");
  });

  it("does not fail open reflection for missing fixed answers", () => {
    const pack = normalizeDaytimeStagePack({
      subjectType: "spelling",
      title: "Warm-up",
      estimatedMinutes: 8,
      targetItems: 3,
      spellingFocus: "ai pattern",
      ruleExplanation: "ai often makes a long a sound",
      targetWords: ["rain", "train", "pain", "plain"],
      activities: [
        { kind: "teacher-explanation", estimatedMinutes: 2 },
        { kind: "dictation", estimatedMinutes: 3 },
        { kind: "reflection", estimatedMinutes: 3 },
      ],
      questions: [
        {
          prompt: "Spell rain",
          answer: "rain",
          explanation: "r-ai-n",
          hints: ["Say the sounds", "Write ai"],
          kind: "short-answer",
        },
        {
          prompt: "How did the ai pattern feel when you said the words?",
          answer: "",
          explanation: "Open reflection",
          hints: ["Think about the sound"],
          kind: "reflection",
        },
        {
          prompt: "Teacher reads: Write the word train.",
          answer: "",
          explanation: "Dictation aloud",
          hints: ["Listen carefully"],
          kind: "dictation",
        },
      ],
    }, "spelling");
    assert.ok(pack);
    const issues = validateDaytimeStagePack({
      pack,
      mode: "spelling",
      stage: "warmup",
      targetMinutes: 8,
      lessonTitle: "Spelling",
    });
    assert.equal(issues.filter((i) => i.code === "missing_answer").length, 0);
  });

  it("still fails when a closed answer is truly missing", () => {
    const pack = normalizeDaytimeStagePack({
      subjectType: "spelling",
      title: "Warm-up",
      estimatedMinutes: 8,
      targetItems: 2,
      spellingFocus: "ai",
      targetWords: ["rain", "train", "pain", "plain"],
      activities: [{ kind: "short-answer", estimatedMinutes: 8 }],
      questions: [
        {
          prompt: "Spell rain",
          answer: "",
          explanation: "needed",
          hints: ["a", "b"],
          kind: "short-answer",
        },
      ],
    }, "spelling");
    assert.ok(pack);
    const issues = validateDaytimeStagePack({
      pack,
      mode: "spelling",
      stage: "warmup",
      targetMinutes: 8,
      lessonTitle: "Spelling",
    });
    assert.ok(issues.some((i) => i.code === "missing_answer"));
  });

  it("does not apply reading-age passage rejection to PE practical packs", () => {
    const contentJson = JSON.stringify({
      subjectType: "practical-pe",
      title: "PE core",
      estimatedMinutes: 23,
      explanation: "Use a safe space, freeze on the whistle, and keep teacher supervision. Warm-up then cool-down stretches.",
      activities: [
        { kind: "teacher-explanation", estimatedMinutes: 3, title: "Safety brief" },
        { kind: "practical", estimatedMinutes: 6, title: "Skill practice" },
        { kind: "practical", estimatedMinutes: 8, title: "Team game" },
        { kind: "practical", estimatedMinutes: 4, title: "Cool-down" },
        { kind: "reflection", estimatedMinutes: 2 },
      ],
      questions: [
        {
          prompt: "What do you do when you hear the stop signal?",
          answer: "Freeze and listen to the teacher",
          explanation: "Stopping quickly keeps everyone safe.",
          hints: ["Think about freeze", "Listen for the whistle"],
          kind: "short-answer",
        },
        {
          prompt: "How did your team share the ball?",
          answer: "",
          explanation: "Open reflection",
          hints: ["Talk about teamwork"],
          kind: "reflection",
        },
      ],
    });
    const result = runDaytimeSubjectBlackBox({
      contentJson,
      mode: "practical-pe",
      contentType: "lesson",
      level: 3,
      topic: "PE — Invasion games · Core",
      skillFocus: "Teamwork",
      metadataJson: JSON.stringify({
        subject: "lesson",
        yearGroup: "Year 6",
        keyStage: "KS2",
        difficulty: 3,
      }),
    });
    assert.notEqual(result.decision, "REJECT");
    assert.ok(!result.reasons.some((r) => /poor_passage_quality_too_short|reading_missing_passage/i.test(r)));
  });

  it("still rejects unsafe PE content", () => {
    const contentJson = JSON.stringify({
      subjectType: "practical-pe",
      title: "PE",
      estimatedMinutes: 8,
      explanation: "Pupils tackle hard with full-contact crashes into each other without supervision.",
      activities: [
        { kind: "practical", estimatedMinutes: 4 },
        { kind: "practical", estimatedMinutes: 4 },
      ],
      questions: [
        {
          prompt: "What should you do?",
          answer: "Tackle hard",
          explanation: "Win the ball",
          hints: ["a", "b"],
        },
      ],
    });
    const result = runDaytimeSubjectBlackBox({
      contentJson,
      mode: "practical-pe",
      contentType: "lesson",
      level: 3,
      topic: "PE",
      skillFocus: "Teamwork",
      metadataJson: JSON.stringify({ yearGroup: "Year 6", keyStage: "KS2", difficulty: 3 }),
    });
    assert.equal(result.decision, "REJECT");
    assert.ok(result.peSafetyIssues.length > 0);
  });

  it("treats daytime live BB pass without admin verification as machine pass", () => {
    assert.equal(
      hasPassedDaytimeMachineBlackBox({
        blackBoxLiveTest: { status: "passed" },
        blackBoxAdminVerification: { status: "pending" },
      }),
      true,
    );
    assert.equal(
      hasPassedDaytimeMachineBlackBox({
        blackBoxLiveTest: { status: "failed" },
      }),
      false,
    );
  });
});

describe("maths reasoning generation contract", () => {
  it("fails core without reasoning and passes with reasoning activity", () => {
    const base = {
      subjectType: "maths",
      title: "Core",
      estimatedMinutes: 23,
      explanation: "Fractions are equal parts of a whole.",
      workedExamples: [{ question: "What is 1/2 of 8?", steps: ["Half of 8 is 4"], answer: "4" }],
      activities: [
        { kind: "teacher-explanation", estimatedMinutes: 4 },
        { kind: "worked-example", estimatedMinutes: 4 },
        { kind: "scaffold", estimatedMinutes: 7 },
        { kind: "independent", estimatedMinutes: 8 },
      ],
      questions: [
        {
          prompt: "What is 1/2 of 10?",
          answer: "5",
          explanation: "Half of 10 is 5",
          hints: ["Halve it", "Think of equal parts"],
        },
      ],
    };
    const missing = normalizeDaytimeStagePack(base, "maths");
    assert.ok(missing);
    assert.ok(validateDaytimeStagePack({
      pack: missing,
      mode: "maths",
      stage: "core",
      targetMinutes: 23,
      lessonTitle: "Maths",
    }).some((i) => i.code === "missing_reasoning"));

    const withReasoning = normalizeDaytimeStagePack({
      ...base,
      activities: [
        ...base.activities,
        { kind: "reasoning", estimatedMinutes: 5 },
      ],
      questions: [
        ...base.questions,
        {
          prompt: "Explain why 1/2 of 10 is 5. How do you know?",
          answer: "Because 10 split into 2 equal groups is 5",
          explanation: "Equal sharing",
          hints: ["Split into two", "Check both parts"],
          kind: "reasoning",
        },
      ],
    }, "maths");
    assert.ok(withReasoning);
    assert.deepEqual(validateDaytimeStagePack({
      pack: withReasoning,
      mode: "maths",
      stage: "core",
      targetMinutes: 23,
      lessonTitle: "Maths",
    }), []);
  });

  it("repair hint mentions missing reasoning", () => {
    const hint = repairHintForIssues(["missing_reasoning: Core Maths needs reasoning or word-problem work."]);
    assert.match(hint, /reasoning activity/i);
    assert.match(hint, /word problem|justify|explain/i);
  });
});

describe("science generation contract", () => {
  it("requires explanation and vocabulary", () => {
    const pack = normalizeDaytimeStagePack({
      subjectType: "science",
      title: "Warm-up",
      estimatedMinutes: 8,
      activities: [{ kind: "short-answer", estimatedMinutes: 8 }],
      questions: [
        {
          prompt: "What is a force?",
          answer: "A push or pull",
          explanation: "Forces change movement",
          hints: ["Push", "Pull"],
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
    assert.ok(issues.some((i) => i.code === "missing_science_explanation"));
    assert.ok(issues.some((i) => i.code === "missing_science_vocab"));
  });

  it("accepts keyVocabulary alias and valid topic-specific science", () => {
    const pack = normalizeDaytimeStagePack({
      subjectType: "science",
      title: "Core",
      topic: "Forces",
      learningObjective: "Identify pushes and pulls",
      explanation: "A force is a push or a pull that can change how something moves.",
      keyVocabulary: [
        { word: "force", meaning: "a push or pull" },
        { word: "friction", meaning: "a force that slows things down" },
        { word: "gravity", meaning: "the force that pulls things towards Earth" },
      ],
      activities: [
        { kind: "teacher-explanation", estimatedMinutes: 5 },
        { kind: "prediction", estimatedMinutes: 8 },
        { kind: "practical", estimatedMinutes: 10 },
      ],
      questions: [
        {
          prompt: "Predict what happens when you push a toy car on carpet versus tile.",
          answer: "It travels less far on carpet because of friction",
          explanation: "Friction resists movement",
          hints: ["Compare surfaces", "Think about friction"],
        },
      ],
    }, "science");
    assert.ok(pack);
    assert.equal(pack.vocabulary?.length, 3);
    assert.deepEqual(validateDaytimeStagePack({
      pack,
      mode: "science",
      stage: "core",
      targetMinutes: 23,
      lessonTitle: "Science",
    }), []);
  });

  it("repair hint mentions missing science fields", () => {
    const hint = repairHintForIssues([
      "missing_science_explanation: Science needs a topic explanation.",
      "missing_science_vocab: Science needs key vocabulary.",
    ]);
    assert.match(hint, /explanation/i);
    assert.match(hint, /vocabulary/i);
  });

  it("fails generic placeholder science", () => {
    const pack = normalizeDaytimeStagePack({
      subjectType: "science",
      title: "Core",
      explanation: "Science is about enquiry.",
      vocabulary: [
        { word: "enquiry", childFriendlyMeaning: "asking questions" },
        { word: "evidence", childFriendlyMeaning: "proof" },
        { word: "observe", childFriendlyMeaning: "look carefully" },
      ],
      activities: [{ kind: "short-answer", estimatedMinutes: 23 }],
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
    assert.ok(validateDaytimeStagePack({
      pack,
      mode: "science",
      stage: "core",
      targetMinutes: 23,
      lessonTitle: "Science",
    }).some((i) => i.code === "generic_science_questions"));
  });
});

describe("lesson health uses daytime machine BB gate", () => {
  it("passes when live BB passed even if admin verification is pending", () => {
    const passage = [
      "In a quiet harbour by the sea, fishing boats rested beside the wooden pier.",
      "Lily walked carefully along the path and watched the calm water sparkle in the morning light.",
      "She noticed a rusty key half buried in the sand near the harbour wall.",
      "The air smelled of salt and seaweed, and seagulls called above the quiet harbour.",
    ].join(" ");
    function stageJson(title: string, minutes: number) {
      return JSON.stringify({
        subjectType: "guided-reading",
        title,
        estimatedMinutes: minutes,
        targetItems: 4,
        passage: { title: "Harbour", text: passage, paragraphs: [passage], wordCount: passage.split(/\s+/).length },
        vocabulary: [{ word: "harbour", childFriendlyMeaning: "safe place for boats" }],
        activities: [
          { kind: "vocabulary", estimatedMinutes: Math.max(2, Math.round(minutes * 0.25)) },
          { kind: "prediction", estimatedMinutes: Math.max(2, Math.round(minutes * 0.25)) },
          { kind: "short-answer", estimatedMinutes: Math.max(3, Math.round(minutes * 0.5)) },
        ],
        questions: [
          {
            prompt: "According to the passage, what rested beside the pier?",
            answer: "Fishing boats rested beside the wooden pier",
            explanation: "The text mentions boats by the pier",
            hints: ["Find pier", "Read again"],
          },
          { prompt: "What detail supports calm?", answer: "Quiet harbour and calm water", explanation: "Mood", hints: ["a", "b"] },
          { prompt: "Which word means safe place for boats?", answer: "harbour", explanation: "Vocab", hints: ["a", "b"] },
        ],
      });
    }
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
          contentJson: stageJson("Warm-up", 8),
          metadataJson: JSON.stringify({
            daytimeSession: { stage: "warmup", stageIndex: 0, estimatedMinutes: 8 },
            blackBoxLiveTest: { status: "passed", reasons: [] },
            blackBoxAdminVerification: { status: "pending" },
          }),
          blackBoxPassed: true,
        },
        {
          id: "2",
          contentType: "reading",
          skillFocus: "Reading inference",
          contentJson: stageJson("Core", 23),
          metadataJson: JSON.stringify({
            daytimeSession: { stage: "core", stageIndex: 1, estimatedMinutes: 23 },
            blackBoxLiveTest: { status: "passed" },
            blackBoxAdminVerification: { status: "pending" },
          }),
          blackBoxPassed: true,
        },
        {
          id: "3",
          contentType: "reading",
          skillFocus: "Reading inference",
          contentJson: stageJson("Stretch", 11),
          metadataJson: JSON.stringify({
            daytimeSession: { stage: "stretch", stageIndex: 2, estimatedMinutes: 11 },
            blackBoxLiveTest: { status: "passed" },
            blackBoxAdminVerification: { status: "pending" },
          }),
          blackBoxPassed: true,
        },
      ],
    });
    assert.equal(health.overall, "PASS", health.reason ?? undefined);
  });
});
