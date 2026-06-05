import { ENGLISH_STRANDS } from "@/lib/subject-selection";
import { keyStageForYearGroup, normalizeYearGroup, yearGroupToOrdinal } from "@/lib/curriculum";

export type PlacementBand = "below" | "secure" | "advanced";
export type PlacementRecommendationStatus = "assigned" | "ready" | "content_needed" | "blocked";

export type PlacementLevelInput = {
  accuracy: number;
  level: PlacementBand;
  explicitLearningLevel?: number | null;
  explicitLearningYearGroup?: string | null;
};

export type PlacementContentCandidate = {
  id: string;
  contentType: string;
  level: number;
  status: string;
  topic: string | null;
  skillFocus: string | null;
  yearGroup: string | null;
  keyStage: string | null;
  metadataJson?: string | null;
};

export type PlacementAssignmentCandidate = {
  id: string;
  contentId: string;
  status: string;
  href?: string | null;
};

export type PlacementGeneratorHint = {
  subject: string;
  strand: string | null;
  level: number;
  yearGroup: string | null;
  keyStage: string | null;
  skillFocus: string;
  reason: string;
};

export type PlacementRecommendation = {
  scopedSubject: string;
  parentSubject: string;
  strand: string | null;
  subjectLabel: string;
  strandLabel: string | null;
  status: PlacementRecommendationStatus;
  reason: string;
  accuracy: number;
  levelBand: PlacementBand;
  level: number;
  levelLabel: string;
  contentId: string | null;
  assignmentId: string | null;
  href: string | null;
  contentStatus: string | null;
  generatorHint: PlacementGeneratorHint | null;
};

export type PlacementRecommendationsResult = {
  recommendations: PlacementRecommendation[];
  grouped: Array<{
    parentSubject: string;
    label: string;
    recommendations: PlacementRecommendation[];
  }>;
  contentGaps: PlacementRecommendation[];
};

type SelectorInput = {
  studentId: string;
  selectedSubjects: string[];
  placementLevels: Record<string, PlacementLevelInput>;
  availableContent: PlacementContentCandidate[];
  existingAssignments: PlacementAssignmentCandidate[];
  yearGroup?: string | null;
  keyStage?: string | null;
};

type ParsedScope = {
  scopedSubject: string;
  parentSubject: string;
  strand: string | null;
};

const READY_STATUSES = new Set(["reviewed", "approved", "published"]);
const ENGLISH_STRAND_SET: Set<string> = new Set(ENGLISH_STRANDS);

function hrefForContentType(contentType: string, assignmentId?: string | null): string {
  const normalized = contentType.trim().toLowerCase();
  const readingTypes = new Set(["reading", "english-language", "english-literature", "gcse-english", "vocabulary"]);
  const lessonTypes = new Set(["lesson", "ai_daily", "daily", "science", "gcse-science"]);
  const mathTypes = new Set(["math", "maths", "times-tables", "gcse-maths", "11-plus-practice", "sats-practice"]);
  const path = lessonTypes.has(normalized)
    ? "/games/lesson"
    : mathTypes.has(normalized)
      ? "/games/math"
      : readingTypes.has(normalized)
        ? "/games/reading"
        : "/games/spelling";
  if (!assignmentId) return path;
  const params = new URLSearchParams({ assignmentId });
  return `${path}?${params.toString()}`;
}

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
      return {
        scopedSubject: `english:${strand}`,
        parentSubject: "english",
        strand,
      };
    }
    return {
      scopedSubject: raw,
      parentSubject: parent,
      strand: strand || null,
    };
  }

  if (ENGLISH_STRAND_SET.has(raw as (typeof ENGLISH_STRANDS)[number])) {
    return {
      scopedSubject: `english:${raw}`,
      parentSubject: "english",
      strand: raw,
    };
  }

  return {
    scopedSubject: raw,
    parentSubject: raw,
    strand: null,
  };
}

function parentLabel(parentSubject: string): string {
  if (parentSubject === "pe-health") return "PE / Health";
  if (parentSubject === "citizenship-pshe") return "Citizenship / PSHE";
  return titleCase(parentSubject);
}

function strandLabel(strand: string | null): string | null {
  if (!strand) return null;
  if (strand === "speaking-listening") return "Speaking & Listening";
  return titleCase(strand);
}

function cohortFallbackLevel(studentYearGroup: string | null | undefined): number {
  const cohortOrdinal = yearGroupToOrdinal(normalizeYearGroup(studentYearGroup));
  if (cohortOrdinal === null) return 2;
  return Math.max(1, cohortOrdinal - 1);
}

function explicitLearningLevel(input: PlacementLevelInput): number | null {
  if (typeof input.explicitLearningLevel === "number" && Number.isFinite(input.explicitLearningLevel)) {
    return Math.max(1, Math.min(11, Math.round(input.explicitLearningLevel)));
  }
  const explicitOrdinal = yearGroupToOrdinal(normalizeYearGroup(input.explicitLearningYearGroup));
  if (explicitOrdinal !== null) return Math.max(1, explicitOrdinal);
  return null;
}

function levelFromPlacement(input: PlacementLevelInput, studentYearGroup?: string | null): { numeric: number; label: string } {
  const accuracy = Math.max(0, Math.min(100, Math.round(input.accuracy)));
  if (input.level === "advanced") return { numeric: 4, label: "Advanced" };
  if (input.level === "secure") return { numeric: 3, label: "Expected" };
  const explicitLevel = explicitLearningLevel(input);
  if (explicitLevel !== null) return { numeric: explicitLevel, label: "Developing" };
  if (accuracy < 30) return { numeric: 1, label: "Foundation" };
  const fallback = cohortFallbackLevel(studentYearGroup);
  if (fallback <= 1) return { numeric: fallback, label: "Foundation" };
  return { numeric: fallback, label: "Developing" };
}

function desiredDifficulty(placementLevel: number): number {
  if (placementLevel >= 4) return 5;
  if (placementLevel === 3) return 4;
  if (placementLevel === 2) return 3;
  return 2;
}

function yearGroupFromPlacementLevel(level: number): string | null {
  if (!Number.isFinite(level)) return null;
  const rounded = Math.max(0, Math.min(11, Math.round(level)));
  if (rounded === 0) return "Reception";
  return `Year ${rounded}`;
}

function keywordBundle(scope: ParsedScope): string[] {
  if (scope.parentSubject === "english") {
    const strand = scope.strand ?? "reading";
    if (strand === "comprehension") return ["comprehension", "reading comprehension", "inference", "retrieval"];
    if (strand === "speaking-listening") return ["speaking", "listening", "oracy", "discussion"];
    return [strand.replace("-", " "), strand];
  }
  if (scope.parentSubject === "maths") return ["math", "maths", "number", "arithmetic"];
  if (scope.parentSubject === "science") return ["science"];
  return [scope.parentSubject.replace("-", " "), scope.parentSubject];
}

function preferredContentTypes(scope: ParsedScope): string[] {
  if (scope.parentSubject === "maths") return ["math", "maths"];
  if (scope.parentSubject === "science") return ["science", "lesson"];
  if (scope.parentSubject !== "english") return [scope.parentSubject];

  const strand = scope.strand;
  if (strand === "spelling" || strand === "phonics") return ["spelling", "reading"];
  if (strand === "reading" || strand === "comprehension" || strand === "vocabulary") return ["reading", "spelling"];
  return ["reading", "spelling"];
}

function parseMetadata(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Ignore invalid metadata payloads.
  }
  return {};
}

function contentMatchScore(input: {
  scope: ParsedScope;
  content: PlacementContentCandidate;
  targetDifficulty: number;
  yearGroup?: string | null;
  keyStage?: string | null;
}): { score: number; typeMatch: boolean; keywordHits: number } {
  const contentType = normalize(input.content.contentType);
  const meta = parseMetadata(input.content.metadataJson);
  const preferredTypes = preferredContentTypes(input.scope);
  const keywords = keywordBundle(input.scope);
  const textHaystack = [
    input.content.topic,
    input.content.skillFocus,
    typeof meta.subject === "string" ? meta.subject : "",
    typeof meta.strand === "string" ? meta.strand : "",
    typeof meta.module === "string" ? meta.module : "",
    typeof meta.generationType === "string" ? meta.generationType : "",
  ].map((value) => normalize(value)).join(" ");

  let score = 0;

  const typeMatch = preferredTypes.includes(contentType);
  if (typeMatch) score += 40;
  if (input.yearGroup && normalize(input.content.yearGroup) === normalize(input.yearGroup)) score += 25;
  if (input.keyStage && normalize(input.content.keyStage) === normalize(input.keyStage)) score += 15;
  if (READY_STATUSES.has(normalize(input.content.status))) score += 10;

  const keywordHits = keywords.filter((keyword) => textHaystack.includes(normalize(keyword))).length;
  score += keywordHits * 10;

  const difficultyGap = Math.abs((input.content.level ?? input.targetDifficulty) - input.targetDifficulty);
  score += Math.max(0, 15 - difficultyGap * 4);

  return { score, typeMatch, keywordHits };
}

function reasonForContentNeeded(scope: ParsedScope): string {
  if (scope.parentSubject === "english" && scope.strand) {
    return `${strandLabel(scope.strand)} placement needs a generated lesson.`;
  }
  return `${parentLabel(scope.parentSubject)} placement needs a generated lesson.`;
}

function reasonForBlocked(status: string): string {
  const normalized = normalize(status);
  if (!normalized) return "Matching content exists but is not assignable yet.";
  return `Matching content exists but is ${normalized}. Review to assign.`;
}

function generatorHintForScope(input: {
  scope: ParsedScope;
  level: number;
}): PlacementGeneratorHint {
  const focus = input.scope.parentSubject === "english"
    ? (input.scope.strand === "comprehension" ? "Reading comprehension" : titleCase((input.scope.strand ?? "reading").replace("-", " ")))
    : parentLabel(input.scope.parentSubject);
  const targetLearningYearGroup = yearGroupFromPlacementLevel(input.level);
  const targetLearningKeyStage = targetLearningYearGroup ? keyStageForYearGroup(targetLearningYearGroup) : null;
  return {
    subject: input.scope.parentSubject,
    strand: input.scope.strand,
    level: input.level,
    yearGroup: targetLearningYearGroup,
    keyStage: targetLearningKeyStage,
    skillFocus: focus,
    reason: "No reviewed/published content currently matches this placement target.",
  };
}

function deriveScopes(selectedSubjects: string[], placementKeys: string[]): ParsedScope[] {
  const seen = new Set<string>();
  const out: ParsedScope[] = [];

  const placementByParent = new Map<string, ParsedScope[]>();
  for (const key of placementKeys) {
    const parsed = parseScopedSubject(key);
    const list = placementByParent.get(parsed.parentSubject) ?? [];
    list.push(parsed);
    placementByParent.set(parsed.parentSubject, list);
  }

  for (const subject of selectedSubjects.map((value) => normalize(value)).filter(Boolean)) {
    if (subject === "english") {
      const levelScopes = placementByParent.get("english") ?? [];
      const byStrand = new Map(levelScopes.map((scope) => [scope.strand ?? "", scope]));
      for (const strand of ENGLISH_STRANDS) {
        const scope = byStrand.get(strand) ?? { scopedSubject: `english:${strand}`, parentSubject: "english", strand };
        if (!seen.has(scope.scopedSubject)) {
          seen.add(scope.scopedSubject);
          out.push(scope);
        }
      }
      continue;
    }

    const scoped = parseScopedSubject(subject);
    if (!seen.has(scoped.scopedSubject)) {
      seen.add(scoped.scopedSubject);
      out.push(scoped);
    }
  }

  for (const key of placementKeys) {
    const scoped = parseScopedSubject(key);
    if (!seen.has(scoped.scopedSubject)) {
      seen.add(scoped.scopedSubject);
      out.push(scoped);
    }
  }

  return out;
}

export function selectPlacementLessons(input: SelectorInput): PlacementRecommendationsResult {
  const selectedSubjects = input.selectedSubjects.map((value) => normalize(value)).filter(Boolean);
  const scopes = deriveScopes(selectedSubjects, Object.keys(input.placementLevels));
  const assignmentsByContentId = new Map(input.existingAssignments.map((assignment) => [assignment.contentId, assignment]));

  const recommendations: PlacementRecommendation[] = [];

  for (const scope of scopes) {
    const placement = input.placementLevels[scope.scopedSubject] ?? input.placementLevels[scope.strand ?? ""] ?? input.placementLevels[scope.parentSubject];
    if (!placement) continue;

    const accuracy = Math.max(0, Math.min(100, Math.round(placement.accuracy)));
    const levelInfo = levelFromPlacement(placement, input.yearGroup);
    const targetDifficulty = desiredDifficulty(levelInfo.numeric);

    const rankedCandidates = [...input.availableContent]
      .map((content) => ({
        content,
        match: contentMatchScore({
          scope,
          content,
          targetDifficulty,
          yearGroup: input.yearGroup,
          keyStage: input.keyStage,
        }),
      }))
      .filter((row) => row.match.score >= 45 && (row.match.typeMatch || row.match.keywordHits > 0))
      .sort((a, b) => b.match.score - a.match.score);

    const best = rankedCandidates[0]?.content ?? null;
    const assignment = best ? assignmentsByContentId.get(best.id) ?? null : null;
    const bestStatus = normalize(best?.status);
    const readyForAssignment = best ? READY_STATUSES.has(bestStatus) : false;

    if (!best) {
      recommendations.push({
        scopedSubject: scope.scopedSubject,
        parentSubject: scope.parentSubject,
        strand: scope.strand,
        subjectLabel: parentLabel(scope.parentSubject),
        strandLabel: strandLabel(scope.strand),
        status: "content_needed",
        reason: reasonForContentNeeded(scope),
        accuracy,
        levelBand: placement.level,
        level: levelInfo.numeric,
        levelLabel: levelInfo.label,
        contentId: null,
        assignmentId: null,
        href: null,
        contentStatus: null,
        generatorHint: generatorHintForScope({
          scope,
          level: levelInfo.numeric,
        }),
      });
      continue;
    }

    if (!readyForAssignment) {
      recommendations.push({
        scopedSubject: scope.scopedSubject,
        parentSubject: scope.parentSubject,
        strand: scope.strand,
        subjectLabel: parentLabel(scope.parentSubject),
        strandLabel: strandLabel(scope.strand),
        status: "blocked",
        reason: reasonForBlocked(best.status),
        accuracy,
        levelBand: placement.level,
        level: levelInfo.numeric,
        levelLabel: levelInfo.label,
        contentId: best.id,
        assignmentId: null,
        href: null,
        contentStatus: best.status,
        generatorHint: null,
      });
      continue;
    }

    recommendations.push({
      scopedSubject: scope.scopedSubject,
      parentSubject: scope.parentSubject,
      strand: scope.strand,
      subjectLabel: parentLabel(scope.parentSubject),
      strandLabel: strandLabel(scope.strand),
      status: assignment ? "assigned" : "ready",
      reason: assignment
        ? "Lesson already assigned and ready to start."
        : "Lesson is ready to assign from reviewed content.",
      accuracy,
      levelBand: placement.level,
      level: levelInfo.numeric,
      levelLabel: levelInfo.label,
      contentId: best.id,
      assignmentId: assignment?.id ?? null,
      href: assignment?.href ?? hrefForContentType(best.contentType, assignment?.id),
      contentStatus: best.status,
      generatorHint: null,
    });
  }

  const groupedMap = new Map<string, PlacementRecommendation[]>();
  for (const recommendation of recommendations) {
    const list = groupedMap.get(recommendation.parentSubject) ?? [];
    list.push(recommendation);
    groupedMap.set(recommendation.parentSubject, list);
  }

  const grouped = Array.from(groupedMap.entries()).map(([parentSubject, rows]) => ({
    parentSubject,
    label: parentLabel(parentSubject),
    recommendations: rows,
  }));

  return {
    recommendations,
    grouped,
    contentGaps: recommendations.filter((row) => row.status === "content_needed"),
  };
}
