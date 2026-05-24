import test from "node:test";
import assert from "node:assert/strict";

import {
  selectPlacementLessons,
  type PlacementAssignmentCandidate,
  type PlacementContentCandidate,
  type PlacementLevelInput,
} from "../src/lib/placement-lesson-selector";

type InputArgs = {
  selectedSubjects?: string[];
  placementLevels?: Record<string, PlacementLevelInput>;
  availableContent?: PlacementContentCandidate[];
  existingAssignments?: PlacementAssignmentCandidate[];
};

function buildSelectorInput(overrides: InputArgs = {}) {
  return {
    studentId: "student-1",
    selectedSubjects: overrides.selectedSubjects ?? ["english", "maths", "science"],
    placementLevels: overrides.placementLevels ?? {
      "english:reading": { accuracy: 74, level: "secure" },
      "english:spelling": { accuracy: 28, level: "below" },
      maths: { accuracy: 62, level: "secure" },
      science: { accuracy: 84, level: "advanced" },
    },
    availableContent: overrides.availableContent ?? [],
    existingAssignments: overrides.existingAssignments ?? [],
    yearGroup: "Year 5",
    keyStage: "KS2",
  };
}

function makeContent(overrides: Partial<PlacementContentCandidate> = {}): PlacementContentCandidate {
  return {
    id: "content-1",
    contentType: "reading",
    level: 4,
    status: "reviewed",
    topic: "Inference skills",
    skillFocus: "Reading comprehension",
    yearGroup: "Year 5",
    keyStage: "KS2",
    metadataJson: JSON.stringify({
      subject: "english-language",
      strand: "reading",
      generationType: "reading",
      yearGroup: "Year 5",
      keyStage: "KS2",
    }),
    ...overrides,
  };
}

test("returns content_needed with generator hint when no content exists", () => {
  const result = selectPlacementLessons(buildSelectorInput());

  assert.ok(result.recommendations.length > 0);
  assert.ok(result.recommendations.every((row) => row.status === "content_needed"));
  assert.ok(result.recommendations.every((row) => row.contentId === null && row.assignmentId === null && row.href === null));
  assert.ok(result.recommendations.every((row) => row.generatorHint !== null));
});

test("marks a recommendation as ready when reviewed content matches and is unassigned", () => {
  const result = selectPlacementLessons(buildSelectorInput({
    availableContent: [
      makeContent({ id: "eng-reading" }),
      makeContent({ id: "maths", contentType: "math", topic: "Fractions", skillFocus: "Maths" }),
      makeContent({ id: "science", contentType: "science", topic: "Forces", skillFocus: "Science" }),
      makeContent({
        id: "eng-spelling",
        contentType: "spelling",
        level: 2,
        topic: "Suffixes",
        skillFocus: "Spelling",
        metadataJson: JSON.stringify({ subject: "english-language", strand: "spelling" }),
      }),
    ],
  }));

  const reading = result.recommendations.find((row) => row.scopedSubject === "english:reading");
  assert.equal(reading?.status, "ready");
  assert.equal(reading?.assignmentId, null);
  assert.ok(typeof reading?.href === "string" && reading.href.length > 0);
});

test("marks recommendation as assigned when assignment already exists", () => {
  const result = selectPlacementLessons(buildSelectorInput({
    availableContent: [makeContent({ id: "eng-reading" })],
    existingAssignments: [{ id: "assignment-1", contentId: "eng-reading", status: "assigned", href: "/games/reading?assignmentId=assignment-1" }],
  }));

  const reading = result.recommendations.find((row) => row.scopedSubject === "english:reading");
  assert.equal(reading?.status, "assigned");
  assert.equal(reading?.assignmentId, "assignment-1");
});

test("marks recommendation as blocked when only generated/draft content exists", () => {
  const result = selectPlacementLessons(buildSelectorInput({
    availableContent: [makeContent({ id: "eng-reading", status: "generated" })],
  }));

  const reading = result.recommendations.find((row) => row.scopedSubject === "english:reading");
  assert.equal(reading?.status, "blocked");
  assert.ok((reading?.reason ?? "").toLowerCase().includes("review"));
});

test("groups english strands under english parent subject", () => {
  const result = selectPlacementLessons(buildSelectorInput({
    selectedSubjects: ["english"],
    placementLevels: {
      "english:reading": { accuracy: 74, level: "secure" },
      "english:spelling": { accuracy: 28, level: "below" },
      "english:grammar": { accuracy: 46, level: "below" },
    },
  }));

  const englishGroup = result.grouped.find((group) => group.parentSubject === "english");
  assert.ok(englishGroup);
  assert.ok((englishGroup?.recommendations.length ?? 0) >= 3);
});

test("does not treat reading/spelling as parent subjects when levels use shorthand keys", () => {
  const result = selectPlacementLessons(buildSelectorInput({
    selectedSubjects: ["english"],
    placementLevels: {
      reading: { accuracy: 70, level: "secure" },
      spelling: { accuracy: 20, level: "below" },
    },
  }));

  const hasReadingParent = result.grouped.some((group) => group.parentSubject === "reading");
  const hasSpellingParent = result.grouped.some((group) => group.parentSubject === "spelling");
  assert.equal(hasReadingParent, false);
  assert.equal(hasSpellingParent, false);
  assert.ok(result.grouped.some((group) => group.parentSubject === "english"));
});

test("maps placement bands to numeric levels and labels", () => {
  const result = selectPlacementLessons(buildSelectorInput({
    selectedSubjects: ["maths", "science"],
    placementLevels: {
      maths: { accuracy: 22, level: "below" },
      science: { accuracy: 61, level: "secure" },
    },
  }));

  const maths = result.recommendations.find((row) => row.scopedSubject === "maths");
  const science = result.recommendations.find((row) => row.scopedSubject === "science");
  assert.equal(maths?.level, 1);
  assert.equal(maths?.levelLabel, "Foundation");
  assert.equal(science?.level, 3);
  assert.equal(science?.levelLabel, "Expected");
});

test("prefers closer difficulty content when multiple matches exist", () => {
  const result = selectPlacementLessons(buildSelectorInput({
    selectedSubjects: ["maths"],
    placementLevels: { maths: { accuracy: 66, level: "secure" } },
    availableContent: [
      makeContent({ id: "math-easy", contentType: "math", level: 1, topic: "Counting", skillFocus: "Maths" }),
      makeContent({ id: "math-target", contentType: "math", level: 4, topic: "Fractions", skillFocus: "Maths" }),
      makeContent({ id: "math-hard", contentType: "math", level: 5, topic: "Algebra", skillFocus: "Maths" }),
    ],
  }));

  const maths = result.recommendations.find((row) => row.scopedSubject === "maths");
  assert.equal(maths?.contentId, "math-target");
});

test("filters content gaps list to content_needed recommendations", () => {
  const result = selectPlacementLessons(buildSelectorInput({
    selectedSubjects: ["maths", "science"],
    placementLevels: {
      maths: { accuracy: 66, level: "secure" },
      science: { accuracy: 82, level: "advanced" },
    },
    availableContent: [makeContent({ id: "math-content", contentType: "math", topic: "Fractions", skillFocus: "Maths" })],
  }));

  const science = result.recommendations.find((row) => row.scopedSubject === "science");
  assert.equal(science?.status, "content_needed");
  assert.equal(result.contentGaps.length, 1);
  assert.equal(result.contentGaps[0]?.scopedSubject, "science");
});

test("includes selected english strands even when levels are partial", () => {
  const result = selectPlacementLessons(buildSelectorInput({
    selectedSubjects: ["english"],
    placementLevels: {
      "english:reading": { accuracy: 74, level: "secure" },
      "english:spelling": { accuracy: 28, level: "below" },
    },
  }));

  const scoped = result.recommendations.map((row) => row.scopedSubject);
  assert.ok(scoped.includes("english:reading"));
  assert.ok(scoped.includes("english:spelling"));
});
