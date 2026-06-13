export type DashboardSummaryAssignment = {
  id: string;
  status: string;
  subject: string;
  title: string;
  href?: string | null;
};

export type DashboardSummarySkill = {
  status: string;
};

export type DashboardSmartCoachInput = {
  skills: DashboardSummarySkill[];
  hasLearningTwinData?: boolean;
  bestExplanationStyle?: string | null;
};

export type DashboardQuickLink = {
  id: string;
  title: string;
  description: string;
  href: string;
};

function normalize(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

export function buildAssignedWorkSummary(assignments: DashboardSummaryAssignment[]) {
  const active = assignments.filter((assignment) => assignment.status !== "completed");
  const next = active[0] ?? assignments[0] ?? null;
  return {
    total: assignments.length,
    active: active.length,
    completed: assignments.filter((assignment) => assignment.status === "completed").length,
    nextTitle: next?.title ?? null,
    nextActivity: next
      ? {
          title: next.title,
          subject: next.subject,
          href: next.href ?? null,
          assignmentId: next.id,
        }
      : null,
  };
}

export function buildSmartCoachSummary(input: DashboardSmartCoachInput) {
  const weakCount = input.skills.filter((skill) => normalize(skill.status) === "weak").length;
  const masteredCount = input.skills.filter((skill) => normalize(skill.status) === "mastered").length;
  const headline = !input.hasLearningTwinData
    ? "Smart Coach is still learning your profile."
    : weakCount > 0
      ? "Smart Coach has support ready for today."
      : masteredCount > 0
        ? "Smart Coach sees strong progress today."
        : input.bestExplanationStyle
          ? `Smart Coach will use ${input.bestExplanationStyle.replaceAll("_", " ")}.`
          : "Smart Coach is ready.";

  return {
    status: input.hasLearningTwinData ? "ready" : "pending",
    headline,
    weakCount,
    masteredCount,
  };
}

export function buildStudentDashboardQuickLinks(): DashboardQuickLink[] {
  return [
    {
      id: "ga-learning-hub",
      title: "Ga Learning Hub",
      description: "Learn new Ga words with friendly flashcards and mini quizzes.",
      href: "/ga-learning-hub",
    },
  ];
}
