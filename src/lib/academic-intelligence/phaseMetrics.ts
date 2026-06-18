import type {
  AcademicIntelligenceOutput,
  AcademicSourceData,
  AssessmentReadinessStatus,
  HeartbeatDecisionRisk,
  LearningTwinAttribution,
  MasteryEvidenceGate,
  MasteryMapEntry,
  MasterySummary,
  RecommendationQualityAudit,
  WeakAreaRevisitEffectiveness,
  GcseCalibrationMetadata,
  CurriculumCoverageStatus,
  WeakAreaRevisitWindowStatus,
} from "@/lib/academic-intelligence/types";

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function lastActivityIso(rows: Array<{ createdAt?: string | null; updatedAt?: string | null; lastDetectedAt?: string | null }>): string | null {
  const values = rows
    .flatMap((row) => [row.createdAt, row.updatedAt, row.lastDetectedAt])
    .filter((value): value is string => Boolean(value));
  if (!values.length) return null;
  return values.sort().at(-1) ?? null;
}

function daysSince(value: string | null | undefined): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const diff = Date.now() - new Date(value).getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

function countSessions(source: AcademicSourceData): number {
  const buckets = new Set<string>();
  for (const row of source.attempts) buckets.add((row.createdAt ?? "").slice(0, 10));
  for (const row of source.progressRecords) buckets.add((row.createdAt ?? "").slice(0, 10));
  for (const row of source.assignments) buckets.add((row.updatedAt ?? row.createdAt ?? "").slice(0, 10));
  return buckets.size;
}

function retentionStatusForEntry(entry: MasteryMapEntry, source: AcademicSourceData): "proven" | "not_proven" | "more_data_needed" {
  const topicMatches = source.attempts.filter((row) => normalize(row.subject) === normalize(entry.subject) && normalize(row.topic) === normalize(entry.topic));
  if (topicMatches.length < 2) return "more_data_needed";
  const sorted = topicMatches.slice().sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return "more_data_needed";
  if (typeof first.score === "number" && typeof last.score === "number") {
    return last.score >= first.score ? "proven" : "not_proven";
  }
  return last.correct && first.correct ? "proven" : last.correct ? "proven" : "not_proven";
}

export function buildMasteryEvidenceGate(input: {
  source: AcademicSourceData;
  summary: MasterySummary;
  masteryMap: MasteryMapEntry[];
}): MasteryEvidenceGate {
  const denominator = input.summary.denominatorCoverage;
  const activeTopics = input.masteryMap.filter((row) => row.masteryStatus !== "not_started");
  const attempts = input.source.attempts.length + input.source.progressRecords.length;
  const sessions = countSessions(input.source);
  const weakAreasActive = input.masteryMap.some((row) => row.weakAreaActive);
  const confidenceScore = input.masteryMap.length > 0
    ? average(input.masteryMap.map((row) => row.confidenceScore)) ?? 0
    : 0;
  const retentionEntries = input.masteryMap.filter((row) => row.masteryStatus === "mastered" || row.masteryStatus === "nearly_secure");
  const retentionCheck = retentionEntries.length > 0
    ? (retentionEntries.every((row) => retentionStatusForEntry(row, input.source) === "proven") ? "proven" : retentionEntries.some((row) => retentionStatusForEntry(row, input.source) === "not_proven") ? "not_proven" : "more_data_needed")
    : "more_data_needed";

  const gateReasons: MasteryEvidenceGate["gateReasons"] = [];
  const reasonDetails: string[] = [];

  if (denominator.coveragePercent < 70) {
    gateReasons.push("insufficient_coverage");
    reasonDetails.push(`Coverage is ${denominator.coveragePercent}% and needs a stronger curriculum denominator before progression.`);
  }
  if (attempts < 5 || sessions < 2 || activeTopics.length < 2 || confidenceScore < 65) {
    gateReasons.push("insufficient_evidence");
    reasonDetails.push(`Evidence is too thin (${attempts} attempts, ${sessions} sessions, ${activeTopics.length} active topics, ${confidenceScore}% confidence).`);
  }
  if (retentionCheck !== "proven") {
    gateReasons.push("retention_not_proven");
    reasonDetails.push(retentionCheck === "more_data_needed" ? "Retention has not been proven yet." : "Retention check did not hold on later work.");
  }
  if (weakAreasActive) {
    gateReasons.push("weak_areas_still_active");
    reasonDetails.push("Weak areas are still active.");
  }

  const allowedToProgress = gateReasons.length === 0;
  const status: MasteryEvidenceGate["status"] = allowedToProgress ? "passed" : gateReasons.length >= 2 ? "blocked" : "needs_review";

  return {
    status,
    allowedToProgress,
    confidenceScore: clampScore(confidenceScore),
    gateReasons,
    reasonDetails,
    evidence: {
      denominatorCoveragePercent: denominator.coveragePercent,
      minimumAttempts: attempts,
      multipleSessions: sessions,
      retentionCheck,
      weakAreasActive,
      weakAreaCount: input.masteryMap.filter((row) => row.weakAreaActive).length,
      confidenceScore: clampScore(confidenceScore),
    },
  };
}

function coverageSignalForTopic(entry: MasteryMapEntry): CurriculumCoverageStatus {
  if (entry.revisionOverdue) return "overdue_revision";
  if (entry.masteryStatus === "needs_catch_up") return "gap_detected";
  if (entry.masteryStatus === "mastered" || entry.masteryStatus === "nearly_secure") return "covered";
  return "partially_covered";
}

export function buildWeakAreaRevisitEffectiveness(input: {
  source: AcademicSourceData;
  masteryMap: MasteryMapEntry[];
}): WeakAreaRevisitEffectiveness {
  const topicRows = input.masteryMap.filter((row) => row.weakAreaActive || row.masteryStatus === "needs_catch_up" || row.masteryStatus === "needs_revision");
  const topics = topicRows.map((row) => {
    const attempts = input.source.attempts.filter((attempt) => normalize(attempt.subject) === normalize(row.subject) && normalize(attempt.topic) === normalize(row.topic));
    const scores = attempts
      .map((attempt) => typeof attempt.score === "number" ? attempt.score : attempt.correct ? 100 : 0)
      .filter((score) => Number.isFinite(score));
    const beforeScore = scores.length >= 2 ? average(scores.slice(0, Math.max(1, Math.floor(scores.length / 2)))) : scores[0] ?? null;
    const afterScore = scores.length >= 2 ? average(scores.slice(Math.floor(scores.length / 2))) : scores.at(-1) ?? null;
    const improvement = beforeScore !== null && afterScore !== null ? afterScore - beforeScore : null;
    const lastPractised = row.lastPractisedAt ?? lastActivityIso(attempts);
    const days = daysSince(lastPractised);
    const revisit7DayStatus: WeakAreaRevisitWindowStatus = days <= 7 ? (improvement === null ? "more_data_needed" : improvement >= 5 ? "improving" : improvement <= -5 ? "declining" : "stable") : "not_proven";
    const revisit14DayStatus: WeakAreaRevisitWindowStatus = days <= 14 ? (improvement === null ? "more_data_needed" : improvement >= 5 ? "improving" : improvement <= -5 ? "declining" : "stable") : "not_proven";
    const revisit21DayStatus: WeakAreaRevisitWindowStatus = days <= 21 ? (improvement === null ? "more_data_needed" : improvement >= 5 ? "improving" : improvement <= -5 ? "declining" : "stable") : "not_proven";
    const relapseRisk: "low" | "medium" | "high" = row.weakAreaActive || row.revisionOverdue || (improvement !== null && improvement < 0) ? "high" : improvement !== null && improvement < 8 ? "medium" : "low";
    return {
      topicKey: row.topicKey,
      subject: row.subject,
      topic: row.topic ?? null,
      beforeScore,
      afterScore,
      improvement,
      relapseRisk,
      revisit7DayStatus,
      revisit14DayStatus,
      revisit21DayStatus,
      evidence: [
        `Last practised ${Number.isFinite(days) ? days : "unknown"} day(s) ago`,
        `Coverage signal: ${coverageSignalForTopic(row)}`,
        `Attempts reviewed: ${attempts.length}`,
      ],
      recommendation: improvement === null
        ? "More revisit evidence is needed before judging effectiveness."
        : improvement < 0
          ? "Catch-up is not working yet; simplify the next revisit and check the prerequisite gap."
          : improvement < 8
            ? "Revisit is helping slowly; keep support but shorten the gap before the next check."
            : "Revisit is working; continue spaced practice and recheck retention later.",
    };
  });

  const positive = topics.filter((topic) => typeof topic.improvement === "number" && topic.improvement >= 8).length;
  const negative = topics.filter((topic) => typeof topic.improvement === "number" && topic.improvement < 0).length;
  const moreDataNeeded = topics.some((topic) => topic.revisit7DayStatus === "more_data_needed" || topic.revisit14DayStatus === "more_data_needed" || topic.revisit21DayStatus === "more_data_needed");
  const relapseRisk: WeakAreaRevisitEffectiveness["relapseRisk"] = negative > positive ? "high" : negative > 0 ? "medium" : "low";

  return {
    status: topics.length === 0 ? "insufficient_data" : negative > positive ? "declining" : positive > 0 && negative === 0 ? "improving" : positive === 0 && negative === 0 ? "stable" : "mixed",
    moreDataNeeded,
    relapseRisk,
    summary: topics.length === 0
      ? "More weak-area evidence is needed before revisit effectiveness can be judged."
      : negative > positive
        ? "Weak-area revisits are not consistently improving outcomes yet."
        : positive > 0
          ? "Weak-area revisits are showing improvement."
          : "Weak-area revisits are broadly stable but still need more evidence.",
    topics,
  };
}

export function buildRecommendationQualityAudit(input: {
  output: AcademicIntelligenceOutput;
  masteryGate: MasteryEvidenceGate;
  weakAreaRevisit: WeakAreaRevisitEffectiveness;
}): RecommendationQualityAudit {
  const recommendedAction = input.output.heartbeatDecision.primaryAction;
  const expectedOutcome = recommendedAction === "advance_student"
    ? "Secure progression with stable curriculum evidence."
    : recommendedAction === "assign_catch_up"
      ? "Improve weak areas and reduce the risk of future gaps."
      : recommendedAction === "generate_assessment"
        ? "Validate readiness with a focused assessment."
        : recommendedAction === "generate_revision"
          ? "Strengthen retention through revision."
          : recommendedAction === "schedule_homework"
            ? "Complete pending practice aligned to current learning."
            : "Improve the current learning decision.";
  const actualSignal = input.output.recommendationSync.canonicalDecision.intent === "advance"
    ? "advance"
    : input.output.recommendationSync.canonicalDecision.intent === "catch_up"
      ? "catch_up"
      : input.output.recommendationSync.canonicalDecision.intent;
  const aligned = input.output.recommendationSync.status === "synced" && input.masteryGate.allowedToProgress === (recommendedAction === "advance_student");
  const evidenceLevel: RecommendationQualityAudit["evidenceLevel"] = input.masteryGate.evidence.denominatorCoveragePercent >= 75 && input.masteryGate.evidence.multipleSessions >= 3
    ? "high"
    : input.masteryGate.evidence.denominatorCoveragePercent >= 50 && input.masteryGate.evidence.multipleSessions >= 2
      ? "medium"
      : "low";
  const confidence = clampScore(
    (input.output.heartbeatDecision.confidenceScore * 0.45)
      + (input.masteryGate.confidenceScore * 0.25)
      + (input.output.examReadinessProfile.score * 0.15)
      + (evidenceLevel === "high" ? 15 : evidenceLevel === "medium" ? 8 : 0),
  );
  const risk: HeartbeatDecisionRisk = input.output.heartbeatDecision.riskLevel;

  return {
    recommendedAction,
    expectedOutcome,
    actualSignal,
    confidence,
    risk,
    aligned,
    evidenceLevel,
    note: aligned
      ? "Recommendation appears aligned with the available evidence."
      : "Evidence is incomplete or conflicting, so accuracy cannot be claimed with high certainty.",
  };
}

export function buildLearningTwinAttribution(input: {
  source: AcademicSourceData;
  summary: MasterySummary;
  learningTwin: AcademicIntelligenceOutput["learningTwin"];
}): LearningTwinAttribution {
  const attempts = input.source.attempts.slice().sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
  const progress = input.source.progressRecords.slice().sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
  const dataPoints = attempts.length + progress.length + input.source.coachUsage.length;
  const preferredExplanationStyle = input.learningTwin.explanationDNA.bestExplanationStyle;
  const supportingEvidence = input.learningTwin.explanationDNA.topSignals.slice(0, 3).map((signal) => signal.evidence);
  const recentScores = attempts.slice(-4).map((row) => typeof row.score === "number" ? row.score : row.correct ? 100 : 0);
  const priorScores = attempts.slice(0, Math.max(0, attempts.length - 4)).map((row) => typeof row.score === "number" ? row.score : row.correct ? 100 : 0);
  const recentAverage = average(recentScores);
  const priorAverage = average(priorScores);
  let outcomeTrend: LearningTwinAttribution["outcomeTrend"] = "insufficient_data";
  if (recentAverage !== null && priorAverage !== null) {
    outcomeTrend = recentAverage >= priorAverage + 8 ? "improving" : recentAverage <= priorAverage - 8 ? "declining" : "mixed";
  }
  const confidence = clampScore(
    (input.summary.averageScore * 0.35)
      + ((recentAverage ?? input.summary.averageScore) * 0.25)
      + (input.learningTwin.hasEnoughData ? 20 : 0)
      + (dataPoints >= 12 ? 20 : dataPoints >= 6 ? 10 : 0),
  );
  const moreDataNeeded = dataPoints < 6 || supportingEvidence.length === 0;

  return {
    preferredExplanationStyle,
    supportingEvidence,
    outcomeTrend,
    confidence,
    moreDataNeeded,
    note: moreDataNeeded
      ? "More data is needed before explanation-style impact can be treated as reliable."
      : outcomeTrend === "improving"
        ? "Preferred explanation style is associated with better recent outcomes."
        : outcomeTrend === "declining"
          ? "Preferred explanation style is not yet translating into better outcomes consistently."
          : "Attribution signal is mixed and should be treated as directional only.",
  };
}

export function buildGcseCalibrationMetadata(input: {
  source: AcademicSourceData;
  masteryMap: MasteryMapEntry[];
  assessmentReadiness: AssessmentReadinessStatus;
  gcseReadiness: { coverageGapCount: number; readinessStatus: AssessmentReadinessStatus } | null;
}): GcseCalibrationMetadata {
  const gcseTopics = input.masteryMap.filter((entry) => normalize(entry.keyStage) === "ks4" || normalize(entry.yearGroup).includes("year 10") || normalize(entry.yearGroup).includes("year 11"));
  const weakGcseAreas = gcseTopics
    .filter((entry) => entry.weakAreaActive || entry.masteryStatus === "needs_catch_up" || entry.masteryStatus === "needs_revision")
    .map((entry) => entry.topic ?? entry.skill ?? entry.subject)
    .filter((value): value is string => Boolean(value));
  const mockEvidenceCount = input.source.assessmentHistory.filter((row) => normalize(row.assessmentType).includes("mock")).length;
  const examLikeEvidenceCount = input.source.assessmentHistory.filter((row) => {
    const kind = normalize(row.assessmentType);
    return kind.includes("mock") || kind.includes("topic") || kind.includes("gcse") || kind.includes("improve");
  }).length;
  const evidenceStrength: GcseCalibrationMetadata["evidenceStrength"] = mockEvidenceCount > 0 || examLikeEvidenceCount >= 3
    ? "strong"
    : examLikeEvidenceCount >= 1
      ? "moderate"
      : "low";
  const calibrationConfidence = clampScore(
    (input.assessmentReadiness === "ready" ? 45 : input.assessmentReadiness === "nearly_ready" ? 30 : 15)
      + Math.min(25, examLikeEvidenceCount * 8)
      + Math.min(20, mockEvidenceCount * 10)
      - Math.min(25, weakGcseAreas.length * 4)
      - (input.gcseReadiness?.coverageGapCount ?? 0) * 2,
  );
  const calibrationNotes = [
    mockEvidenceCount > 0
      ? `${mockEvidenceCount} mock-style evidence row(s) available.`
      : "No mock/exam-like evidence is available yet.",
    weakGcseAreas.length > 0
      ? `${weakGcseAreas.length} weak GCSE area(s) remain active.`
      : "No active GCSE weak areas detected.",
    input.gcseReadiness?.coverageGapCount
      ? `${input.gcseReadiness.coverageGapCount} GCSE coverage gap(s) remain.`
      : "No GCSE coverage gaps detected.",
  ];

  return {
    readinessBand: input.assessmentReadiness,
    evidenceStrength,
    coverageGaps: input.gcseReadiness?.coverageGapCount ?? 0,
    weakGcseAreas,
    mockEvidenceCount,
    examLikeEvidenceCount,
    calibrationConfidence,
    calibrationNotes,
  };
}
