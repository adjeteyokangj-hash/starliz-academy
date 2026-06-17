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

export type DashboardLanguageModule = {
  id: string;
  language: string;
  title: string;
  description: string;
  href: string;
  activeAssignments: number;
};

export type DashboardAssignedLanguageLesson = {
  assignmentId: string;
  language: string;
  title: string;
  href: string | null;
  status: string;
};

function normalize(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function isAssignmentActive(status: string): boolean {
  const normalized = normalize(status);
  return normalized !== "completed" && normalized !== "archived";
}

function languageFromAssignment(assignment: DashboardSummaryAssignment): string | null {
  const subject = normalize(assignment.subject);
  if (["ga", "french", "spanish", "german", "mandarin", "irish", "welsh"].includes(subject)) {
    return subject;
  }

  const title = normalize(assignment.title);
  if (title.includes(" ga ") || title.startsWith("ga ") || title.endsWith(" ga") || title.includes("ga lesson") || title.includes("ga learning")) {
    return "ga";
  }

  return null;
}

export function buildAssignedWorkSummary(assignments: DashboardSummaryAssignment[]) {
  const active = assignments.filter((assignment) => isAssignmentActive(assignment.status));
  const next = active[0] ?? assignments[0] ?? null;
  return {
    total: assignments.length,
    active: active.length,
    completed: assignments.filter((assignment) => normalize(assignment.status) === "completed").length,
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

export function buildAssignedLanguageLessons(assignments: DashboardSummaryAssignment[]): DashboardAssignedLanguageLesson[] {
  return assignments
    .filter((assignment) => isAssignmentActive(assignment.status))
    .map((assignment) => {
      const language = languageFromAssignment(assignment);
      if (!language) return null;
      return {
        assignmentId: assignment.id,
        language,
        title: assignment.title,
        href: assignment.href ?? null,
        status: assignment.status,
      };
    })
    .filter((item): item is DashboardAssignedLanguageLesson => item !== null);
}

export function buildActiveLanguageModules(assignments: DashboardSummaryAssignment[]): DashboardLanguageModule[] {
  const assignedLanguageLessons = buildAssignedLanguageLessons(assignments);
  if (!assignedLanguageLessons.length) return [];

  const grouped = new Map<string, DashboardAssignedLanguageLesson[]>();
  for (const lesson of assignedLanguageLessons) {
    const rows = grouped.get(lesson.language) ?? [];
    rows.push(lesson);
    grouped.set(lesson.language, rows);
  }

  const modules: DashboardLanguageModule[] = [];
  for (const [language, lessons] of grouped.entries()) {
    if (language === "ga") {
      modules.push({
        id: "ga-learning-hub",
        language,
        title: "Ga Learning Hub",
        description: "Continue your assigned Ga learning path with guided lessons and practice.",
        href: "/ga-learning-hub",
        activeAssignments: lessons.length,
      });
      continue;
    }

    const languageName = language.slice(0, 1).toUpperCase() + language.slice(1);
    modules.push({
      id: `${language}-learning-hub`,
      language,
      title: `${languageName} Learning Hub`,
      description: `Continue your assigned ${languageName} language learning tasks.`,
      href: "/student/dashboard",
      activeAssignments: lessons.length,
    });
  }

  return modules.sort((left, right) => left.title.localeCompare(right.title));
}

export function buildStudentDashboardQuickLinks(): DashboardQuickLink[] {
  return [];
}
