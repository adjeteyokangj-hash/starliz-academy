import test from "node:test";
import assert from "node:assert/strict";
import type { Subject } from "../src/lib/curriculum";
import type { LinkedQaItem, LessonPackStructuredModel } from "../src/lib/lesson-pack-import/types";
import { ACADEMIC_VALIDATION_VERSION, validateImportedLesson, validationUpdateAvailable } from "../src/lib/lesson-pack-import/academic-validation";

function activity(prompt: string, extra: Partial<LinkedQaItem> = {}): LinkedQaItem {
  return { id: `q-${Math.random()}`, prompt, answer: "A valid answer", sourceComponent: "worksheet", ...extra };
}

function model(subject: Subject, item: LinkedQaItem): LessonPackStructuredModel {
  return {
    title: "A valid curriculum lesson", subject, yearGroup: "Year 7", keyStage: "KS3", curriculumArea: "Core knowledge",
    learningObjective: "To apply subject knowledge accurately.", lessonOutcome: null, keywords: [], priorKnowledge: [], teachingExplanations: [], workedExamples: [], guidedPractice: [], independentPractice: [], reflectionTasks: [],
    starterQuestions: [item], starterAnswers: [], worksheetTasks: [], worksheetAnswers: [], exitQuestions: [], exitAnswers: [], misconceptions: [], teacherNotes: [],
    sourceMetadata: { providerHints: [] }, licenceMetadata: {},
  };
}

function validate(subject: Subject, item: LinkedQaItem, overrides: Partial<Parameters<typeof validateImportedLesson>[0]> = {}) {
  const base = model(subject, item);
  return validateImportedLesson({ model: base, subject, sessionType: "general_library", difficulty: 3, estimatedDurationMinutes: 45, duplicatePassed: true, licencePassed: true, thirdPartyPassed: true, ...overrides });
}

test("English comprehension with passage passes and missing passage blocks", () => {
  assert.equal(validate("english-language", activity("What does the writer suggest in paragraph 2?", { supportingContext: "Paragraph 2: The storm gathered above the harbour." })).readiness, "ready");
  assert.ok(validate("english-language", activity("What does the writer suggest in paragraph 2?")).issues.some((i) => i.code === "missing_passage"));
});

test("English extended response uses guided review", () => {
  const item = activity("Explain how does the writer create tension in the extract.", { supportingContext: "The door shook in its frame.", successCriteria: "Select evidence and explain its effect." });
  const result = validate("english-language", item);
  assert.equal(item.markingMode, "guided_review");
  assert.equal(result.readiness, "ready");
});

test("Science dependencies and calculation units are enforced", () => {
  assert.ok(validate("gcse-physics", activity("Use the graph to answer the question.")).issues.some((i) => i.code === "missing_graph"));
  assert.ok(validate("gcse-physics", activity("Calculate the force using the formula and values shown.")).issues.some((i) => i.code === "science_units_missing"));
  assert.ok(validate("science", activity("Plan an experiment method using the apparatus.")).issues.some((i) => i.code === "missing_practical_setup"));
});

test("History source and Geography map dependencies block when incomplete", () => {
  assert.ok(validate("gcse-history", activity("What can you infer from Source A?")).issues.some((i) => i.code === "missing_source_extract"));
  assert.ok(validate("gcse-geography", activity("Use the map to identify the location.", { visualModel: { labels: ["London"] } })).issues.some((i) => i.code === "missing_map"));
});

test("Computing preserves structured indentation and blocks flattened code", () => {
  assert.equal(validate("gcse-computer-science", activity("Debug this code and give the expected output.", { supportingContext: "```python\nif ready:\n    print('go')\n```" })).readiness, "ready");
  assert.ok(validate("gcse-computer-science", activity("Debug this code and give the expected output.", { supportingContext: "if ready print go" })).issues.some((i) => i.code === "missing_code"));
});

test("French accents survive and listening without audio blocks", () => {
  const written = activity("Traduisez: Où habitez-vous?", { answer: "Where do you live?" });
  assert.equal(validate("gcse-french", written).readiness, "ready");
  assert.equal(written.prompt, "Traduisez: Où habitez-vous?");
  assert.ok(validate("gcse-french", activity("Listen and answer: qu'est-ce que tu entends?")).issues.some((i) => i.code === "missing_audio"));
});

test("RE evaluation is guided review and Art, Music and PE dependencies apply", () => {
  const re = activity("Evaluate the view that this belief is important.", { successCriteria: "Give balanced viewpoints, evidence and a justified conclusion." });
  assert.equal(validate("gcse-religious-studies", re).readiness, "ready");
  assert.equal(re.markingMode, "guided_review");
  assert.ok(validate("gcse-art-and-design", activity("Analyse this painting.")).issues.some((i) => i.code === "missing_image"));
  assert.ok(validate("gcse-music", activity("Listen to the musical extract.")).issues.some((i) => i.code === "missing_audio"));
  assert.ok(validate("gcse-physical-education", activity("Perform this drill activity.")).issues.some((i) => i.code === "missing_practical_setup"));
});

test("global corruption, answer-sheet and duplicate gates apply to every subject", () => {
  for (const subject of ["english-language", "gcse-history", "gcse-computer-science"] as Subject[]) {
    assert.ok(validate(subject, activity("Answer sheet: Ã¢ corrupted")).issues.some((i) => i.code === "corrupted_text"));
    assert.ok(validate(subject, activity("Answer sheet: copy this response")).issues.some((i) => i.code === "answer_sheet_as_question"));
    assert.ok(validate(subject, activity("A normal valid activity"), { duplicatePassed: false }).issues.some((i) => i.code === "duplicate_gate"));
  }
});

test("older imported metadata advertises revalidation", () => {
  assert.equal(validationUpdateAvailable({ academicValidationVersion: "0.9.0" }), true);
  assert.equal(validationUpdateAvailable({ academicValidationVersion: ACADEMIC_VALIDATION_VERSION }), false);
});
