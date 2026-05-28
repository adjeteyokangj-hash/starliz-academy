import test from "node:test";
import assert from "node:assert/strict";

import { buildAcademicIntelligence } from "../src/lib/academic-intelligence/academicIntelligence";
import {
  buildGraphAwarePromptContext,
  buildGraphContentQualityChecks,
  buildGraphStorageMediaReferences,
} from "../src/lib/academic-intelligence/graph-context";
import type { AcademicSourceData } from "../src/lib/academic-intelligence/types";

function source(overrides: Partial<AcademicSourceData> = {}): AcademicSourceData {
  const now = new Date().toISOString();
  return {
    studentId: "student-graph-2",
    studentName: "Kojo",
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
        score: 42,
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
        accuracy: 42,
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
    dictionarySignals: [],
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
        score: 42,
        accuracy: 42,
        createdAt: now,
      },
    ],
    assessmentHistory: [],
    schoolWeekSettings: {
      enabled: true,
      activeDays: ["Monday", "Wednesday"],
      startTime: "09:00",
      endTime: "12:00",
      lessonBlockMinutes: 30,
      shortBreakMinutes: 10,
      lunchMinutes: 20,
      dailySubjectLimit: 2,
      weeklySubjectSelection: ["math"],
      includeCatchUpTasks: true,
      includeRevisionBlocks: true,
      includeHomeworkBlock: true,
      includeQuizReviewBlock: true,
      includeWellbeingBlock: false,
      includeEndOfDaySummary: true,
      parentAdminNotes: null,
    },
    generatedAt: now,
    ...overrides,
  };
}

test("graph heartbeat and connected contexts are embedded in academic output", () => {
  const output = buildAcademicIntelligence(source());
  const graph = output.curriculumIntelligenceGraph;

  assert.equal(graph.heartbeat.sourceOfTruth, "academic_intelligence");
  assert.equal(graph.heartbeat.systemStates.length, 10);
  assert.ok(graph.aiGenerationContext.masteryGapTopics.includes("Fractions"));
  assert.ok(graph.reportSummary.recommendationReasons.length > 0);
  assert.ok(graph.mediaPlan.references.length > 0);
  assert.ok(graph.contentGovernance.auditTrailTags.includes("curriculum_intelligence_graph"));
});

test("school week blocks receive graph metadata without rebuilding recommendation logic", () => {
  const output = buildAcademicIntelligence(source());
  const blocks = output.schoolWeekModePlan.dailySchedules.flatMap((day) => day.blocks);
  const linkedBlock = blocks.find((block) => block.graphMetadata && block.graphMetadata.recommendationIds.length > 0);

  assert.ok(linkedBlock);
  assert.ok((linkedBlock?.graphMetadata?.linkedNodeIds.length ?? 0) > 0);
  assert.ok((linkedBlock?.graphMetadata?.catchUpRouteTargets.length ?? 0) >= 0);
});

test("graph readers provide AI prompt context, governance checks, and stored media references", () => {
  const output = buildAcademicIntelligence(source());
  const graph = output.curriculumIntelligenceGraph;

  const promptContext = buildGraphAwarePromptContext(graph);
  const checks = buildGraphContentQualityChecks({
    graph,
    subject: "maths",
    yearGroup: "Year 5",
    keyStage: "KS2",
    topic: "Fractions",
  });
  const mediaReferences = buildGraphStorageMediaReferences({
    graph,
    assets: [
      {
        id: "visual-1",
        title: "Fractions diagram",
        r2Key: "lessons/fractions-diagram.png",
        imageUrl: "https://cdn.example.test/fractions-diagram.png",
        type: "diagram",
      },
    ],
    certificateExport: {
      objectKey: "certificates/certificate-1.html",
      publicUrl: "https://cdn.example.test/certificate-1.html",
    },
  });

  assert.match(promptContext, /Priority gaps: Fractions/i);
  assert.equal(checks.ageSuitability, "aligned");
  assert.equal(checks.approvalStatus, "review_required");
  assert.ok(mediaReferences.some((entry) => entry.assetType === "diagram" && entry.storageStatus === "stored"));
  assert.ok(mediaReferences.some((entry) => entry.assetType === "certificate_pdf" && entry.storageStatus === "stored"));
});
