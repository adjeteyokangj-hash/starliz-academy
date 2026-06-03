import test from "node:test";
import assert from "node:assert/strict";

import { buildAcademicIntelligence } from "../src/lib/academic-intelligence/academicIntelligence";
import {
  buildGraphAwarePromptContext,
  buildGraphContentQualityChecks,
  buildGraphStorageMediaReferences,
} from "../src/lib/academic-intelligence/graph-context";
import {
  detectCircularDependencies,
  detectDuplicateNodes,
  detectOrphanNodes,
  evaluateGraphChangeProposal,
  validateCurriculumGraph,
} from "../src/lib/academic-intelligence/graph-protection";
import { toStudentSafeAcademicIntelligence } from "../src/lib/academic-intelligence/academicIntelligence";
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

test("circular dependency detection identifies cycles", () => {
  const output = buildAcademicIntelligence(source());
  const topicNode = output.curriculumIntelligenceGraph.nodes.find((node) => node.type === "topic");
  const prereqNode = output.curriculumIntelligenceGraph.nodes.find((node) => node.type === "prerequisite");
  assert.ok(topicNode);
  assert.ok(prereqNode);

  const cycles = detectCircularDependencies({
    nodes: [topicNode!, prereqNode!],
    edges: [
      { id: "c1", source: topicNode!.id, target: prereqNode!.id, type: "requires", weight: 1 },
      { id: "c2", source: prereqNode!.id, target: topicNode!.id, type: "blocked_by", weight: 1 },
    ],
  });

  assert.ok(cycles.length > 0);
});

test("orphan node detection identifies isolated nodes", () => {
  const output = buildAcademicIntelligence(source());
  const orphan = { id: "orphan:1", type: "topic", label: "Orphan concept" } as const;
  const orphans = detectOrphanNodes({
    nodes: [...output.curriculumIntelligenceGraph.nodes.slice(0, 2), orphan],
    edges: output.curriculumIntelligenceGraph.edges.slice(0, 1),
  });

  assert.ok(orphans.includes("orphan:1"));
});

test("duplicate node detection flags duplicate ids and fingerprints", () => {
  const base = { id: "dup:1", type: "topic", label: "Fractions", subject: "math", topicKey: "math|fractions" } as const;
  const duplicates = detectDuplicateNodes([
    base,
    { ...base, id: "dup:1" },
    { ...base, id: "dup:2" },
  ]);

  assert.ok(duplicates.duplicateNodeIds.includes("dup:1"));
  assert.ok(duplicates.duplicateNodeIds.includes("dup:2"));
  assert.ok(duplicates.duplicateFingerprints.length > 0);
});

test("protected node blocking rejects prohibited graph changes", () => {
  const output = buildAcademicIntelligence(source());
  const protectedId = output.curriculumIntelligenceGraph.protection.protectedNodeIds[0];
  assert.ok(protectedId);

  const evaluated = evaluateGraphChangeProposal({
    graph: output.curriculumIntelligenceGraph,
    proposal: {
      proposalId: "proposal-protected",
      submittedAt: new Date().toISOString(),
      submittedBy: "admin-user",
      source: "admin",
      action: "remove_node",
      reason: "Attempt removal",
      node: output.curriculumIntelligenceGraph.nodes.find((node) => node.id === protectedId),
    },
    approvedBy: "admin-user",
  });

  assert.equal(evaluated.accepted, false);
  assert.equal(evaluated.reason, "protected_node_violation");
});

test("AI suggestions stay pending without admin approval", () => {
  const output = buildAcademicIntelligence(source());
  const evaluated = evaluateGraphChangeProposal({
    graph: output.curriculumIntelligenceGraph,
    proposal: {
      proposalId: "proposal-ai",
      submittedAt: new Date().toISOString(),
      submittedBy: "ai-agent",
      source: "ai",
      action: "add_node",
      reason: "AI proposes a node",
      node: {
        id: "ai-node:1",
        type: "topic",
        label: "AI Suggested Topic",
      },
    },
  });

  assert.equal(evaluated.accepted, false);
  assert.equal(evaluated.reason, "proposal_pending_admin_approval");
  assert.equal(evaluated.graph.approvalWorkflow.latestDecision, "pending");
});

test("student-safe graph output strips internal metadata", () => {
  const output = buildAcademicIntelligence(source());
  const safe = toStudentSafeAcademicIntelligence(output);

  assert.equal(safe.curriculumIntelligenceGraph.nodes.every((node) => !node.metadata), true);
  assert.equal(safe.curriculumIntelligenceGraph.protection.aiSuggestionMode, "suggestion_only");
});

test("graph fallback behavior remains available when builder throws", () => {
  const output = buildAcademicIntelligence(source(), {
    graphBuilder: () => {
      throw new Error("forced_graph_failure");
    },
  });

  assert.equal(output.curriculumIntelligenceGraph.fallback.applied, true);
  assert.match(output.curriculumIntelligenceGraph.fallback.reason ?? "", /forced_graph_failure/);
  assert.equal(output.curriculumIntelligenceGraph.auditMetadata.decisions[0]?.decision, "build_fallback");
});

test("academic graph avoids orphan signal and duplicate recommendation issues for normal source", () => {
  const output = buildAcademicIntelligence(source());
  const issues = output.curriculumIntelligenceGraph.protection.validation.issues;

  const orphanSignal = issues.find((issue) => {
    if (issue.code !== "orphan_node") return false;
    const node = output.curriculumIntelligenceGraph.nodes.find((row) => row.id === issue.nodeId);
    return node?.type === "learning_twin_signal";
  });
  const duplicateRecommendation = issues.find((issue) => {
    if (issue.code !== "duplicate_node") return false;
    const node = output.curriculumIntelligenceGraph.nodes.find((row) => row.id === issue.nodeId);
    return node?.type === "recommendation";
  });

  assert.equal(orphanSignal, undefined);
  assert.equal(duplicateRecommendation, undefined);
});

test("graph protection still reports genuine dependency cycle errors", () => {
  const validation = validateCurriculumGraph({
    nodes: [
      { id: "topic:1", type: "topic", label: "Topic 1" },
      { id: "prereq:1", type: "prerequisite", label: "Prerequisite 1" },
    ],
    edges: [
      { id: "edge-1", source: "topic:1", target: "prereq:1", type: "requires", weight: 1 },
      { id: "edge-2", source: "prereq:1", target: "topic:1", type: "blocked_by", weight: 1 },
    ],
  });

  assert.equal(validation.valid, false);
  assert.ok(validation.issues.some((issue) => issue.code === "circular_dependency" && issue.severity === "error"));
});
