import test from "node:test";
import assert from "node:assert/strict";

import {
  mergeKnowledgeGraphViews,
  projectCurriculumGraphToKnowledgeGraph,
} from "../src/lib/admin_graph";
import type { CurriculumIntelligenceGraph } from "../src/lib/academic-intelligence/types";

function curriculumGraph(): CurriculumIntelligenceGraph {
  return {
    version: "v1",
    generatedAt: new Date().toISOString(),
    studentId: "student-1",
    nodes: [
      { id: "topic:math:fractions", type: "topic", label: "Fractions", subject: "math", topicKey: "math|fractions||fractions" },
      { id: "mastery:fractions", type: "mastery_state", label: "needs_catch_up", subject: "math", topicKey: "math|fractions||fractions", metadata: { confidenceScore: 42 } },
      { id: "weak:1", type: "weak_area", label: "Fractions weak area", subject: "math", metadata: { weakAreaId: "weak-1" } },
      { id: "rec:1", type: "recommendation", label: "Fractions catch-up", subject: "math", metadata: { recommendationId: "rec-1" } },
      { id: "pre:1", type: "prerequisite", label: "Equivalent fractions", subject: "math" },
      { id: "signal:1", type: "learning_twin_signal", label: "coach_guided_hints" },
      { id: "readiness:1", type: "assessment_readiness", label: "Build foundations" },
    ],
    edges: [
      { id: "e1", source: "topic:math:fractions", target: "mastery:fractions", type: "has_mastery_state", weight: 1 },
      { id: "e2", source: "topic:math:fractions", target: "weak:1", type: "has_weak_area", weight: 1 },
      { id: "e3", source: "topic:math:fractions", target: "pre:1", type: "requires", weight: 0.8 },
      { id: "e4", source: "rec:1", target: "topic:math:fractions", type: "targets", weight: 1 },
      { id: "e5", source: "signal:1", target: "rec:1", type: "informed_by", weight: 0.7 },
      { id: "e6", source: "rec:1", target: "readiness:1", type: "supports_readiness", weight: 1 },
    ],
    recommendationLayer: [
      {
        recommendationId: "rec-1",
        source: "catch_up",
        priority: "high",
        status: "recommended",
        subject: "math",
        topic: "Fractions",
        skill: "fractions",
        reason: "Low attempt score",
        action: "Start catch-up",
      },
    ],
    masteryOverlay: [
      {
        topicKey: "math|fractions||fractions",
        subject: "math",
        topic: "Fractions",
        skill: "fractions",
        masteryStatus: "needs_catch_up",
        coverageStatus: "gap_detected",
        confidenceScore: 42,
        weakAreaActive: true,
        revisionOverdue: false,
      },
    ],
    weakAreaTrace: [
      {
        weakAreaId: "weak-1",
        subject: "math",
        topic: "Fractions",
        skill: "fractions",
        linkedTopicKeys: ["math|fractions||fractions"],
        linkedRecommendationIds: ["rec-1"],
        prerequisiteIds: ["prerequisite:math:equivalent-fractions"],
      },
    ],
    heartbeat: {
      sourceOfTruth: "academic_intelligence",
      generatedAt: new Date().toISOString(),
      systemStates: [
        {
          system: "curriculum_knowledge_graph",
          connected: true,
          status: "ready",
          summary: "Projection ready",
          updatedAt: new Date().toISOString(),
        },
      ],
    },
    aiGenerationContext: {
      masteryGapTopics: ["Fractions"],
      prerequisiteConcepts: ["Equivalent fractions"],
      weakAreaTopics: ["Fractions"],
      recommendationFocus: ["Start catch-up"],
      catchUpRouteTargets: [],
      examReadinessBand: "not_ready",
      examReadinessBlockers: ["Low attempt score"],
      learningTwinSignals: ["coach_guided_hints"],
      bestExplanationStyle: "coach_guided_hints",
      recommendedApproach: "Use guided hints before independent practice.",
    },
    schoolPlanningContext: {
      strategy: "Focus on the highest-priority gap first.",
      activeDayCount: 1,
      blockMetadata: [],
      recommendationIds: ["rec-1"],
      homeworkTaskIds: [],
      revisionTopicKeys: ["math|fractions||fractions"],
    },
    reportSummary: {
      recommendationReasons: ["Low attempt score"],
      parentSummary: "Fractions needs catch-up first.",
      adminSummary: "Fractions remains a tracked gap.",
      reportSignals: ["1 catch-up recommendation active"],
    },
    contentGovernance: {
      ageSuitability: {
        keyStage: "KS2",
        yearGroup: "Year 5",
        status: "aligned",
      },
      curriculumAlignment: {
        coveredTopicCount: 0,
        gapTopicCount: 1,
        status: "review",
      },
      sensitiveContent: {
        status: "clear",
        flaggedTags: [],
      },
      approvalStatus: {
        requiredStatuses: ["reviewed", "published"],
        recommendedDefault: "reviewed",
        status: "review_required",
      },
      auditTrailTags: ["curriculum_intelligence_graph"],
    },
    mediaPlan: {
      supportedAssetTypes: ["lesson_image", "diagram", "audio", "certificate_pdf", "generated_asset", "homework_asset"],
      references: [],
      summary: "No planned media refs in fixture.",
    },
  };
}

test("projectCurriculumGraphToKnowledgeGraph preserves curriculum graph semantics", () => {
  const projected = projectCurriculumGraphToKnowledgeGraph({
    graph: curriculumGraph(),
    prefix: "academic",
  });

  assert.ok(projected.nodes.some((node) => node.type === "mastery_state"));
  assert.ok(projected.nodes.some((node) => node.type === "weak_area"));
  assert.ok(projected.nodes.some((node) => node.type === "recommendation"));
  assert.ok(projected.nodes.some((node) => node.type === "learning_twin_signal"));
  assert.ok(projected.edges.some((edge) => edge.type === "requires"));
  assert.ok(projected.edges.some((edge) => edge.type === "targets"));
  assert.ok(projected.edges.some((edge) => edge.type === "supports_readiness"));
  assert.equal(projected.metrics.totalGraphLinks >= projected.edges.length, true);
});

test("mergeKnowledgeGraphViews combines dictionary and academic modes without collisions", () => {
  const projected = projectCurriculumGraphToKnowledgeGraph({
    graph: curriculumGraph(),
    prefix: "academic",
  });

  const merged = mergeKnowledgeGraphViews({
    mode: "hybrid",
    dictionary: {
      nodes: [
        {
          id: "word:w1",
          type: "word",
          label: "fraction",
          data: { origin: "dictionary", normalizedWord: "fraction" },
        },
      ],
      edges: [],
      metrics: {
        totalWords: 1,
        totalGraphLinks: 0,
        orphanConcepts: 1,
        highestConnectedConcepts: [],
        interventionLinkedConcepts: 0,
        curriculumCoveragePct: 0,
        orphanWarnings: {
          isolatedWords: ["fraction"],
          missingPrerequisites: [],
          deadEndConcepts: [],
          missingCurriculumMappings: [],
        },
        aiInsights: {
          mostImportantConcepts: [],
          highestFailureConcepts: [],
          mostReusedPrerequisiteChains: [],
          interventionHeavyConcepts: [],
          curriculumBottlenecks: [],
        },
      },
    },
    academic: projected,
  });

  assert.ok(merged.nodes.some((node) => node.id === "word:w1"));
  assert.ok(merged.nodes.some((node) => node.id.startsWith("academic:")));
  assert.ok(merged.edges.some((edge) => edge.type === "has_mastery_state"));
  assert.equal(merged.metrics.totalWords >= 2, true);
});
