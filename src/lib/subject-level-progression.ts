import { ENGLISH_STRANDS } from "@/lib/subject-selection";
import type { PlacementBand, PlacementRecommendation } from "@/lib/placement-lesson-selector";
import { keyStageForYearGroup } from "@/lib/curriculum";

export type ProgressionStatus =
  | "needs_support"
  | "developing"
  | "on_track"
  | "secure"
  | "ready_to_advance"
  | "advanced"
  | "review_needed";

export type ProgressionAction =
  | "keep_current_level"
  | "assign_catch_up"
  | "assign_revision"
  | "assign_mastery_check"
  | "recommend_level_up"
  | "recommend_admin_review";

export type ProgressionGeneratorHint = {
  subject: string;
  strand: string | null;
  level: number;
  yearGroup: string | null;
  keyStage: string | null;
  skillFocus: string;
  reason: string;
};

export type SubjectProgressionRecommendation = {
  scopedSubject: string;
  subject: string;
  strand: string | null;
  currentLevel: number;
  recommendedLevel: number;
  status: ProgressionStatus;
  action: ProgressionAction;
  confidence: number;
  evidenceSummary: {
    activityCount: number;
    completedAssignments: number;
    attemptCount: number;
    averageScore: number;
    activeWeakAreas: number;
    masterySignals: number;
  };
  reasons: string[];
  blockers: string[];
  nextBestStep: string;
  generatorHint: ProgressionGeneratorHint | null;
};

export type SubjectProgressionResult = {
  recommendations: SubjectProgressionRecommendation[];
  grouped: Array<{
    parentSubject: string;
    label: string;
    recommendations: SubjectProgressionRecommendation[];
  }>;
  contentGaps: SubjectProgressionRecommendation[];
  hasEvidence: boolean;
};

type AttemptEvidence = {
  subject: string;
  skillFocus: string | null;
  correct: boolean;
};

type AssignmentEvidence = {
  status: string;
  contentType: string;
  topic: string | null;
  skillFocus: string | null;
  metadataJson?: string | null;
};

type WeakAreaEvidence = {
  subject: string;
  skillFocus: string;
  status: string;
};

type StudentSkillEvidence = {
  skill: string;
  status: string;
  accuracy: number;
  attempts: number;
};

type ProgressRecordEvidence = {
  activityType: string;
  activityName: string;
  score: number | null;
  accuracy: number | null;
  completed: boolean;
};

type PlacementLevel = {
  accuracy: number;
  level: PlacementBand;
};

type ParsedScope = {
  scopedSubject: string;
  parentSubject: string;
  strand: string | null;
};

type ProgressionInput = {
  studentId: string;
  yearGroup?: string | null;
  keyStage?: string | null;
  selectedSubjects: string[];
  placementLevels: Record<string, PlacementLevel>;
  attempts: AttemptEvidence[];
  assignments: AssignmentEvidence[];
  weakAreas: WeakAreaEvidence[];
  studentSkills: StudentSkillEvidence[];
  progressRecords: ProgressRecordEvidence[];
  placementRecommendations?: PlacementRecommendation[];
};

const ENGLISH_STRAND_SET: Set<string> = new Set(ENGLISH_STRANDS);

function normalize(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function titleCase(value: string): string {
  return value
    .split(/[-_\s]+/g)
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function parseScopedSubject(rawKey: string): ParsedScope {
  const raw = normalize(rawKey);
  if (raw.includes(":")) {
    const [parent, strandRaw] = raw.split(":", 2);
    const strand = normalize(strandRaw);
    if (parent === "english" && ENGLISH_STRAND_SET.has(strand)) {
      return { scopedSubject: `english:${strand}`, parentSubject: "english", strand };
    }
    return { scopedSubject: raw, parentSubject: parent, strand: strand || null };
  }

  if (ENGLISH_STRAND_SET.has(raw)) {
    return { scopedSubject: `english:${raw}`, parentSubject: "english", strand: raw };
  }

  return { scopedSubject: raw, parentSubject: raw, strand: null };
}

function deriveScopes(selectedSubjects: string[], placementKeys: string[]): ParsedScope[] {
  const out: ParsedScope[] = [];
  const seen = new Set<string>();

  const placementByParent = new Map<string, ParsedScope[]>();
  for (const key of placementKeys) {
    const parsed = parseScopedSubject(key);
    const rows = placementByParent.get(parsed.parentSubject) ?? [];
    rows.push(parsed);
    placementByParent.set(parsed.parentSubject, rows);
  }

  for (const selected of selectedSubjects.map((value) => normalize(value)).filter(Boolean)) {
    if (selected === "english") {
      const scoped = placementByParent.get("english") ?? [];
      const byStrand = new Map(scoped.map((row) => [row.strand ?? "", row]));
      for (const strand of ENGLISH_STRANDS) {
        const key = `english:${strand}`;
        const scope = byStrand.get(strand) ?? { scopedSubject: key, parentSubject: "english", strand };
        if (!seen.has(scope.scopedSubject)) {
          seen.add(scope.scopedSubject);
          out.push(scope);
        }
      }
      continue;
    }

    const parsed = parseScopedSubject(selected);
    if (!seen.has(parsed.scopedSubject)) {
      seen.add(parsed.scopedSubject);
      out.push(parsed);
    }
  }

  for (const key of placementKeys) {
    const parsed = parseScopedSubject(key);
    if (!seen.has(parsed.scopedSubject)) {
      seen.add(parsed.scopedSubject);
      out.push(parsed);
    }
  }

  return out;
}

function levelFromPlacement(level: PlacementLevel): number {
  if (level.level === "advanced") return 4;
  if (level.level === "secure") return 3;
  if (Math.round(level.accuracy) < 30) return 1;
  return 2;
}

function scopeKeywords(scope: ParsedScope): string[] {
  if (scope.parentSubject === "english") {
    const strand = scope.strand ?? "reading";
    if (strand === "comprehension") return ["comprehension", "reading comprehension", "inference", "retrieval"];
    if (strand === "speaking-listening") return ["speaking", "listening", "oracy", "discussion"];
    return [strand, strand.replace("-", " ")];
  }
  if (scope.parentSubject === "maths") return ["math", "maths", "number", "arithmetic"];
  if (scope.parentSubject === "science") return ["science"];
  return [scope.parentSubject, scope.parentSubject.replace("-", " ")];
}

function matchesScope(scope: ParsedScope, value: string | null | undefined): boolean {
  const normalized = normalize(value);
  if (!normalized) return false;

  if (scope.parentSubject === "english") {
    if (scope.strand && (normalized.includes(scope.strand) || normalized.includes(scope.strand.replace("-", " ")))) return true;
    if (scope.strand === "reading" && (normalized.includes("reading") || normalized.includes("comprehension"))) return true;
    if (scope.strand === "spelling" && normalized.includes("spell")) return true;
    if (scope.strand === "phonics" && (normalized.includes("phonics") || normalized.includes("letter sound"))) return true;
    if (scope.strand === "grammar" && (normalized.includes("grammar") || normalized.includes("punctuation"))) return true;
    if (scope.strand === "writing" && normalized.includes("writing")) return true;
    if (scope.strand === "vocabulary" && normalized.includes("vocabulary")) return true;
    if (scope.strand === "speaking-listening" && (normalized.includes("speaking") || normalized.includes("listening") || normalized.includes("oracy"))) return true;
    return false;
  }

  if (scope.parentSubject === "maths") return normalized.includes("math");
  if (scope.parentSubject === "science") return normalized.includes("science");
  return normalized.includes(scope.parentSubject);
}

function parseMetadata(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Ignore malformed metadata.
  }
  return {};
}

function recommendationLabel(scope: ParsedScope): string {
  if (scope.parentSubject !== "english") return titleCase(scope.parentSubject);
  if (!scope.strand) return "English";
  if (scope.strand === "speaking-listening") return "English Speaking & Listening";
  return `English ${titleCase(scope.strand)}`;
}

function toFriendlyText(status: ProgressionStatus): string {
  if (status === "needs_support") return "Catch-up recommended";
  if (status === "developing") return "Keep practising";
  if (status === "on_track") return "You are on track";
  if (status === "secure") return "Almost ready to move up";
  if (status === "ready_to_advance") return "Ready for a challenge";
  if (status === "advanced") return "Ready for a challenge";
  return "Keep practising";
}

function hasMasterySignal(scope: ParsedScope, input: {
  assignments: AssignmentEvidence[];
  progressRecords: ProgressRecordEvidence[];
}): number {
  const assignmentHits = input.assignments.filter((row) => {
    if (!matchesScope(scope, row.contentType) && !matchesScope(scope, row.skillFocus) && !matchesScope(scope, row.topic)) return false;
    const text = `${normalize(row.topic)} ${normalize(row.skillFocus)}`;
    return /mastery|challenge|boss|checkpoint|gate|test/.test(text);
  }).length;

  const progressHits = input.progressRecords.filter((row) => {
    if (!row.completed) return false;
    const text = `${normalize(row.activityType)} ${normalize(row.activityName)}`;
    const scopeMatch = matchesScope(scope, text);
    return scopeMatch && /mastery|challenge|boss|checkpoint|gate|test/.test(text);
  }).length;

  return assignmentHits + progressHits;
}

function averageScore(scores: number[]): number {
  if (!scores.length) return 0;
  const sum = scores.reduce((total, value) => total + value, 0);
  return Math.round(sum / scores.length);
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function shouldFlagCriticalWeakArea(scope: ParsedScope, weak: WeakAreaEvidence): boolean {
  if (normalize(weak.status) !== "active") return false;
  if (!matchesScope(scope, weak.subject) && !matchesScope(scope, weak.skillFocus)) return false;
  return true;
}

function buildGeneratorHint(input: {
  scope: ParsedScope;
  currentLevel: number;
  action: ProgressionAction;
  yearGroup?: string | null;
  keyStage?: string | null;
  placementRecommendations: PlacementRecommendation[];
}): ProgressionGeneratorHint | null {
  const scopeRecommendation = input.placementRecommendations.find((row) => row.scopedSubject === input.scope.scopedSubject);
  const requiresContent = scopeRecommendation?.status === "content_needed" || scopeRecommendation?.status === "blocked";
  if (!requiresContent) return null;
  if (input.action !== "assign_catch_up" && input.action !== "assign_mastery_check" && input.action !== "assign_revision") return null;

  const skillFocus = input.scope.parentSubject === "english"
    ? (input.scope.strand === "speaking-listening" ? "Speaking & Listening" : titleCase(input.scope.strand ?? "reading"))
    : titleCase(input.scope.parentSubject);
  const targetYearGroup = input.currentLevel <= 0
    ? "Reception"
    : `Year ${Math.max(1, Math.min(11, Math.round(input.currentLevel)))}`;

  return {
    subject: input.scope.parentSubject,
    strand: input.scope.strand,
    level: input.currentLevel,
    yearGroup: targetYearGroup,
    keyStage: keyStageForYearGroup(targetYearGroup),
    skillFocus,
    reason: input.action === "assign_mastery_check"
      ? "Mastery-check content is required for this progression decision."
      : "Catch-up or revision content is required for this progression decision.",
  };
}

function actionNextStep(scope: ParsedScope, action: ProgressionAction, level: number): string {
  const label = recommendationLabel(scope);
  if (action === "assign_catch_up") return `Assign ${label} Level ${level} catch-up practice.`;
  if (action === "assign_revision") return `Assign ${label} Level ${level} revision practice.`;
  if (action === "assign_mastery_check") return `Assign ${label} Level ${level} mastery check.`;
  if (action === "recommend_level_up") return `Recommend moving ${label} from Level ${level} to Level ${level + 1}.`;
  if (action === "recommend_admin_review") return `Ask an admin to review ${label} progression evidence.`;
  return `Keep ${label} at Level ${level} and gather more evidence.`;
}

export function buildSubjectLevelProgression(input: ProgressionInput): SubjectProgressionResult {
  const selectedSubjects = input.selectedSubjects.map((value) => normalize(value)).filter(Boolean);
  const scopes = deriveScopes(selectedSubjects, Object.keys(input.placementLevels));
  const placementRecommendations = input.placementRecommendations ?? [];

  const recommendations: SubjectProgressionRecommendation[] = [];

  for (const scope of scopes) {
    const placement = input.placementLevels[scope.scopedSubject]
      ?? input.placementLevels[scope.strand ?? ""]
      ?? input.placementLevels[scope.parentSubject];
    if (!placement) continue;

    const currentLevel = levelFromPlacement(placement);
    const keywords = scopeKeywords(scope);

    const relevantAttempts = input.attempts.filter((row) => {
      if (matchesScope(scope, row.subject) || matchesScope(scope, row.skillFocus)) return true;
      const text = `${normalize(row.subject)} ${normalize(row.skillFocus)}`;
      return keywords.some((keyword) => text.includes(keyword));
    });

    const relevantAssignments = input.assignments.filter((row) => {
      const meta = parseMetadata(row.metadataJson);
      const text = `${normalize(row.contentType)} ${normalize(row.topic)} ${normalize(row.skillFocus)} ${normalize(typeof meta.subject === "string" ? meta.subject : "")} ${normalize(typeof meta.strand === "string" ? meta.strand : "")}`;
      return keywords.some((keyword) => text.includes(keyword)) || matchesScope(scope, text);
    });

    const activeWeakAreas = input.weakAreas.filter((row) => shouldFlagCriticalWeakArea(scope, row));

    const relevantSkills = input.studentSkills.filter((row) => matchesScope(scope, row.skill));

    const relevantProgress = input.progressRecords.filter((row) => {
      const text = `${normalize(row.activityType)} ${normalize(row.activityName)}`;
      return matchesScope(scope, text) || keywords.some((keyword) => text.includes(keyword));
    });

    const completedAssignments = relevantAssignments.filter((row) => normalize(row.status) === "completed").length;
    const completedProgressActivities = relevantProgress.filter((row) => row.completed).length;
    const attemptCount = relevantAttempts.length;
    const activityCount = completedAssignments + completedProgressActivities + attemptCount;

    const attemptScores = relevantAttempts.map((row) => (row.correct ? 100 : 0));
    const progressScores = relevantProgress
      .map((row) => {
        if (typeof row.score === "number") return clamp(row.score);
        if (typeof row.accuracy === "number") return clamp(row.accuracy);
        return null;
      })
      .filter((row): row is number => typeof row === "number");
    const skillScores = relevantSkills.map((row) => clamp(row.accuracy));
    const avgScore = averageScore([...attemptScores, ...progressScores, ...skillScores]);

    const masterySignals = hasMasterySignal(scope, {
      assignments: relevantAssignments,
      progressRecords: relevantProgress,
    });

    const reasons: string[] = [];
    const blockers: string[] = [];

    reasons.push(`Placement indicates Level ${currentLevel} (${placement.level}).`);

    let status: ProgressionStatus = "developing";
    let action: ProgressionAction = "keep_current_level";
    let recommendedLevel = currentLevel;

    const evidenceTooThin = activityCount < 2;

    if (activeWeakAreas.length > 0) {
      status = "needs_support";
      action = "assign_catch_up";
      blockers.push("Active weak areas still need intervention.");
      reasons.push("Weak-area signals indicate catch-up is required before progression.");
    } else if (evidenceTooThin) {
      status = activityCount === 0 ? "review_needed" : "developing";
      action = "keep_current_level";
      blockers.push("Not enough learning evidence yet.");
      reasons.push("Evidence is too thin for a safe progression decision.");
    } else if (avgScore >= 80 && activityCount >= 3) {
      if (placement.level === "advanced") {
        status = "advanced";
        action = "keep_current_level";
        reasons.push("Student is already operating at an advanced placement level.");
      } else if (masterySignals > 0) {
        status = "ready_to_advance";
        action = "recommend_level_up";
        recommendedLevel = currentLevel + 1;
        reasons.push("Strong scores across enough activities and mastery signal present.");
      } else {
        status = "secure";
        action = "assign_mastery_check";
        reasons.push("Strong performance is present; mastery check is needed before level-up.");
      }
    } else if (avgScore >= 70) {
      status = "on_track";
      action = "assign_revision";
      reasons.push("Performance is improving but not yet strong enough for progression.");
    } else if (avgScore >= 55) {
      status = "developing";
      action = "assign_revision";
      reasons.push("Student is developing and needs revision to secure this level.");
    } else {
      status = "needs_support";
      action = "assign_catch_up";
      blockers.push("Average performance is below secure threshold.");
      reasons.push("Additional catch-up is needed before progression decisions.");
    }

    if (activityCount >= 2 && activityCount < 3 && (status === "secure" || status === "ready_to_advance")) {
      status = "on_track";
      action = "assign_revision";
      recommendedLevel = currentLevel;
      blockers.push("More completed activities are needed before level-up.");
      reasons.push("Strong results are present but activity volume is still low.");
    }

    if (status === "ready_to_advance" && activeWeakAreas.length > 0) {
      status = "review_needed";
      action = "recommend_admin_review";
      recommendedLevel = currentLevel;
      blockers.push("Conflicting evidence: strong scores but active weak areas remain.");
      reasons.push("Admin review is required before progression recommendation.");
    }

    const confidence = clamp(
      35
      + Math.min(activityCount, 6) * 7
      + Math.round(avgScore * 0.25)
      - activeWeakAreas.length * 12
      - (blockers.length > 0 ? 8 : 0),
    );

    const generatorHint = buildGeneratorHint({
      scope,
      currentLevel,
      action,
      yearGroup: input.yearGroup,
      keyStage: input.keyStage,
      placementRecommendations,
    });

    recommendations.push({
      scopedSubject: scope.scopedSubject,
      subject: scope.parentSubject === "english" ? "English" : titleCase(scope.parentSubject),
      strand: scope.strand,
      currentLevel,
      recommendedLevel,
      status,
      action,
      confidence,
      evidenceSummary: {
        activityCount,
        completedAssignments,
        attemptCount,
        averageScore: avgScore,
        activeWeakAreas: activeWeakAreas.length,
        masterySignals,
      },
      reasons,
      blockers,
      nextBestStep: actionNextStep(scope, action, currentLevel),
      generatorHint,
    });
  }

  const groupedMap = new Map<string, SubjectProgressionRecommendation[]>();
  for (const recommendation of recommendations) {
    const list = groupedMap.get(recommendation.subject) ?? [];
    list.push(recommendation);
    groupedMap.set(recommendation.subject, list);
  }

  const grouped = Array.from(groupedMap.entries()).map(([label, rows]) => ({
    parentSubject: normalize(label),
    label,
    recommendations: rows,
  }));

  const hasEvidence = recommendations.some((row) => row.evidenceSummary.activityCount > 0);

  return {
    recommendations,
    grouped,
    contentGaps: recommendations.filter((row) => row.generatorHint !== null),
    hasEvidence,
  };
}

export function progressionFriendlyLabel(status: ProgressionStatus): string {
  return toFriendlyText(status);
}
