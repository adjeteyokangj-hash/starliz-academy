import type {
  AcademicSourceData,
  CatchUpTaskRecord,
  ExplanationDNAProfile,
  ExplanationStyleSignal,
  ExplanationStyleSignalType,
  LearningTwinProfile,
  LearningTwinRecommendation,
  MasterySummary,
} from "@/lib/academic-intelligence/types";

const FORBIDDEN_STUDENT_WORDS = [
  "failed",
  "weak child",
  "poor",
  "behind",
  "dropped",
  "struggling",
];

const SUPPORTED_STYLES: ExplanationStyleSignalType[] = [
  "visual_examples",
  "diagrams",
  "step_by_step_explanation",
  "real_life_examples",
  "story_based_explanation",
  "voice_explanation",
  "worked_examples",
  "simpler_wording",
  "practice_first_learning",
  "repetition_recap",
  "challenge_game_style_explanation",
  "coach_guided_hints",
];

function cleanStudentWording(text: string): string {
  const lowered = text.toLowerCase();
  if (FORBIDDEN_STUDENT_WORDS.some((bad) => lowered.includes(bad))) {
    return "StarLiz is personalising your support with kind, step-by-step help.";
  }
  return text;
}

function buildDefaultProfile(): LearningTwinProfile {
  const explanationDNA: ExplanationDNAProfile = {
    bestExplanationStyle: "step_by_step_explanation",
    coachSupportSignal: "emerging",
    learningPacePattern: "guided_building",
    todayApproach: "Short explanation, example, then practice.",
    confidenceBand: "growing",
    topSignals: [
      {
        style: "step_by_step_explanation",
        score: 50,
        evidence: "Default support style until more lesson data is available.",
      },
    ],
  };

  return {
    title: "LEARNING TWIN",
    subtitle: "How I Learn Best",
    hasEnoughData: false,
    explanationDNA,
    insights: [],
    defaultsApplied: true,
  };
}

function createSignalsMap(): Record<ExplanationStyleSignalType, number> {
  return Object.fromEntries(SUPPORTED_STYLES.map((style) => [style, 0])) as Record<ExplanationStyleSignalType, number>;
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function pickBestHelpMessage(bestStyle: ExplanationStyleSignalType): string {
  if (bestStyle === "visual_examples" || bestStyle === "diagrams") {
    return "Pictures and examples help you understand faster.";
  }
  if (bestStyle === "practice_first_learning" || bestStyle === "worked_examples") {
    return "You learn well by trying examples and then practising.";
  }
  if (bestStyle === "coach_guided_hints") {
    return "You learn well with gentle coach hints step by step.";
  }
  return "You learn well with step-by-step help.";
}

function buildCoachSupportMessage(level: ExplanationDNAProfile["coachSupportSignal"]): string {
  if (level === "active") return "Coach hints are helping you improve.";
  if (level === "helpful") return "Coach support is helping when questions get harder.";
  return "Your coach support is warming up as you complete more lessons.";
}

function buildLearningPaceMessage(pace: ExplanationDNAProfile["learningPacePattern"]): string {
  if (pace === "practice_first") return "You build confidence quickly with guided practice.";
  if (pace === "balanced") return "You do well with a balance of explanation and practice.";
  return "You build confidence with guided, step-by-step learning.";
}

function buildTodayApproachMessage(bestStyle: ExplanationStyleSignalType): string {
  if (bestStyle === "visual_examples" || bestStyle === "diagrams") {
    return "Today\'s lesson will use short steps, visuals, and guided practice.";
  }
  if (bestStyle === "practice_first_learning" || bestStyle === "worked_examples") {
    return "Today\'s lesson will use guided practice with quick examples.";
  }
  return "Today\'s lesson will use guided practice.";
}

export function buildLearningTwinProfile(input: {
  source: AcademicSourceData;
  summary?: MasterySummary;
  catchUpTasks?: CatchUpTaskRecord[];
}): LearningTwinProfile {
  const { source, summary } = input;
  const catchUpTasks = input.catchUpTasks ?? [];

  const attempts = source.attempts ?? [];
  const coachUsage = source.coachUsage ?? [];
  const weakAreas = source.weakAreas ?? [];
  const studentSkills = source.studentSkills ?? [];
  const progressRecords = source.progressRecords ?? [];

  const attemptsWithHints = attempts.filter((attempt) => (attempt.hintsUsed ?? 0) > 0).length;
  const coachGuidedUsage = coachUsage.filter((row) => {
    const mode = normalize(row.mode);
    return mode.includes("hint") || mode.includes("coach") || mode.includes("guided");
  }).length;

  const practiceSignals = [
    catchUpTasks.some((task) => task.status === "in_progress" || task.status === "completed"),
    progressRecords.some((row) => normalize(row.activityType).includes("practice") || normalize(row.activityType).includes("catch")),
  ].filter(Boolean).length;

  const signalScores = createSignalsMap();
  signalScores.step_by_step_explanation += attempts.length >= 4 ? 35 : 20;
  signalScores.simpler_wording += weakAreas.length > 0 ? 20 : 10;
  signalScores.coach_guided_hints += Math.min(40, coachGuidedUsage * 4 + attemptsWithHints * 2);
  signalScores.practice_first_learning += practiceSignals > 0 ? 45 : 15;
  signalScores.worked_examples += attempts.length >= 6 ? 25 : 10;
  signalScores.repetition_recap += (summary?.needsRevisionCount ?? 0) > 0 ? 18 : 8;
  signalScores.visual_examples += source.dictionarySignals.length > 0 ? 16 : 8;
  signalScores.diagrams += source.yearGroup?.toLowerCase().includes("year") ? 10 : 6;
  signalScores.real_life_examples += attempts.length >= 8 ? 12 : 6;
  signalScores.story_based_explanation += source.keyStage?.toLowerCase().includes("ks1") ? 12 : 6;
  signalScores.voice_explanation += coachUsage.some((row) => normalize(row.mode).includes("voice")) ? 22 : 7;
  signalScores.challenge_game_style_explanation += studentSkills.some((row) => row.status === "mastered") ? 10 : 6;

  const topSignals: ExplanationStyleSignal[] = Object.entries(signalScores)
    .map(([style, score]) => ({
      style: style as ExplanationStyleSignalType,
      score,
      evidence: `Signal score from attempts, coach usage, and support activity: ${score}`,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  const dataPoints = attempts.length + coachUsage.length + progressRecords.length;
  if (dataPoints < 6) {
    return buildDefaultProfile();
  }

  const bestStyle = topSignals[0]?.style ?? "step_by_step_explanation";
  const coachSupportSignal: ExplanationDNAProfile["coachSupportSignal"] = coachGuidedUsage >= 8 || attemptsWithHints >= 10
    ? "active"
    : coachGuidedUsage >= 3 || attemptsWithHints >= 4
      ? "helpful"
      : "emerging";

  const learningPacePattern: ExplanationDNAProfile["learningPacePattern"] = practiceSignals > 0
    ? "practice_first"
    : attempts.length >= 10
      ? "balanced"
      : "guided_building";

  const confidenceBand: ExplanationDNAProfile["confidenceBand"] = (summary?.averageScore ?? 0) >= 80
    ? "strong"
    : (summary?.averageScore ?? 0) >= 60
      ? "steady"
      : "growing";

  const explanationDNA: ExplanationDNAProfile = {
    bestExplanationStyle: bestStyle,
    coachSupportSignal,
    learningPacePattern,
    todayApproach: "Short explanation, example, then practice.",
    confidenceBand,
    topSignals,
  };

  const insights: LearningTwinRecommendation[] = [
    { key: "best_help", label: "Best help", text: cleanStudentWording(pickBestHelpMessage(bestStyle)) },
    { key: "coach_support", label: "Coach support", text: cleanStudentWording(buildCoachSupportMessage(coachSupportSignal)) },
    { key: "learning_pace", label: "Learning pace", text: cleanStudentWording(buildLearningPaceMessage(learningPacePattern)) },
    { key: "todays_approach", label: "Today\'s approach", text: cleanStudentWording(buildTodayApproachMessage(bestStyle)) },
  ];

  return {
    title: "LEARNING TWIN",
    subtitle: "How I Learn Best",
    hasEnoughData: true,
    explanationDNA,
    insights,
    defaultsApplied: false,
  };
}
