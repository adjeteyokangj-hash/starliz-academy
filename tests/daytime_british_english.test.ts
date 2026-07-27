import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DAYTIME_BRITISH_ENGLISH_RULES,
  systemPromptForMode,
  userPromptForStage,
} from "../src/lib/schools/daytime-ai-stage-generator";
import {
  findAmericanEnglishMarkers,
  normalizeDaytimeStagePack,
  validateDaytimeStagePack,
} from "../src/lib/schools/daytime-stage-validators";

describe("Daytime British English enforcement", () => {
  it("embeds British English rules in every subject-mode system prompt", () => {
    const modes = [
      "guided-reading",
      "spelling",
      "maths",
      "science",
      "practical-pe",
      "practical-arts",
      "practical-music",
      "computing",
      "humanities",
      "generic-lesson",
    ] as const;
    for (const mode of modes) {
      const prompt = systemPromptForMode(mode);
      assert.match(prompt, /British English/i);
      assert.match(prompt, /UK spelling/i);
      assert.match(prompt, /pounds \(£\) and pence/i);
      assert.match(prompt, /Do not use US spelling/i);
      assert.ok(prompt.includes(DAYTIME_BRITISH_ENGLISH_RULES));
    }
  });

  it("embeds British English rules in stage user prompts", () => {
    const user = userPromptForStage({
      mode: "maths",
      stage: "core",
      stageLabel: "Lesson block 1 · New concept",
      lessonTitle: "Maths: Place value",
      subject: "maths",
      skillFocus: "Place value",
      yearGroup: "Year 6",
      keyStage: "KS2",
      targetMinutes: 18,
      targetItems: 4,
    });
    assert.match(user, /British English/i);
    assert.match(user, /UK spelling/i);
    assert.match(user, /£/);
  });

  it("adds recap review guidance for maths Quick recap stages", () => {
    const user = userPromptForStage({
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
    assert.match(user, /Recap intent/i);
    assert.match(user, /workedExamples/i);
    assert.match(user, /Do NOT introduce a new topic/i);
  });

  it("encourages varied English comprehension stems", () => {
    const system = systemPromptForMode("guided-reading");
    assert.match(system, /retrieval/i);
    assert.match(system, /inference/i);
    assert.match(system, /author'?s intent|author purpose/i);
    assert.match(system, /summarising/i);
    assert.match(system, /evidence finding/i);
    assert.match(system, /main idea of the passage/i);
  });

  it("detects common US spellings expected to be British", () => {
    assert.deepEqual(findAmericanEnglishMarkers("The color of the bag"), ["color"]);
    assert.deepEqual(findAmericanEnglishMarkers("My favorite book"), ["favorite"]);
    assert.deepEqual(findAmericanEnglishMarkers("Please organize the cards"), ["organize"]);
    assert.deepEqual(findAmericanEnglishMarkers("Meet at the center"), ["center"]);
    assert.deepEqual(findAmericanEnglishMarkers("Analyze the graph"), ["analyze"]);
    assert.deepEqual(findAmericanEnglishMarkers("It costs $5"), ["dollar/$"]);
    assert.deepEqual(findAmericanEnglishMarkers("The colour of the bag"), []);
    assert.deepEqual(findAmericanEnglishMarkers("Analyse the graph at the centre"), []);
  });

  it("validator rejects US spelling in pupil-facing packs", () => {
    const pack = normalizeDaytimeStagePack(
      {
        subjectType: "maths",
        title: "Core",
        estimatedMinutes: 10,
        targetItems: 2,
        learningObjective: "Place value",
        explanation: "Look at the color of each digit place.",
        workedExamples: [{ question: "What is the value of 4?", steps: ["Look at place"], answer: "4000" }],
        activities: [
          { kind: "scaffold", estimatedMinutes: 4 },
          { kind: "reasoning", estimatedMinutes: 3 },
          { kind: "independent", estimatedMinutes: 3 },
        ],
        questions: [
          {
            prompt: "What is the value of 4 in 4,321?",
            answer: "4000",
            explanation: "Thousands place.",
            hints: ["Look at place value", "Thousands"],
            breakdown: {
              simplerQuestion: "Where is the 4?",
              steps: ["Find the digit", "Name the place"],
              keyWords: [{ word: "thousands", meaning: "groups of 1000" }],
              startingPoint: "Look at 4,321.",
            },
          },
        ],
      },
      "maths",
    );
    assert.ok(pack);
    const issues = validateDaytimeStagePack({
      pack,
      mode: "maths",
      stage: "core",
      targetMinutes: 10,
      lessonTitle: "Maths",
    });
    assert.ok(issues.some((issue) => issue.code === "american_english"));
  });
});
