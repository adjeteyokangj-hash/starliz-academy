import { prisma } from "@/lib/db";
import { getNextShortLearningBookingForChild } from "@/lib/schools/short-learning-bookings";
import {
  buildActiveLanguageModules,
  buildAssignedLanguageLessons,
  buildAssignedWorkSummary,
  buildSmartCoachSummary,
} from "@/lib/student-dashboard-summary";

function assignmentHref(contentType: string, assignmentId: string): string {
  const normalized = contentType.trim().toLowerCase();
  if (normalized === "ga") {
    return `/ga-learning-hub?assignmentId=${encodeURIComponent(assignmentId)}`;
  }
  const path = ["lesson", "ai_daily", "daily", "science", "gcse-science", "writing", "grammar", "punctuation"].includes(normalized)
    ? "/games/lesson"
    : ["math", "maths", "times-tables", "gcse-maths", "11-plus-practice", "sats-practice"].includes(normalized)
      ? "/games/math"
      : ["reading", "english-language", "english-literature", "gcse-english", "vocabulary"].includes(normalized)
        ? "/games/reading"
        : "/games/spelling";
  const params = new URLSearchParams({ assignmentId });
  if (normalized.includes("literature") || normalized.includes("gcse-english")) params.set("mode", "literature");
  return `${path}?${params.toString()}`;
}

export async function getStudentDashboardShell(studentId: string) {
  const [assignmentRows, skills, nextShortLearning] = await Promise.all([
    prisma.assignment.findMany({
      where: {
        studentId,
        status: { not: "archived" },
        content: {
          NOT: { createdBy: "auto_lesson_engine" },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: {
        id: true,
        status: true,
        contentId: true,
        updatedAt: true,
        content: {
          select: {
            contentType: true,
            topic: true,
            skillFocus: true,
            level: true,
          },
        },
      },
    }),
    prisma.studentSkill.findMany({
      where: { studentId },
      orderBy: [{ updatedAt: "desc" }, { accuracy: "asc" }],
      take: 40,
      select: {
        skill: true,
        status: true,
        accuracy: true,
        updatedAt: true,
      },
    }),
    getNextShortLearningBookingForChild(studentId),
  ]);

  const assignments = assignmentRows.map((assignment) => ({
    id: assignment.id,
    status: assignment.status,
    subject: assignment.content.contentType,
    contentId: assignment.contentId,
    title: assignment.content.topic || assignment.content.skillFocus || assignment.content.contentType,
    skillFocus: assignment.content.skillFocus,
    difficulty: assignment.content.level,
    href: assignmentHref(assignment.content.contentType, assignment.id),
    updatedAt: assignment.updatedAt.toISOString(),
  }));
  const assignedWork = buildAssignedWorkSummary(assignments);
  const skillRows = skills.map((row) => ({
    skill: row.skill,
    status: row.status,
    accuracy: row.accuracy,
    updatedAt: row.updatedAt.toISOString(),
  }));

  return {
    assignments,
    skills: skillRows,
    activeLanguageModules: buildActiveLanguageModules(assignments),
    assignedLanguageLessons: buildAssignedLanguageLessons(assignments),
    assignedWork,
    smartCoach: buildSmartCoachSummary({ skills: skillRows }),
    nextShortLearning,
  };
}
