import assert from "node:assert/strict";
import test from "node:test";

import { handleAdminKnowledgeGraphGet } from "../src/app/api/admin/knowledge-graph/route";

type KnowledgeGraphDeps = NonNullable<Parameters<typeof handleAdminKnowledgeGraphGet>[1]>;

type KnowledgeGraphPayload = {
  mode: string;
  nodes: Array<{ id: string }>;
  heartbeat: {
    systemStates: Array<{ status: string }>;
  } | null;
  heartbeatDecision: {
    primaryAction: string;
  };
  brainContext: {
    learningDnaSummary: { readinessLabel: string };
    languageReadiness: { status: string };
    weakAreaSummary: { active: number };
    progressionSummary: unknown;
    placementSummary: unknown;
  };
};

function makeDeps(overrides: Partial<KnowledgeGraphDeps> = {}) {
  const counters = {
    brainCalls: 0,
    dictionaryCalls: 0,
  };

  const deps = {
    requireAdmin: async () => ({
      session: { userId: "admin-1", email: "admin@example.com" },
      response: null,
    }),
    buildCoachWordHelpResponse: async () => ({ recoveryPlan: null }),
    countDictionaryWordsForGraph: async () => {
      counters.dictionaryCalls += 1;
      return 1;
    },
    listDictionaryWords: async () => ({
      items: [
        {
          id: "word-1",
          word: "fraction",
          normalizedWord: "fraction",
          definitionChild: "A part of a whole.",
          topic: "Fractions",
          skillFocus: "fractions",
          subject: "math",
          keyStage: "KS2",
          yearGroup: "Year 5",
          difficulty: "medium",
          curriculumTags: [],
          interventionTags: [],
          relatedWords: null,
        },
      ],
    }),
    buildKnowledgeGraph: () => ({
      nodes: [{ id: "word:word-1", type: "word", label: "fraction", data: { origin: "dictionary" } }],
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
    }),
    getStudentLearningBrain: async () => {
      counters.brainCalls += 1;
      return {
        studentId: "student-1",
        academicIntelligence: {
          generatedAt: "2026-06-03T12:00:00.000Z",
          heartbeatDecision: {
            primaryAction: "assign_catch_up",
            urgency: "medium",
            riskLevel: "medium",
            confidenceScore: 72,
            actorRequired: "admin",
            suggestedNextStep: "Assign catch-up.",
            reasons: ["weak area active"],
            blockers: [],
            evidence: ["recent attempts below threshold"],
          },
          curriculumIntelligenceGraph: {
            heartbeat: {
              sourceOfTruth: "academic_intelligence",
              generatedAt: "2026-06-03T12:00:00.000Z",
              systemStates: [],
            },
            protection: {
              status: "protected",
              aiSuggestionMode: "suggestion_only",
              approvalRequiredForActivation: true,
              blockedChangesCount: 0,
              protectedNodeIds: [],
              validation: { valid: true, issues: [] },
            },
            approvalWorkflow: {
              pendingProposals: [],
              latestDecision: "not_requested",
              latestDecisionReason: null,
            },
            fallback: {
              applied: false,
              reason: null,
              fallbackGeneratedAt: null,
            },
            auditMetadata: {
              decisions: [],
            },
          },
        },
        learningDnaSummary: { readinessLabel: "Active" },
        languageReadiness: { status: "ready_to_move_up", autoLevelChangeApplied: false },
        evidenceSummary: {
          weakAreas: { total: 2, active: 1, top: ["Fractions"] },
          progress: { total: 12, completed: 10, averageScore: 73 },
        },
      };
    },
    getProgressionDecisionBrainView: async () => ({
      quick: { status: "completed" },
      progression: { recommendations: [{ status: "needs_support" }] },
      summary: {
        total: 1,
        needsSupport: 1,
        readyToAdvance: 0,
        reviewNeeded: 0,
        friendlyHeadline: "Needs support",
      },
      placementLessons: {
        recommendations: [{ status: "assigned", assignmentId: "a1", contentId: "c1", href: "/games/lesson/a1" }],
        contentGaps: [],
      },
    }),
    mergeKnowledgeGraphViews: ({ mode, dictionary, academic }: {
      mode: string;
      dictionary: { nodes?: Array<{ id: string }>; edges?: unknown[]; metrics?: Record<string, unknown> } | null;
      academic: { nodes?: Array<{ id: string }>; edges?: unknown[]; metrics?: Record<string, unknown> } | null;
    }) => {
      if (mode === "hybrid") {
        return {
          nodes: [...(dictionary?.nodes ?? []), ...(academic?.nodes ?? [])],
          edges: [...(dictionary?.edges ?? []), ...(academic?.edges ?? [])],
          metrics: dictionary?.metrics ?? academic?.metrics ?? {},
        };
      }
      if (mode === "dictionary") {
        return {
          nodes: dictionary?.nodes ?? [],
          edges: dictionary?.edges ?? [],
          metrics: dictionary?.metrics ?? {},
        };
      }
      return {
        nodes: academic?.nodes ?? [],
        edges: academic?.edges ?? [],
        metrics: academic?.metrics ?? {},
      };
    },
    projectCurriculumGraphToKnowledgeGraph: () => ({
      nodes: [{ id: "academic:topic:fractions", type: "topic", label: "Fractions", data: { origin: "academic" } }],
      edges: [],
      metrics: {
        totalWords: 1,
        totalGraphLinks: 0,
        orphanConcepts: 0,
        highestConnectedConcepts: [],
        interventionLinkedConcepts: 0,
        curriculumCoveragePct: 0,
        orphanWarnings: {
          isolatedWords: [],
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
    }),
    buildStudentGraphOverlay: () => ({
      masteryGapTopics: ["Fractions"],
      weakAreaTopics: ["Fractions"],
      confidenceScore: 72,
      activeInterventions: [],
      temporal: {
        recentlyImproved: [],
        decayingMastery: [],
        overdueRevision: [],
        forgottenConcepts: [],
      },
      heatmap: {
        weakClusters: ["Fractions"],
        highRiskConcepts: [],
        interventionHeavyAreas: [],
        curriculumBottlenecks: [],
      },
      reasoning: {
        why: ["Low attempt confidence"],
        prerequisiteBlockers: [],
        chain: [],
      },
      learningTwin: {
        preferredExplanationStyle: "coach_guided_hints",
        paceProfile: "steady",
        confidenceProfile: "recovering",
        memoryProfile: "developing",
        retryDependency: "medium",
      },
      nodeSignals: [],
      examReadinessBand: "not_ready",
      recommendationFocus: ["Catch-up"],
      reportSignals: ["1 active weak area"],
    }),
    evaluateGraphChangeProposal: () => ({
      accepted: true,
      reason: "ok",
      graph: {
        approvalWorkflow: { pendingProposals: [], latestDecision: "approved", latestDecisionReason: "ok" },
        protection: { aiSuggestionMode: "suggestion_only" },
        fallback: { applied: false, reason: null, fallbackGeneratedAt: null },
        auditMetadata: { decisions: [] },
      },
    }),
    ...overrides,
  } as KnowledgeGraphDeps;

  return { deps, counters };
}

test("academic mode returns brain-backed heartbeat and connected systems are not missing when evidence exists", async () => {
  const { deps, counters } = makeDeps();

  const response = await handleAdminKnowledgeGraphGet(
    new Request("http://localhost/api/admin/knowledge-graph?mode=academic_intelligence&studentId=student-1"),
    deps,
  );
  const payload = await response.json() as KnowledgeGraphPayload;

  assert.equal(response.status, 200);
  assert.equal(counters.brainCalls, 1);
  assert.ok(payload.heartbeat);
  assert.equal(payload.heartbeat.systemStates.length, 9);
  assert.equal(payload.heartbeat.systemStates.some((row) => row.status === "missing"), false);
  assert.equal(payload.heartbeatDecision.primaryAction, "assign_catch_up");
  assert.equal(payload.brainContext.learningDnaSummary.readinessLabel, "Active");
  assert.equal(payload.brainContext.languageReadiness.status, "ready_to_move_up");
  assert.equal(payload.brainContext.weakAreaSummary.active, 1);
});

test("dictionary mode keeps dictionary graph behavior and does not require brain", async () => {
  const { deps, counters } = makeDeps();

  const response = await handleAdminKnowledgeGraphGet(
    new Request("http://localhost/api/admin/knowledge-graph?mode=dictionary&q=fraction"),
    deps,
  );
  const payload = await response.json() as KnowledgeGraphPayload;

  assert.equal(response.status, 200);
  assert.equal(counters.dictionaryCalls, 1);
  assert.equal(counters.brainCalls, 0);
  assert.equal(payload.mode, "dictionary");
  assert.ok(Array.isArray(payload.nodes));
  assert.equal(payload.heartbeat, null);
});

test("hybrid mode keeps dictionary graph and adds brain-backed academic diagnostics", async () => {
  const { deps, counters } = makeDeps();

  const response = await handleAdminKnowledgeGraphGet(
    new Request("http://localhost/api/admin/knowledge-graph?mode=hybrid&studentId=student-1"),
    deps,
  );
  const payload = await response.json() as KnowledgeGraphPayload;

  assert.equal(response.status, 200);
  assert.equal(counters.dictionaryCalls, 1);
  assert.equal(counters.brainCalls, 1);
  assert.equal(payload.mode, "hybrid");
  assert.ok(payload.nodes.some((node) => String(node.id).startsWith("word:")));
  assert.ok(payload.nodes.some((node) => String(node.id).startsWith("academic:")));
  assert.ok(payload.brainContext.progressionSummary);
  assert.ok(payload.brainContext.placementSummary);
});
