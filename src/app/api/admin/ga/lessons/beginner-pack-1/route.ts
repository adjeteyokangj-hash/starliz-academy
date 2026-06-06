import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { ensureBeginnerPack1GaLessonDrafts } from "@/lib/ga-lessons";

export async function POST() {
  const { session, response } = await requireAdmin();
  if (!session) return response;
  const results = await ensureBeginnerPack1GaLessonDrafts();
  await writeAuditLog({
    actorUserId: session.userId,
    action: "ga_lesson.beginner_pack_1_prepared",
    entityType: "ga_lesson_pack",
    entityId: "beginner-pack-1",
    metadata: { results },
  });
  return NextResponse.json({ results });
}
