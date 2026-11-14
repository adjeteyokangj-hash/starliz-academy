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

/** Count mastered lessons once when the same coding skill is also stored as a skill row. */
export function masteredTotal(
  skills: Array<{ skill: string; status: string }>,
  lessons: CodingDashboardLesson[],
): number {
  const codes = new Set(lessons.map((lesson) => lesson.skillCode));
  const academic = skills.filter((skill) => skill.status === "mastered" && !codes.has(skill.skill)).length;
  return academic + lessons.filter((lesson) => lesson.status === "mastered").length;
}
