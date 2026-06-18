import type {
  AssessmentReadinessStatus,
  AssessmentRecommendation,
  AssessmentType,
  CatchUpTrigger,
  CoverageEntry,
  ExamReadinessProfile,
  GcseReadiness,
  MasteryMapEntry,
} from "@/lib/academic-intelligence/types";

const GCSE_COMMAND_WORDS = ["describe", "explain", "compare", "evaluate", "analyse", "calculate", "justify", "discuss"];

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function readinessFromMastery(entry: MasteryMapEntry): AssessmentReadinessStatus {
  if (entry.masteryStatus === "mastered") return "ready";
  if (entry.masteryStatus === "nearly_secure") return "nearly_ready";
  if (entry.masteryStatus === "needs_catch_up") return "needs_catch_up";
  if (entry.masteryStatus === "started" || entry.masteryStatus === "practising") return "developing";
  return "not_ready";
}

function defaultQuestionCount(type: AssessmentType): number {
  switch (type) {
    case "daily_quiz":
      return 8;
    case "weekly_recap_quiz":
      return 12;
    case "topic_test":
      return 14;
    case "mock_exam":
      return 18;
    case "improve_my_answer":
      return 6;
    default:
      return 10;
  }
}

function assessmentTypeForEntry(entry: MasteryMapEntry): AssessmentType {
  if (entry.masteryStatus === "needs_catch_up") return "lesson_check";
  if (entry.masteryStatus === "needs_revision") return "weekly_recap_quiz";
  if (entry.masteryStatus === "started") return "prior_knowledge_check";
  if (normalize(entry.subject).includes("reading")) return "reading_comprehension";
  if (normalize(entry.subject).includes("math")) return "maths_method_check";
  if (normalize(entry.subject).includes("spelling")) return "spelling_test";
  return "topic_test";
}

function difficultyFromScore(score: number | null): "easy" | "medium" | "challenging" {
  if (score === null) return "easy";
  if (score < 60) return "easy";
  if (score < 80) return "medium";
  return "challenging";
}

function gcseTier(entry: MasteryMapEntry): "foundation" | "higher" | "mixed" {
  if (entry.foundationTier && !entry.higherTier) return "foundation";
  if (entry.higherTier && !entry.foundationTier) return "higher";
  return "mixed";
}

function isGcseEntry(entry: MasteryMapEntry): boolean {
  return normalize(entry.keyStage) === "ks4"
    || normalize(entry.yearGroup).includes("year 10")
    || normalize(entry.yearGroup).includes("year 11");
}

function recommendationReason(entry: MasteryMapEntry, type: AssessmentType): string {
  if (type === "lesson_check") return `This topic needs a confidence check before moving on.`;
  if (type === "weekly_recap_quiz") return `A short recap quiz will refresh this topic.`;
  if (type === "prior_knowledge_check") return `Start with a quick prior-knowledge check for this topic.`;
  if (type === "topic_test") return `A topic test will confirm secure understanding.`;
  if (type === "gcse_style_question") return `GCSE-style practice will strengthen exam readiness in this topic.`;
  if (type === "improve_my_answer") return `Improve-my-answer practice will build mark scheme accuracy.`;
  return `A focused assessment is recommended for this topic.`;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function buildExamReadinessProfile(input: {
  masteryMap: MasteryMapEntry[];
  recommendations: AssessmentRecommendation[];
  overallReadiness: AssessmentReadinessStatus;
}): ExamReadinessProfile {
  const activeTopics = input.masteryMap.filter((row) => row.masteryStatus !== "not_started");
  const averageConfidence = activeTopics.length > 0
    ? activeTopics.reduce((sum, row) => sum + row.confidenceScore, 0) / activeTopics.length
    : 0;
  const masteryScore = clampScore(averageConfidence);

  const overdueOrRevision = activeTopics.filter((row) => row.revisionOverdue || row.masteryStatus === "needs_revision").length;
  const consistencyScore = activeTopics.length > 0
    ? clampScore(100 - (overdueOrRevision / activeTopics.length) * 70)
    : 0;

  const readyOrNearly = input.recommendations.filter((item) => item.readinessStatus === "ready" || item.readinessStatus === "nearly_ready").length;
  const examEvidenceScore = input.recommendations.length > 0
    ? clampScore((readyOrNearly / input.recommendations.length) * 100)
    : 0;

  const weakAreaCount = activeTopics.filter((row) => row.weakAreaActive || row.masteryStatus === "needs_catch_up").length;
  const weakAreaPenalty = clampScore(weakAreaCount * 8);

  const score = clampScore(
    masteryScore * 0.45
      + consistencyScore * 0.25
      + examEvidenceScore * 0.30
      - weakAreaPenalty,
  );

  const band = score >= 75 ? "ready" : score >= 55 ? "nearly_ready" : "not_ready";
  const blockers: string[] = [];
  if (weakAreaCount > 0) blockers.push(`${weakAreaCount} weak-topic signals are still active.`);
  if (overdueOrRevision > 0) blockers.push(`${overdueOrRevision} topics are overdue for revision.`);
  if (input.overallReadiness === "needs_catch_up" || input.overallReadiness === "not_ready") {
    blockers.push("Assessment readiness is below secure level.");
  }

  const recommendations = band === "ready"
    ? [
        "Take one timed exam-style assessment this week.",
        "Run one mark-scheme self-review after each practice paper.",
      ]
    : band === "nearly_ready"
      ? [
          "Complete two targeted catch-up sessions before mock questions.",
          "Take one short recap assessment after each catch-up block.",
        ]
      : [
          "Start with guided catch-up tasks for weak topics.",
          "Use short daily checks before attempting exam-style questions.",
        ];

  const headline = band === "ready"
    ? "Ready for structured exam practice"
    : band === "nearly_ready"
      ? "Nearly ready - secure weak topics first"
      : "Not ready yet - build foundations first";

  return {
    score,
    band,
    headline,
    blockers,
    recommendedActions: recommendations,
    signals: {
      masteryScore,
      consistencyScore,
      examEvidenceScore,
      weakAreaPenalty,
    },
  };
}

export function buildAssessmentRecommendations(input: {
  masteryMap: MasteryMapEntry[];
  coverageMap: CoverageEntry[];
  catchUpTriggers: CatchUpTrigger[];
  maxRecommendations?: number;
}): {
  recommendations: AssessmentRecommendation[];
  readinessStatus: AssessmentReadinessStatus;
  examReadinessProfile: ExamReadinessProfile;
  gcseReadiness: GcseReadiness | null;
  assessmentLinkedCatchUpTriggers: CatchUpTrigger[];
} {
  const maxRecommendations = input.maxRecommendations ?? 8;

  const recommendations = input.masteryMap
    .filter((entry) => entry.masteryStatus !== "not_started")
    .map((entry) => {
      const baseType = assessmentTypeForEntry(entry);
      const gcse = isGcseEntry(entry);
      const type: AssessmentType = gcse && (entry.masteryStatus === "needs_catch_up" || entry.masteryStatus === "needs_revision")
        ? "gcse_style_question"
        : baseType;
      const readinessStatus = readinessFromMastery(entry);
      const commandWords = gcse ? GCSE_COMMAND_WORDS : [];
      const gcseMode = gcse
        ? {
            examBoard: entry.examBoard ?? null,
            tier: gcseTier(entry),
            markSchemePractice: true,
            modelAnswerPractice: true,
            improveMyAnswer: entry.masteryStatus !== "mastered",
          }
        : undefined;

      return {
        assessmentType: type,
        subject: entry.subject,
        topic: entry.topic,
        skill: entry.skill,
        keyStage: entry.keyStage,
        yearGroup: entry.yearGroup,
        examBoard: entry.examBoard,
        reason: recommendationReason(entry, type),
        estimatedMinutes: type === "mock_exam" ? 40 : type === "gcse_style_question" ? 25 : 15,
        difficulty: difficultyFromScore(entry.averageScore),
        readinessStatus,
        recommendedQuestionCount: defaultQuestionCount(type),
        commandWords,
        gcseMode,
        routeTarget: "/student/dashboard",
      } satisfies AssessmentRecommendation;
    })
    .sort((left, right) => {
      const readinessOrder: AssessmentReadinessStatus[] = ["needs_catch_up", "not_ready", "developing", "nearly_ready", "ready"];
      return readinessOrder.indexOf(left.readinessStatus) - readinessOrder.indexOf(right.readinessStatus);
    })
    .slice(0, maxRecommendations);

  const lowReadiness = recommendations.filter((item) => item.readinessStatus === "needs_catch_up" || item.readinessStatus === "not_ready").length;
  const overallReadiness: AssessmentReadinessStatus = lowReadiness > 0
    ? "needs_catch_up"
    : recommendations.some((item) => item.readinessStatus === "developing")
      ? "developing"
      : recommendations.some((item) => item.readinessStatus === "nearly_ready")
        ? "nearly_ready"
        : recommendations.length > 0
          ? "ready"
          : "not_ready";

  const gcseCoverageGaps = input.coverageMap.filter((row) => isGcseEntry({
    ...row,
    assignmentCompletionPct: 0,
    lessonCompletionPct: 0,
    averageScore: null,
    attemptsCount: 0,
    repeatedMistakes: 0,
    hintUsageRate: 0,
    coachUsageCount: 0,
    dictionaryWeaknessCount: 0,
    weakAreaActive: false,
    lastPractisedAt: row.lastActivityAt,
    revisionOverdue: row.coverageStatus === "overdue_revision",
    confidenceScore: 0,
  }) && (row.coverageStatus === "gap_detected" || row.coverageStatus === "not_covered"));

  const mockEvidenceCount = input.masteryMap.length > 0
    ? input.masteryMap.filter((entry) => isGcseEntry(entry) && normalize(entry.subject).includes("mock")).length
    : 0;
  const examLikeEvidenceCount = input.masteryMap.length > 0
    ? input.masteryMap.filter((entry) => isGcseEntry(entry) && (entry.masteryStatus === "mastered" || entry.masteryStatus === "nearly_secure" || entry.revisionOverdue)).length
    : 0;

  const gcseRecommendationCount = recommendations.filter((item) => Boolean(item.gcseMode)).length;
  const gcseReadiness: GcseReadiness | null = gcseRecommendationCount > 0 || gcseCoverageGaps.length > 0
    ? {
        applicable: true,
        readinessStatus: overallReadiness,
        examBoard: recommendations.find((item) => item.gcseMode)?.gcseMode?.examBoard ?? null,
        tier: recommendations.find((item) => item.gcseMode)?.gcseMode?.tier ?? "mixed",
        coverageGapCount: gcseCoverageGaps.length,
        commandWordFocus: GCSE_COMMAND_WORDS,
        markSchemeReadiness: overallReadiness === "ready" ? "secure" : overallReadiness === "nearly_ready" ? "developing" : "low",
        modelAnswerReadiness: overallReadiness === "ready" ? "secure" : overallReadiness === "nearly_ready" ? "developing" : "low",
        improveMyAnswerRecommended: recommendations.some((item) => item.assessmentType === "improve_my_answer" || item.gcseMode?.improveMyAnswer),
        evidenceStrength: mockEvidenceCount > 0 || examLikeEvidenceCount >= 3 ? "strong" : examLikeEvidenceCount >= 1 ? "moderate" : "low",
        weakGcseAreas: input.masteryMap
          .filter((entry) => isGcseEntry(entry) && (entry.weakAreaActive || entry.masteryStatus === "needs_catch_up" || entry.masteryStatus === "needs_revision"))
          .map((entry) => entry.topic ?? entry.skill ?? entry.subject)
          .filter((value): value is string => Boolean(value)),
        mockEvidenceCount,
        examLikeEvidenceCount,
        calibrationConfidence: clampScore(
          (overallReadiness === "ready" ? 45 : overallReadiness === "nearly_ready" ? 30 : 15)
            + Math.min(25, examLikeEvidenceCount * 8)
            + Math.min(20, mockEvidenceCount * 10)
            - Math.min(25, gcseCoverageGaps.length * 4)
            - Math.min(20, recommendations.filter((item) => item.readinessStatus === "needs_catch_up" || item.readinessStatus === "not_ready").length * 3),
        ),
        calibrationNotes: [
          mockEvidenceCount > 0 ? `${mockEvidenceCount} mock-style evidence row(s) available.` : "No mock/exam-like evidence is available yet.",
          gcseCoverageGaps.length > 0 ? `${gcseCoverageGaps.length} GCSE coverage gap(s) remain.` : "No GCSE coverage gaps detected.",
          recommendations.some((item) => item.readinessStatus === "needs_catch_up" || item.readinessStatus === "not_ready")
            ? "GCSE readiness remains low-confidence because weak foundations are still active."
            : "GCSE readiness is supported by the current assessment evidence.",
        ],
      }
    : null;

  const assessmentLinkedCatchUpTriggers: CatchUpTrigger[] = recommendations
    .filter((item) => item.readinessStatus === "needs_catch_up" || item.readinessStatus === "not_ready")
    .map((item) => ({
      triggerType: "assessment_below_readiness",
      subject: item.subject,
      topic: item.topic,
      skill: item.skill,
      source: "assessment_engine",
      evidenceSummary: `Assessment readiness is ${item.readinessStatus} for ${item.topic ?? item.skill ?? "this topic"}.`,
      priority: "high",
      detectedAt: new Date().toISOString(),
      keyStage: item.keyStage,
      yearGroup: item.yearGroup,
      examBoard: item.examBoard,
    }));

  const examReadinessProfile = buildExamReadinessProfile({
    masteryMap: input.masteryMap,
    recommendations,
    overallReadiness,
  });

  return {
    recommendations,
    readinessStatus: overallReadiness,
    examReadinessProfile,
    gcseReadiness,
    assessmentLinkedCatchUpTriggers,
  };
}
