import test from "node:test";
import assert from "node:assert/strict";

import { buildAcademicIntelligence } from "../src/lib/academic-intelligence/academicIntelligence";
import type { AcademicSourceData } from "../src/lib/academic-intelligence/types";

function source(overrides: Partial<AcademicSourceData> = {}): AcademicSourceData {
  const now = new Date().toISOString();
  return {
    studentId: "student-graph-1",
    studentName: "Ama",
    keyStage: "KS2",
    yearGroup: "Year 5",
    examBoard: null,
    assignments: [
      {
        id: "assign-1",
        status: "completed",
        subject: "math",
        topic: "Fractions",
        skill: "fractions",
        createdAt: now,
        updatedAt: now,
        completedAt: now,
      },
    ],
    attempts: [
      {
        id: "attempt-1",
        subject: "math",
        topic: "Fractions",
        skill: "fractions",
        correct: false,
        score: 40,
        hintsUsed: 2,
        createdAt: now,
      },
    ],
    weakAreas: [
      {
        id: "weak-1",
        subject: "math",
        topic: "Fractions",
        skill: "fractions",
        status: "active",
        weaknessType: "accuracy",
        accuracy: 40,
        attemptsCount: 4,
        lastDetectedAt: now,
        metadata: {
          prerequisiteTopics: ["Equivalent fractions"],
        },
      },
    ],
    studentSkills: [],
    coachUsage: [
      {
        id: "coach-1",
        subject: "math",
        topic: "Fractions",
        skill: "fractions",
        mode: "coach_hint",
        hintLevel: 2,
        createdAt: now,
      },
    ],
    dictionarySignals: [
      {
        word: "numerator",
        subject: "math",
        topic: "Fractions",
        skill: "fractions",
        difficult: true,
        weak: true,
      },
    ],
    progressRecords: [
      {
        id: "progress-1",
        subject: "math",
        topic: "Fractions",
        skill: "fractions",
        activityType: "lesson_check",
        activityName: "Fractions check",
        completed: true,
        correct: false,
        score: 45,
        accuracy: 45,
        createdAt: now,
      },
    ],
    assessmentHistory: [],
    generatedAt: now,
    ...overrides,
  };
}

test("curriculum intelligence graph is built from existing academic pipeline output", () => {
  const output = buildAcademicIntelligence(source());
  const graph = output.curriculumIntelligenceGraph;

  assert.equal(graph.version, "v1");
  assert.equal(graph.studentId, output.studentId);
  assert.ok(graph.nodes.length > 0);
  assert.ok(graph.edges.length > 0);
  assert.ok(graph.masteryOverlay.length > 0);
  assert.ok(graph.recommendationLayer.length > 0);
  assert.ok(graph.weakAreaTrace.length > 0);
});

test("graph centralizes mastery overlay and weak-area tracing", () => {
  const output = buildAcademicIntelligence(source());
  const graph = output.curriculumIntelligenceGraph;

  const mastery = graph.masteryOverlay.find((row) => row.topic?.toLowerCase() === "fractions");
  assert.ok(mastery);
  assert.equal(mastery?.weakAreaActive, true);

  const trace = graph.weakAreaTrace.find((row) => row.weakAreaId === "weak-1");
  assert.ok(trace);
  assert.ok((trace?.linkedTopicKeys.length ?? 0) >= 1);
  assert.ok((trace?.prerequisiteIds.length ?? 0) >= 1);
});

test("graph includes prerequisite and recommendation relationships", () => {
  const output = buildAcademicIntelligence(source());
  const graph = output.curriculumIntelligenceGraph;

  const prerequisiteNode = graph.nodes.find((node) => node.type === "prerequisite");
  assert.ok(prerequisiteNode);

  const requiresEdge = graph.edges.find((edge) => edge.type === "requires");
  assert.ok(requiresEdge);

  const recommendationNode = graph.nodes.find((node) => node.type === "recommendation");
  assert.ok(recommendationNode);

  const targetEdge = graph.edges.find((edge) => edge.type === "targets");
  assert.ok(targetEdge);
});
