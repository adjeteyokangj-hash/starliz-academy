/**
 * Per-student Study Dashboard section visibility + Mastered review policy.
 * Section keys default to false when missing/null so gated blocks stay hidden until admin enables them.
 */

export const STUDENT_DASHBOARD_SECTION_KEYS = [
  "firstLessons",
  "assignedWork",
  "learningTwin",
  "lastSession",
  "prioritySummary",
  "languageAdventure",
  "recoveryPath",
  "weeklyHomework",
  "subjectProgression",
  "certificates",
] as const;

export type StudentDashboardSectionKey = (typeof STUDENT_DASHBOARD_SECTION_KEYS)[number];

export type StudentDashboardSections = Record<StudentDashboardSectionKey, boolean>;

export type MasteredReviewPolicy = {
  /** Days a mastered skill stays in the review pool before it rotates out / is replaced. */
  replaceAfterDays: number;
  /** Max mastered subject sessions offered for review at once. */
  maxSubjectSessions: number;
};

export type StudentDashboardSettings = {
  sections: StudentDashboardSections;
  masteredReview: MasteredReviewPolicy;
};

export const STUDENT_DASHBOARD_SECTION_LABELS: Record<StudentDashboardSectionKey, string> = {
  firstLessons: "Your First Lessons",
  assignedWork: "Assigned Work / Study Tasks",
  learningTwin: "Learning Twin",
  lastSession: "Last Session / Session Insights",
  prioritySummary: "Priority Summary",
  languageAdventure: "Language Adventure",
  recoveryPath: "Recovery Path",
  weeklyHomework: "Weekly Homework Details",
  subjectProgression: "Subject Progression",
  certificates: "Certificates",
};

export const DEFAULT_MASTERED_REVIEW_POLICY: MasteredReviewPolicy = {
  replaceAfterDays: 14,
  maxSubjectSessions: 5,
};

const REPLACE_AFTER_MIN = 1;
const REPLACE_AFTER_MAX = 90;
const MAX_SESSIONS_MIN = 1;
const MAX_SESSIONS_MAX = 10;

export function defaultStudentDashboardSections(): StudentDashboardSections {
  return {
    firstLessons: false,
    assignedWork: false,
    learningTwin: false,
    lastSession: false,
    prioritySummary: false,
    languageAdventure: false,
    recoveryPath: false,
    weeklyHomework: false,
    subjectProgression: false,
    certificates: false,
  };
}

export function defaultStudentDashboardSettings(): StudentDashboardSettings {
  return {
    sections: defaultStudentDashboardSections(),
    masteredReview: { ...DEFAULT_MASTERED_REVIEW_POLICY },
  };
}

function coerceBoolean(value: unknown): boolean {
  return value === true;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function sanitizeMasteredReviewPolicy(
  input: Partial<MasteredReviewPolicy> | null | undefined,
): MasteredReviewPolicy {
  return {
    replaceAfterDays: clampInt(
      input?.replaceAfterDays,
      REPLACE_AFTER_MIN,
      REPLACE_AFTER_MAX,
      DEFAULT_MASTERED_REVIEW_POLICY.replaceAfterDays,
    ),
    maxSubjectSessions: clampInt(
      input?.maxSubjectSessions,
      MAX_SESSIONS_MIN,
      MAX_SESSIONS_MAX,
      DEFAULT_MASTERED_REVIEW_POLICY.maxSubjectSessions,
    ),
  };
}

function parseSectionsFromRecord(record: Record<string, unknown>): StudentDashboardSections {
  const next = defaultStudentDashboardSections();
  for (const key of STUDENT_DASHBOARD_SECTION_KEYS) {
    if (key in record) {
      next[key] = coerceBoolean(record[key]);
    }
  }
  return next;
}

function parseMasteredReviewFromRecord(record: Record<string, unknown>): MasteredReviewPolicy {
  const nested = record.masteredReview;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return sanitizeMasteredReviewPolicy(nested as Partial<MasteredReviewPolicy>);
  }
  return sanitizeMasteredReviewPolicy({
    replaceAfterDays: record.masteredReviewReplaceAfterDays as number | undefined,
    maxSubjectSessions: record.masteredReviewMaxSessions as number | undefined,
  });
}

export function parseStudentDashboardSettings(raw: string | null | undefined): StudentDashboardSettings {
  const defaults = defaultStudentDashboardSettings();
  if (!raw?.trim()) return defaults;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return defaults;
    const record = parsed as Record<string, unknown>;

    // New envelope: { sections, masteredReview }
    if (record.sections && typeof record.sections === "object" && !Array.isArray(record.sections)) {
      return {
        sections: parseSectionsFromRecord(record.sections as Record<string, unknown>),
        masteredReview: parseMasteredReviewFromRecord(record),
      };
    }

    // Legacy flat: section booleans (+ optional masteredReview fields) at top level
    return {
      sections: parseSectionsFromRecord(record),
      masteredReview: parseMasteredReviewFromRecord(record),
    };
  } catch {
    return defaults;
  }
}

/** @deprecated Prefer parseStudentDashboardSettings — kept for callers that only need section flags. */
export function parseStudentDashboardSections(raw: string | null | undefined): StudentDashboardSections {
  return parseStudentDashboardSettings(raw).sections;
}

export function mergeStudentDashboardSections(
  current: StudentDashboardSections,
  patch: Partial<Record<StudentDashboardSectionKey, boolean>>,
): StudentDashboardSections {
  const next = { ...current };
  for (const key of STUDENT_DASHBOARD_SECTION_KEYS) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      next[key] = coerceBoolean(patch[key]);
    }
  }
  return next;
}

export function mergeStudentDashboardSettings(
  current: StudentDashboardSettings,
  patch: {
    sections?: Partial<Record<StudentDashboardSectionKey, boolean>>;
    masteredReview?: Partial<MasteredReviewPolicy>;
  },
): StudentDashboardSettings {
  return {
    sections: patch.sections
      ? mergeStudentDashboardSections(current.sections, patch.sections)
      : current.sections,
    masteredReview: patch.masteredReview
      ? sanitizeMasteredReviewPolicy({ ...current.masteredReview, ...patch.masteredReview })
      : current.masteredReview,
  };
}

export function serializeStudentDashboardSettings(settings: StudentDashboardSettings): string {
  return JSON.stringify({
    ...settings.sections,
    masteredReview: sanitizeMasteredReviewPolicy(settings.masteredReview),
  });
}

/** @deprecated Prefer serializeStudentDashboardSettings */
export function serializeStudentDashboardSections(sections: StudentDashboardSections): string {
  return serializeStudentDashboardSettings({
    sections,
    masteredReview: { ...DEFAULT_MASTERED_REVIEW_POLICY },
  });
}

export type MasteredReviewSkill = {
  skill: string;
  status: string;
  accuracy: number;
  updatedAt?: string | null;
};

/**
 * Active mastered review pool: within replace window, newest first, capped by max sessions.
 */
export function selectMasteredReviewSkills(
  skills: MasteredReviewSkill[],
  policy: MasteredReviewPolicy,
  now = new Date(),
): MasteredReviewSkill[] {
  return selectSkillPoolByStatus(skills, "mastered", policy, now);
}

/** Improving-skill pool — same automatic window / max-session rules as Mastered review. */
export function selectImprovingSkills(
  skills: MasteredReviewSkill[],
  policy: MasteredReviewPolicy,
  now = new Date(),
): MasteredReviewSkill[] {
  return selectSkillPoolByStatus(skills, "improving", policy, now);
}

/** Focus-area (weak) pool — same automatic window / max-session rules as Mastered review. */
export function selectFocusAreaSkills(
  skills: MasteredReviewSkill[],
  policy: MasteredReviewPolicy,
  now = new Date(),
): MasteredReviewSkill[] {
  return selectSkillPoolByStatus(skills, "weak", policy, now);
}

function selectSkillPoolByStatus(
  skills: MasteredReviewSkill[],
  status: string,
  policy: MasteredReviewPolicy,
  now: Date,
): MasteredReviewSkill[] {
  const safe = sanitizeMasteredReviewPolicy(policy);
  const cutoffMs = now.getTime() - safe.replaceAfterDays * 24 * 60 * 60 * 1000;

  return skills
    .filter((row) => row.status === status)
    .filter((row) => {
      if (!row.updatedAt) return true;
      const ts = Date.parse(row.updatedAt);
      if (!Number.isFinite(ts)) return true;
      return ts >= cutoffMs;
    })
    .sort((a, b) => {
      const aTs = a.updatedAt ? Date.parse(a.updatedAt) : 0;
      const bTs = b.updatedAt ? Date.parse(b.updatedAt) : 0;
      return (Number.isFinite(bTs) ? bTs : 0) - (Number.isFinite(aTs) ? aTs : 0);
    })
    .slice(0, safe.maxSubjectSessions);
}

export function masteredReviewDaysRemaining(
  updatedAt: string | null | undefined,
  replaceAfterDays: number,
  now = new Date(),
): number | null {
  if (!updatedAt) return replaceAfterDays;
  const ts = Date.parse(updatedAt);
  if (!Number.isFinite(ts)) return replaceAfterDays;
  const expiresAt = ts + replaceAfterDays * 24 * 60 * 60 * 1000;
  const days = Math.ceil((expiresAt - now.getTime()) / (24 * 60 * 60 * 1000));
  return Math.max(0, days);
}
