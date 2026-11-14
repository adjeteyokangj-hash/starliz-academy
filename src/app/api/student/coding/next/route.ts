import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireCodingLearner } from "@/lib/coding/student-context";
import { publishedCodingLessons } from "@/lib/coding/catalog";
import { releasedActivities } from "@/lib/coding/learning/catalogue";
import { codingActivityProgress } from "@/lib/coding/learning/workspace-store";
import { codingNextStep } from "@/lib/coding/next-step";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const { child, response } = await requireCodingLearner({ bookingId: query.get("bookingId") });
  if (!child) return response;
  const published = publishedCodingLessons();
  const completedId = query.get("completedLessonId");
  const releasedIds = new Set(releasedActivities().map(activity => activity.id));
  const legacyCompletion = published.some(lesson => lesson.id === completedId);
  if (!completedId || !legacyCompletion && !releasedIds.has(completedId)) return NextResponse.json({ error: "Choose a published lesson." }, { status: 404, headers });
  const workspaces = await prisma.codingWorkspace.findMany({ where: { childId: child.id, lessonId: { in: published.map(lesson => lesson.id) } }, select: { lessonId: true, skillStatus: true } });
  if (legacyCompletion && !workspaces.some(row => row.lessonId === completedId && row.skillStatus === "mastered")) return NextResponse.json({ error: "Complete the lesson's mastery checks before continuing." }, { status: 409, headers });
  const progress = await codingActivityProgress(child.id);
  if (!legacyCompletion && !progress.some(activity => activity.id === completedId && activity.status === "mastered")) return NextResponse.json({ error: "Complete the activity's mastery checks before continuing." }, { status: 409, headers });
  // Development QA visibility is not publication. Never recommend QA drafts.
  const released = progress.filter(activity => activity.id !== completedId && releasedIds.has(activity.id)).sort((a, b) => a.year - b.year || a.inventoryId.localeCompare(b.inventoryId, "en", { numeric: true }));
  return NextResponse.json(codingNextStep([
    ...published.filter(lesson => legacyCompletion && lesson.id !== completedId).map(lesson => ({ title: lesson.title, href: `/student/coding/${encodeURIComponent(lesson.id)}`, mastered: workspaces.some(row => row.lessonId === lesson.id && row.skillStatus === "mastered"), unlocked: true })),
    ...released.map(activity => ({ title: activity.title, href: `/student/coding/activities/${encodeURIComponent(activity.id)}`, mastered: activity.status === "mastered", unlocked: activity.unlocked })),
  ]), { headers });
}
