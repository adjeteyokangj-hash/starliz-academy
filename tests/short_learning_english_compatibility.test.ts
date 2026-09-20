import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { systemPromptForMode, userPromptForStage } from "../src/lib/schools/daytime-ai-stage-generator";

describe("short learning english content compatibility contracts", () => {
  it("stores playable metadataSubject separately from schoolSubject", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/lib/schools/short-learning-session-content.ts"),
      "utf8",
    );
    assert.match(src, /subject: playable\.metadataSubject/);
    assert.match(src, /schoolSubject: playable\.schoolSubject/);
    assert.match(src, /playability\.ok/);
    assert.match(src, /status: sessionStatus/);
    assert.match(src, /generatedOk \? "ready" : "failed"/);
    assert.match(src, /source: "published_journey"/);
    assert.match(src, /repairShortLearningContentCompatibility/);
  });

  it("excludes non-generative blocks from content generation", () => {
    const plan = readFileSync(
      resolve(process.cwd(), "src/lib/schools/short-learning-session-plan.ts"),
      "utf8",
    );
    assert.match(plan, /blueprint\(4, "break".*null/s);
    assert.match(plan, /tutor_support".*null/s);
    assert.match(plan, /progress_report".*null/s);
  });

  it("assignment safety uses shared playable compatibility helper", () => {
    const src = readFileSync(resolve(process.cwd(), "src/lib/assignments.ts"), "utf8");
    assert.match(src, /isPlayableSubjectContentTypeCompatible/);
  });

  it("keeps generating concurrency guard", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/lib/schools/short-learning-session-content.ts"),
      "utf8",
    );
    assert.match(src, /status === "generating"/);
    assert.match(src, /canStudentStartShortLearningSession/);
  });

  it("uses a year-appropriate skill when the booking has no real learning focus", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/lib/schools/short-learning-session-content.ts"),
      "utf8",
    );
    assert.match(src, /resolveShortLearningSkillFocus/);
    assert.match(src, /generateGuidedReadingSharedPassage/);
    assert.match(src, /sharedPassage/);
    assert.match(src, /difficulty: yearGroupToLevel\(input\.yearGroup\)/);
    assert.match(src, /shortLearningMinQuestionCount/);
  });

  it("keeps Short Learning grammar practice on the resolved skill", () => {
    const generator = readFileSync(
      resolve(process.cwd(), "src/lib/schools/daytime-ai-stage-generator.ts"),
      "utf8",
    );
    const depth = readFileSync(
      resolve(process.cwd(), "src/lib/schools/short-learning-instructional-depth.ts"),
      "utf8",
    );
    assert.match(generator, /englishSkillUsesPassageAsLanguageContext/);
    assert.match(generator, /do not switch into a generic reading-comprehension quiz/);
    assert.match(generator, /sl_skill_practice_mismatch/);
    assert.match(depth, /sl_skill_practice_mismatch/);
    assert.match(depth, /sl_model_not_from_passage/);

    const daySchool = systemPromptForMode("guided-reading", {
      skillFocus: "Relative clauses",
    });
    assert.match(daySchool, /Prefer a mix of: retrieval, inference/);

    const shortLearning = systemPromptForMode("guided-reading", {
      skillFocus: "Relative clauses",
      instructionalDepthProfile: "short-learning",
    });
    assert.match(shortLearning, /language\/grammar feature/);
    assert.doesNotMatch(shortLearning, /Prefer a mix of: retrieval, inference/);

    const inference = systemPromptForMode("guided-reading", {
      skillFocus: "Reading inference",
      instructionalDepthProfile: "short-learning",
    });
    assert.match(inference, /Prefer a mix of: retrieval, inference/);

    const user = userPromptForStage({
      mode: "guided-reading",
      stage: "core",
      stageLabel: "Lesson block 1 · New concept",
      lessonTitle: "english: Lesson block 1 · New concept",
      subject: "english",
      skillFocus: "Relative clauses",
      yearGroup: "Year 6",
      keyStage: "KS2",
      targetMinutes: 18,
      targetItems: 9,
      instructionalDepthProfile: "short-learning",
    });
    assert.match(user, /Skill-practice progression/);
    assert.match(user, /Do NOT switch into generic plot/);
    const generatorSrc = readFileSync(
      resolve(process.cwd(), "src/lib/schools/daytime-ai-stage-generator.ts"),
      "utf8",
    );
    const rotationSrc = readFileSync(
      resolve(process.cwd(), "src/lib/schools/short-learning-question-rotation.ts"),
      "utf8",
    );
    assert.match(generatorSrc, /ensureWorkedExampleFromPassage/);
    assert.match(rotationSrc, /selectRemixedQuestions/);
  });
});
