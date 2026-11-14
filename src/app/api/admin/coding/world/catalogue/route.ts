import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/api_guard";
import { authoredActivities, releasedActivities } from "@/lib/coding/learning/catalogue";
import { publishedCodingLessons } from "@/lib/coding/catalog";
export async function GET() {
  const { session, response } = await requireAdminPermission("MANAGE_CONTENT"); if (!session) return response;
  const released = new Set(releasedActivities().map(activity => activity.id));
  return NextResponse.json({ lessons: [...publishedCodingLessons().map(lesson => ({ id: lesson.id, kind: "lesson", title: lesson.title, published: true })), ...authoredActivities.map(activity => ({ id: activity.id, kind: "activity", title: activity.title, published: released.has(activity.id) }))] }, { headers: { "Cache-Control": "private, no-store" } });
}
