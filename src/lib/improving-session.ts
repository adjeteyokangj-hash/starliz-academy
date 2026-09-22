import {
  DEFAULT_MASTERED_REVIEW_POLICY,
  selectImprovingSkills,
  type MasteredReviewSkill,
} from "@/lib/student-dashboard-sections";

/** Fixed length for Improving boost sessions. */
export const IMPROVING_SESSION_MINUTES = 20;

/** Rough question budget for a 20-minute boost (~2 min per question). */
export const IMPROVING_SESSION_QUESTION_CAP = 10;

export type ImprovingSessionCandidate = {
  id: string;
  status: string;
  title: string;
  subject: string;
  skillFocus: string | null;
  href: string;
  updatedAt: string;
};

/** Client-safe path helper — do not import @/lib/assignments (pulls Prisma/db into the browser). */
export function improvingSessionHref(contentType: string, assignmentId: string): string {
  const normalized = contentType.trim().toLowerCase();
  if (normalized === "ga") {
    return `/ga-learning-hub?assignmentId=${encodeURIComponent(assignmentId)}`;
  }
  const readingTypes = new Set(["reading", "english-language", "english-literature", "gcse-english", "vocabulary"]);
  const lessonTypes = new Set(["lesson", "ai_daily", "daily", "science", "gcse-science", "writing", "grammar", "punctuation"]);
  const mathTypes = new Set(["math", "maths", "times-tables", "gcse-maths", "11-plus-practice", "sats-practice"]);
  const path = lessonTypes.has(normalized)
    ? "/games/lesson"
    : mathTypes.has(normalized)
      ? "/games/math"
      : readingTypes.has(normalized)
        ? "/games/reading"
        : "/games/spelling";
  const params = new URLSearchParams({ assignmentId });
  if (normalized.includes("literature") || normalized.includes("gcse-english")) {
    params.set("mode", "literature");
  }
  return `${path}?${params.toString()}`;
}

function skillDisplayLabel(skill: string): string {
  return skill
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function matchesSkill(assignment: ImprovingSessionCandidate, skillCode: string): boolean {
  const code = skillCode.toLowerCase();
  const label = skillDisplayLabel(code).toLowerCase();
  const focus = (assignment.skillFocus ?? "").toLowerCase();
  const title = assignment.title.toLowerCase();
  const subject = assignment.subject.toLowerCase();
  return (
    focus.includes(code)
    || focus.includes(label)
    || title.includes(code)
    || title.includes(label)
    || subject.includes(code)
    || label.split(" ").some((part) => part.length > 3 && (focus.includes(part) || title.includes(part)))
  );
}

/**
 * Pick the newest in-window improving skill and the best matching assignment.
 * Session is always framed as a 20-minute boost.
 */
export function resolveImprovingBoostSession(input: {
  skills: MasteredReviewSkill[];
  assignments: ImprovingSessionCandidate[];
  now?: Date;
}): {
  skill: MasteredReviewSkill;
  assignment: ImprovingSessionCandidate;
  estimatedMinutes: number;
  questionCap: number;
  href: string;
  label: string;
} | null {
  const pool = selectImprovingSkills(input.skills, DEFAULT_MASTERED_REVIEW_POLICY, input.now ?? new Date());
  if (pool.length === 0) return null;

  const rankedAssignments = [...input.assignments].sort((a, b) => {
    const aActive = a.status === "completed" ? 1 : 0;
    const bActive = b.status === "completed" ? 1 : 0;
    if (aActive !== bActive) return aActive - bActive;
    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  });

  for (const skill of pool) {
    const matched = rankedAssignments.find((assignment) => matchesSkill(assignment, skill.skill));
    if (!matched) continue;
    const baseHref = matched.href || improvingSessionHref(matched.subject, matched.id);
    const url = new URL(baseHref, "https://starliz.local");
    url.searchParams.set("assignmentId", matched.id);
    url.searchParams.set("mode", "improving_boost");
    url.searchParams.set("targetMinutes", String(IMPROVING_SESSION_MINUTES));
    url.searchParams.set("skill", skill.skill);
    return {
      skill,
      assignment: matched,
      estimatedMinutes: IMPROVING_SESSION_MINUTES,
      questionCap: IMPROVING_SESSION_QUESTION_CAP,
      href: `${url.pathname}?${url.searchParams.toString()}`,
      label: skillDisplayLabel(skill.skill),
    };
  }

  return null;
}