export type CodingDashboardLesson = {
  id: string;
  title: string;
  status: string;
  href: string;
  skillCode: string;
};

const SKILL_BY_LESSON: Record<string, string> = {
  "understanding-loops": "coding_loops",
};

export function toCodingDashboardLessons(
  lessons: Array<{ id: string; title: string }>,
  workspaces: Array<{ lessonId: string; skillStatus: string }>,
): CodingDashboardLesson[] {
  return lessons.map((lesson) => {
    const row = workspaces.find((item) => item.lessonId === lesson.id);
    const status = row?.skillStatus || "not_started";
    return {
      id: lesson.id,
      title: lesson.title,
      status,
      href: "/student/coding/" + lesson.id,
      skillCode: SKILL_BY_LESSON[lesson.id] ?? "coding_" + lesson.id,
    };
  });
}

export function toExpandedCodingDashboardLessons(activities: Array<{ id: string; title: string; status: string; year: number; unlocked: boolean }>, yearGroup: string | null): CodingDashboardLesson[] {
  const year = Number(yearGroup?.match(/\d+/)?.[0]);
  if (!Number.isInteger(year) || year < 1 || year > 11) return [];
  return activities.filter(activity => activity.unlocked && activity.year <= year).map(activity => ({
    id: `curriculum:${activity.id}`, title: activity.title, status: activity.status,
    href: `/student/coding/activities/${encodeURIComponent(activity.id)}`, skillCode: `coding_curriculum_${activity.id}`,
  }));
}

/** Count mastered lessons once when the same coding skill is also stored as a skill row. */
export function masteredTotal(
  skills: Array<{ skill: string; status: string }>,
  lessons: CodingDashboardLesson[],
): number {
  const codes = new Set(lessons.map((lesson) => lesson.skillCode));
  const academic = skills.filter((skill) => skill.status === "mastered" && !codes.has(skill.skill)).length;
  return academic + lessons.filter((lesson) => lesson.status === "mastered").length;
}
