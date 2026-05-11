export function mergeWeakAreas(existing: string[] | null | undefined, incoming: string[] | null | undefined): string[] {
  const seen = new Set<string>();
  for (const item of existing ?? []) {
    const value = item.trim();
    if (value) seen.add(value);
  }
  for (const item of incoming ?? []) {
    const value = item.trim();
    if (value) seen.add(value);
  }
  return Array.from(seen);
}

export function parseWeakAreaMetadata(metadataJson: string | null | undefined): {
  weakWords: string[];
  weakSkills: string[];
  intervention?: {
    weakSkillDetectedAt?: string;
    weakSkillCode?: string;
    launchedAt?: string;
    completedAt?: string;
    improvementPct?: number;
    baselineAccuracy?: number;
    latestAccuracy?: number;
    mode?: string;
  };
  [key: string]: unknown;
} {
  if (!metadataJson) return { weakWords: [], weakSkills: [] };
  try {
    const parsed = JSON.parse(metadataJson) as {
      weakWords?: unknown;
      weakSkills?: unknown;
      intervention?: unknown;
      [key: string]: unknown;
    };
    return {
      ...parsed,
      weakWords: Array.isArray(parsed.weakWords) ? parsed.weakWords.map(String).filter(Boolean) : [],
      weakSkills: Array.isArray(parsed.weakSkills) ? parsed.weakSkills.map(String).filter(Boolean) : [],
      intervention: parsed.intervention && typeof parsed.intervention === "object"
        ? {
          weakSkillDetectedAt: typeof (parsed.intervention as Record<string, unknown>).weakSkillDetectedAt === "string"
            ? (parsed.intervention as Record<string, unknown>).weakSkillDetectedAt as string
            : undefined,
          weakSkillCode: typeof (parsed.intervention as Record<string, unknown>).weakSkillCode === "string"
            ? (parsed.intervention as Record<string, unknown>).weakSkillCode as string
            : undefined,
          launchedAt: typeof (parsed.intervention as Record<string, unknown>).launchedAt === "string"
            ? (parsed.intervention as Record<string, unknown>).launchedAt as string
            : undefined,
          completedAt: typeof (parsed.intervention as Record<string, unknown>).completedAt === "string"
            ? (parsed.intervention as Record<string, unknown>).completedAt as string
            : undefined,
          improvementPct: typeof (parsed.intervention as Record<string, unknown>).improvementPct === "number"
            ? (parsed.intervention as Record<string, unknown>).improvementPct as number
            : undefined,
          baselineAccuracy: typeof (parsed.intervention as Record<string, unknown>).baselineAccuracy === "number"
            ? (parsed.intervention as Record<string, unknown>).baselineAccuracy as number
            : undefined,
          latestAccuracy: typeof (parsed.intervention as Record<string, unknown>).latestAccuracy === "number"
            ? (parsed.intervention as Record<string, unknown>).latestAccuracy as number
            : undefined,
          mode: typeof (parsed.intervention as Record<string, unknown>).mode === "string"
            ? (parsed.intervention as Record<string, unknown>).mode as string
            : undefined,
        }
        : undefined,
    };
  } catch {
    return { weakWords: [], weakSkills: [] };
  }
}

export function stringifyWeakAreaMetadata(input: {
  weakWords?: string[];
  weakSkills?: string[];
  [key: string]: unknown;
}): string {
  return JSON.stringify({
    ...input,
    weakWords: mergeWeakAreas([], input.weakWords),
    weakSkills: mergeWeakAreas([], input.weakSkills),
  });
}
