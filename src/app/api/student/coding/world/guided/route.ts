import { publishedWorldCopy } from "@/lib/coding/world/content";
import { missions } from "@/lib/coding/world/model";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCodingLearner } from "@/lib/coding/student-context";
import { prisma } from "@/lib/db";
import { publishedCodingLessons } from "@/lib/coding/catalog";
import { releasedActivities } from "@/lib/coding/learning/catalogue";
import { codingActivityProgress } from "@/lib/coding/learning/workspace-store";
import { ACTIVITY_VERSION } from "@/lib/coding/learning/types";
import { guidedHref, guidedLocation, recommendGuided, type GuidedEntry } from "@/lib/coding/world/guided-mapping";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  try {
    const query = z.object({ bookingId: z.string().min(1).max(100).optional(), daytimePeriodId: z.string().min(1).max(100).optional() }).strict().parse(Object.fromEntries(new URL(request.url).searchParams));
    const { child, response } = await requireCodingLearner({ bookingId: query.bookingId }); if (!child) return response;
    const lessons = publishedCodingLessons(), released = releasedActivities(), allowed = new Map(released.map(activity => [activity.id, activity]));
    const progress = (await codingActivityProgress(child.id)).filter(activity => allowed.has(activity.id));
    const rows = await prisma.codingWorkspace.findMany({ where: { childId: child.id, lessonId: { in: [...lessons.map(lesson => lesson.id), ...progress.map(activity => `curriculum:${ACTIVITY_VERSION}:${activity.id}`)] } }, select: { lessonId: true, skillStatus: true, stage: true, assignmentStatus: true } });
    const saved = new Map(rows.map(row => [row.lessonId, row]));
    const entries: GuidedEntry[] = [
      ...lessons.map(lesson => ({ id: lesson.id, kind: "lesson" as const, title: lesson.title, objective: lesson.learningObjective, year: lesson.yearMin, location: "robot" as const, status: saved.get(lesson.id)?.skillStatus ?? "not_started", stage: saved.get(lesson.id)?.stage ?? "discover", assignmentStatus: saved.get(lesson.id)?.assignmentStatus ?? "available", unlocked: true, prerequisites: lesson.prerequisites, href: guidedHref("lesson", lesson.id, query) })),
      ...progress.map(activity => ({ id: activity.id, kind: "activity" as const, title: activity.title, objective: activity.objective, year: activity.year, location: guidedLocation(allowed.get(activity.id)!), status: activity.status, stage: activity.stage, assignmentStatus: saved.get(`curriculum:${ACTIVITY_VERSION}:${activity.id}`)?.assignmentStatus ?? "available", unlocked: activity.unlocked, prerequisites: activity.prerequisites, href: guidedHref("activity", activity.id, query) })),
    ];
    const packs = await publishedWorldCopy();
    for (const entry of entries) { const pack = packs.find(pack => pack.metadata?.curriculumLinks.some(link => link.id === entry.id && link.kind === entry.kind)); entry.location = missions.find(mission => mission.id === pack?.missionId)?.location ?? entry.location; }
    return NextResponse.json({ learnerId: child.id, entries, recommendation: recommendGuided(entries, Number(child.yearGroup?.match(/\d+/)?.[0]) || null) }, { headers });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Check the guided lesson request." }, { status: 400, headers });
    return NextResponse.json({ error: "Guided lessons could not be loaded. Existing lesson records remain safe." }, { status: 503, headers });
  }
}
