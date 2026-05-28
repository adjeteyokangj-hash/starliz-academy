import type { QuickLevelFinderBaselineDiagnostic, QuickLevelFinderLevel } from "@/lib/academic-intelligence/types";

function parseObject(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

function asLevel(value: unknown): QuickLevelFinderLevel | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const accuracyRaw = row.accuracy;
  const levelRaw = row.level;
  if (levelRaw !== "below" && levelRaw !== "secure" && levelRaw !== "advanced") return null;
  if (typeof accuracyRaw !== "number" || !Number.isFinite(accuracyRaw)) return null;
  return {
    accuracy: Math.max(0, Math.min(100, Math.round(accuracyRaw))),
    level: levelRaw,
  };
}

function parseLevels(value: unknown): Record<string, QuickLevelFinderLevel> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, QuickLevelFinderLevel> = {};
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = rawKey.trim().toLowerCase();
    if (!key) continue;
    const level = asLevel(rawValue);
    if (!level) continue;
    out[key] = level;
  }
  return out;
}

function sortSubjects(
  subjects: Array<{ subject: string; accuracy: number; level: QuickLevelFinderLevel["level"] }>,
): Array<{ subject: string; accuracy: number; level: QuickLevelFinderLevel["level"] }> {
  return subjects.sort((left, right) => left.subject.localeCompare(right.subject));
}

function sortStrands(
  strands: Array<{ strand: string; accuracy: number; level: QuickLevelFinderLevel["level"] }>,
): Array<{ strand: string; accuracy: number; level: QuickLevelFinderLevel["level"] }> {
  return strands.sort((left, right) => left.strand.localeCompare(right.strand));
}

export function parseQuickLevelFinderBaselineDiagnostic(
  profileJson: string | null | undefined,
): QuickLevelFinderBaselineDiagnostic | null {
  const profile = parseObject(profileJson);
  if (!profile) return null;

  const quick = profile.quickLevelFinder;
  if (!quick || typeof quick !== "object" || Array.isArray(quick)) return null;
  const quickSession = quick as Record<string, unknown>;

  const status = quickSession.status;
  if (status !== "completed") return null;

  const levels = parseLevels(quickSession.levels);
  if (Object.keys(levels).length === 0) return null;

  const completedAt = typeof quickSession.completedAt === "string" && quickSession.completedAt.trim()
    ? quickSession.completedAt
    : new Date().toISOString();

  const firstQuestion = Array.isArray(quickSession.questions) && quickSession.questions.length > 0
    ? quickSession.questions[0]
    : null;
  const firstQuestionObj = firstQuestion && typeof firstQuestion === "object" && !Array.isArray(firstQuestion)
    ? firstQuestion as Record<string, unknown>
    : null;

  const yearGroup = typeof firstQuestionObj?.yearGroup === "string" && firstQuestionObj.yearGroup.trim()
    ? firstQuestionObj.yearGroup
    : null;
  const keyStage = typeof firstQuestionObj?.keyStage === "string" && firstQuestionObj.keyStage.trim()
    ? firstQuestionObj.keyStage
    : null;

  const parentSubjectScores = sortSubjects(
    Object.entries(levels)
      .filter(([key]) => !key.includes(":"))
      .map(([subject, level]) => ({
        subject,
        accuracy: level.accuracy,
        level: level.level,
      })),
  );

  const englishStrandScores = sortStrands(
    Object.entries(levels)
      .filter(([key]) => key.startsWith("english:"))
      .map(([key, level]) => ({
        strand: key.replace("english:", ""),
        accuracy: level.accuracy,
        level: level.level,
      })),
  );

  return {
    completedAt,
    yearGroup,
    keyStage,
    confidenceLabel: "baseline_placement_signal",
    parentSubjectScores,
    englishStrandScores,
  };
}
