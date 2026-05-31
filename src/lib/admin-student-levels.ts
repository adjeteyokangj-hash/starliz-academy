export type AdminStudentSnapshotLevels = {
  weakPatterns: string[];
  spellingLevel: number;
  mathLevel: number;
  readingLevel: number;
};

export function deriveAdminStudentSnapshotLevels(
  snapshotJson: string | null | undefined,
  fallbackLevel: number,
): AdminStudentSnapshotLevels {
  let weakPatterns: string[] = [];
  let spellingLevel = fallbackLevel;
  let mathLevel = fallbackLevel;
  let readingLevel = fallbackLevel;

  if (!snapshotJson) {
    return {
      weakPatterns,
      spellingLevel,
      mathLevel,
      readingLevel,
    };
  }

  try {
    const parsed = JSON.parse(snapshotJson) as {
      spellingPatterns?: Record<string, number>;
      adaptive?: {
        spellingDifficulty?: number;
        mathDifficulty?: number;
        readingDifficulty?: number;
      };
    };

    const patterns = parsed.spellingPatterns;
    if (patterns) {
      weakPatterns = Object.entries(patterns)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([key]) => key);
    }

    if (parsed.adaptive) {
      spellingLevel = parsed.adaptive.spellingDifficulty ?? fallbackLevel;
      mathLevel = parsed.adaptive.mathDifficulty ?? fallbackLevel;
      readingLevel = parsed.adaptive.readingDifficulty ?? fallbackLevel;
    }
  } catch {
    // Ignore malformed snapshot JSON and keep safe fallback levels.
  }

  return {
    weakPatterns,
    spellingLevel,
    mathLevel,
    readingLevel,
  };
}
