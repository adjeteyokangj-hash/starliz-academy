import type {
  AcademicIntelligenceOutput,
  AssessmentRecommendation,
  CatchUpRecommendation,
  CurriculumIntelligenceGraph,
  MasteryMapEntry,
  MasteryStatus,
} from "@/lib/academic-intelligence/types";

export type StudentGraphNodeState = "mastered" | "practising" | "weak" | "intervention_active" | "forgotten";

export type StudentGraphNodeSignal = {
  topicKey: string;
  subject: string;
  topic: string;
  skill: string | null;
  masteryStatus: MasteryStatus;
  confidenceScore: number;
  weakAreaActive: boolean;
  revisionOverdue: boolean;
  lastPractisedAt: string | null;
  recommendationCount: number;
  activeInterventionCount: number;
  failureImpact: number;
  importanceScore: number;
  nodeState: StudentGraphNodeState;
  recentlyImproved: boolean;
  decayingMastery: boolean;
  overdueRevision: boolean;
  forgottenConcept: boolean;
};

export type StudentGraphOverlay = {
  studentId: string;
  active: boolean;
  confidenceScore: number;
  masteryGapTopics: string[];
  weakAreaTopics: string[];
  examReadinessBand: string;
  recommendationFocus: string[];
  reportSignals: string[];
  learningTwin: {
    preferredExplanationStyle: string;
    paceProfile: string;
    confidenceProfile: string;
    memoryProfile: string;
    retryDependency: string;
  };
  temporal: {
    recentlyImproved: string[];
    decayingMastery: string[];
    overdueRevision: string[];
    forgottenConcepts: string[];
  };
  heatmap: {
    weakClusters: string[];
    highRiskConcepts: string[];
    interventionHeavyAreas: string[];
    curriculumBottlenecks: string[];
  };
  reasoning: {
    why: string[];
    prerequisiteBlockers: string[];
    chain: string[];
  };
  activeInterventions: Array<{
    topicKey: string;
    label: string;
    status: string;
    reason: string;
    dueDate: string | null;
  }>;
  nodeSignals: StudentGraphNodeSignal[];
};

function normalize(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function daysSince(value: string | null | undefined): number {
  if (!value) return Number.POSITIVE_INFINITY;
  return Math.floor((Date.now() - new Date(value).getTime()) / (1000 * 60 * 60 * 24));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function topicLabel(entry: MasteryMapEntry): string {
  return String(entry.topic ?? entry.skill ?? entry.subject).trim();
}

function matchRecommendation(
  entry: MasteryMapEntry,
  recommendation: CatchUpRecommendation | AssessmentRecommendation,
): boolean {
  const sameSubject = normalize(recommendation.subject) === normalize(entry.subject);
  const sameTopic = normalize(recommendation.topic) === normalize(entry.topic);
  const sameSkill = normalize(recommendation.skill) === normalize(entry.skill);
  const sameTopicKeyHint = normalize(recommendation.reason).includes(normalize(entry.topicKey));
  return sameSubject && (sameTopic || sameSkill || sameTopicKeyHint);
}

function buildRecommendationFocus(
  recommendations: Array<CatchUpRecommendation | AssessmentRecommendation>,
): string[] {
  return recommendations
    .map((recommendation) => recommendation.topic ?? recommendation.skill ?? recommendation.reason)
    .filter((value): value is string => Boolean(value?.trim()))
    .slice(0, 6);
}

function buildLearningTwinProfiles(output: AcademicIntelligenceOutput) {
  const twin = output.learningTwin.explanationDNA;
  const memoryProfile = twin.topSignals[0]?.evidence ?? output.learningTwin.insights[0]?.text ?? "Guided support is being personalised from live activity.";
  const retryDependency = output.catchUpRecommendations[0]?.studentFriendlyReason
    ?? output.assessmentRecommendations[0]?.reason
    ?? "Retry dependency is inferred from the learner's most urgent gap.";

  return {
    preferredExplanationStyle: twin.bestExplanationStyle,
    paceProfile: twin.learningPacePattern,
    confidenceProfile: twin.confidenceBand,
    memoryProfile,
    retryDependency,
  };
}

function buildReasoningChain(input: {
  focusLabel: string;
  prerequisiteBlockers: string[];
  recommendationFocus: string[];
  activeInterventions: string[];
}): string[] {
  const chain: string[] = [];
  if (input.focusLabel) chain.push(`Focus: ${input.focusLabel}`);
  if (input.recommendationFocus[0]) chain.push(`Recommendation: ${input.recommendationFocus[0]}`);
  if (input.prerequisiteBlockers[0]) chain.push(`Blocker: ${input.prerequisiteBlockers[0]}`);
  if (input.activeInterventions[0]) chain.push(`Intervention: ${input.activeInterventions[0]}`);
  return chain;
}

function subjectHeatmap(entries: StudentGraphNodeSignal[]): string[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const isHot = entry.weakAreaActive || entry.revisionOverdue || entry.recommendationCount > 0 || entry.activeInterventionCount > 0;
    if (!isHot) continue;
    counts.set(entry.subject, (counts.get(entry.subject) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([subject, count]) => `${subject} (${count})`);
}

function topRiskConcepts(entries: StudentGraphNodeSignal[]): string[] {
  return [...entries]
    .sort((left, right) => right.failureImpact - left.failureImpact)
    .slice(0, 5)
    .map((entry) => `${entry.topic} · ${entry.failureImpact}`);
}

function interventionHeavyAreas(entries: StudentGraphNodeSignal[]): string[] {
  return [...entries]
    .filter((entry) => entry.activeInterventionCount > 0)
    .sort((left, right) => right.activeInterventionCount - left.activeInterventionCount)
    .slice(0, 5)
    .map((entry) => `${entry.topic} · ${entry.activeInterventionCount}`);
}

function curriculumBottlenecks(graph: CurriculumIntelligenceGraph, entries: StudentGraphNodeSignal[]): string[] {
  const bottleneckScores = new Map<string, number>();
  for (const edge of graph.edges) {
    if (edge.type === "requires" || edge.type === "blocked_by" || edge.type === "supports_readiness") {
      bottleneckScores.set(edge.source, (bottleneckScores.get(edge.source) ?? 0) + 1);
      bottleneckScores.set(edge.target, (bottleneckScores.get(edge.target) ?? 0) + 1);
    }
  }

  return [...entries]
    .map((entry) => ({
      entry,
      score: (bottleneckScores.get(`topic:${normalize(entry.subject)}:${normalize(entry.topic)}:${normalize(entry.skill)}`) ?? 0) + entry.failureImpact,
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 5)
    .map(({ entry }) => `${entry.topic} · bottleneck`);
}

export function buildStudentGraphOverlay(input: {
  output: AcademicIntelligenceOutput;
  graph: CurriculumIntelligenceGraph;
}): StudentGraphOverlay {
  const { output, graph } = input;
  const masteryMap = output.masteryMap;
  const activeCatchUps = output.catchUpRecommendations.filter((recommendation) => recommendation.status !== "completed" && recommendation.status !== "waived");
  const activeAssessments = output.assessmentRecommendations;
  const recommendations = [...activeCatchUps, ...activeAssessments];

  const nodeSignals: StudentGraphNodeSignal[] = masteryMap.map((entry) => {
    const matchingRecommendations = recommendations.filter((recommendation) => matchRecommendation(entry, recommendation));
    const activeInterventionCount = activeCatchUps.filter((recommendation) => matchRecommendation(entry, recommendation)).length;
    const recommendationCount = matchingRecommendations.length;
    const recentlyImproved = (entry.masteryStatus === "mastered" || entry.masteryStatus === "nearly_secure") && daysSince(entry.lastPractisedAt) <= 7;
    const decayingMastery = entry.revisionOverdue || (entry.masteryStatus === "nearly_secure" && daysSince(entry.lastPractisedAt) > 10);
    const overdueRevision = entry.revisionOverdue;
    const forgottenConcept = entry.masteryStatus === "not_started" || (entry.confidenceScore < 40 && daysSince(entry.lastPractisedAt) > 14);
    const failureImpact = clamp(
      Math.round(
        (100 - entry.confidenceScore) * 0.55
        + (entry.weakAreaActive ? 18 : 0)
        + (entry.revisionOverdue ? 16 : 0)
        + Math.min(recommendationCount * 5, 20),
      ),
      0,
      100,
    );
    const importanceScore = clamp(
      Math.round(
        failureImpact
        + (entry.masteryStatus === "needs_catch_up" ? 10 : 0)
        + (entry.masteryStatus === "needs_revision" ? 12 : 0)
        + (activeInterventionCount > 0 ? 8 : 0)
        + (recentlyImproved ? 8 : 0),
      ),
      10,
      100,
    );

    const nodeState: StudentGraphNodeState = activeInterventionCount > 0
      ? "intervention_active"
      : forgottenConcept || entry.masteryStatus === "needs_revision"
        ? "forgotten"
        : entry.weakAreaActive || entry.masteryStatus === "needs_catch_up"
          ? "weak"
          : entry.masteryStatus === "practising"
            ? "practising"
            : "mastered";

    return {
      topicKey: entry.topicKey,
      subject: entry.subject,
      topic: topicLabel(entry),
      skill: entry.skill ?? null,
      masteryStatus: entry.masteryStatus,
      confidenceScore: entry.confidenceScore,
      weakAreaActive: entry.weakAreaActive,
      revisionOverdue: entry.revisionOverdue,
      lastPractisedAt: entry.lastPractisedAt,
      recommendationCount,
      activeInterventionCount,
      failureImpact,
      importanceScore,
      nodeState,
      recentlyImproved,
      decayingMastery,
      overdueRevision,
      forgottenConcept,
    };
  });

  const recommendationFocus = buildRecommendationFocus(recommendations);
  const masteryGapTopics = nodeSignals
    .filter((entry) => entry.masteryStatus === "needs_catch_up" || entry.weakAreaActive || entry.forgottenConcept)
    .sort((left, right) => right.importanceScore - left.importanceScore)
    .slice(0, 8)
    .map((entry) => entry.topic);
  const weakAreaTopics = nodeSignals
    .filter((entry) => entry.weakAreaActive || entry.nodeState === "weak" || entry.nodeState === "intervention_active")
    .slice(0, 8)
    .map((entry) => entry.topic);
  const temporal = {
    recentlyImproved: nodeSignals.filter((entry) => entry.recentlyImproved).slice(0, 5).map((entry) => entry.topic),
    decayingMastery: nodeSignals.filter((entry) => entry.decayingMastery).slice(0, 5).map((entry) => entry.topic),
    overdueRevision: nodeSignals.filter((entry) => entry.overdueRevision).slice(0, 5).map((entry) => entry.topic),
    forgottenConcepts: nodeSignals.filter((entry) => entry.forgottenConcept).slice(0, 5).map((entry) => entry.topic),
  };

  const why = [...new Set([
    ...output.catchUpRecommendations.slice(0, 4).map((item) => item.reason),
    ...output.assessmentRecommendations.slice(0, 3).map((item) => item.reason),
  ])].slice(0, 6);
  const prerequisiteBlockers = [...new Set([
    ...graph.aiGenerationContext.prerequisiteConcepts,
    ...graph.aiGenerationContext.examReadinessBlockers,
  ])].slice(0, 6);
  const activeInterventions = activeCatchUps.slice(0, 6).map((recommendation) => ({
    topicKey: `${normalize(recommendation.subject)}:${normalize(recommendation.topic)}:${normalize(recommendation.skill)}`,
    label: recommendation.title,
    status: recommendation.status,
    reason: recommendation.studentFriendlyReason,
    dueDate: recommendation.dueDate ?? null,
  }));
  const reasoning = {
    why,
    prerequisiteBlockers,
    chain: buildReasoningChain({
      focusLabel: masteryGapTopics[0] ?? recommendationFocus[0] ?? "Core topic",
      recommendationFocus,
      prerequisiteBlockers,
      activeInterventions: activeInterventions.map((item) => item.label),
    }),
  };

  return {
    studentId: output.studentId,
    active: nodeSignals.length > 0,
    confidenceScore: output.summary.averageScore,
    masteryGapTopics,
    weakAreaTopics,
    examReadinessBand: output.examReadinessProfile.band,
    recommendationFocus,
    reportSignals: graph.reportSummary.reportSignals,
    learningTwin: buildLearningTwinProfiles(output),
    temporal,
    heatmap: {
      weakClusters: subjectHeatmap(nodeSignals),
      highRiskConcepts: topRiskConcepts(nodeSignals),
      interventionHeavyAreas: interventionHeavyAreas(nodeSignals),
      curriculumBottlenecks: curriculumBottlenecks(graph, nodeSignals),
    },
    reasoning,
    activeInterventions,
    nodeSignals,
  };
}

export function scoreGraphNodeState(signal?: StudentGraphNodeSignal | null): number {
  if (!signal) return 0;
  return signal.importanceScore;
}

export function topicKeyFromLabel(label: string | null | undefined): string {
  return normalize(label);
}

export function edgeFocusClass(type: string, active: boolean): string {
  return ["heartbeat-edge", `heartbeat-edge--${type}`, active ? "heartbeat-edge--active" : ""].filter(Boolean).join(" ");
}
