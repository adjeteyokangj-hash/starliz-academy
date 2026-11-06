import { prisma } from "@/lib/db";
import { requireCodingLearner } from "./student-context";
import { publishedCodingLessons } from "./catalog";
import { codingActivityProgress } from "./learning/workspace-store";
import { releasedActivities } from "./learning/catalogue";
import { toCodingDashboardLessons, toExpandedCodingDashboardLessons, type CodingDashboardLesson } from "./dashboard-lessons";

export async function accessibleCodingDashboardLessons(studentId: string): Promise<CodingDashboardLesson[]> {
  const { child } = await requireCodingLearner();
  if (!child || child.id !== studentId) return [];
  const published = new Set(releasedActivities().map(activity => activity.id));
  const progress = published.size ? await codingActivityProgress(child.id) : [];
  const expanded = toExpandedCodingDashboardLessons(progress.filter(activity => published.has(activity.id)), child.yearGroup);
  const legacy = publishedCodingLessons();
  const rows = await prisma.codingWorkspace.findMany({ where: { childId: child.id, lessonId: { in: legacy.map(lesson => lesson.id) } }, select: { lessonId: true, skillStatus: true } });
  // Keep the original experience for its existing users or where no expanded
  // curriculum is published. It is never counted as another curriculum item.
  const year = Number(child.yearGroup?.match(/\d+/)?.[0]);
  const original = legacy.filter(lesson => rows.some(row => row.lessonId === lesson.id) || !published.size && year >= lesson.yearMin && year <= lesson.yearMax);
  return [...expanded, ...toCodingDashboardLessons(original, rows).map(lesson => ({ ...lesson, title: `${lesson.title} · original experience` }))];
}
