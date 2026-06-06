import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { approveGaSongLesson, serializeGaSongLesson } from "@/lib/ga-audio";

const approveSchema = z.object({
  songId: z.string().trim().min(1),
});

export async function POST(request: Request) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  try {
    const body = approveSchema.parse(await request.json());
    const song = await approveGaSongLesson(body.songId, session.userId);
    if (!song) return NextResponse.json({ error: "Ga song lesson not found." }, { status: 404 });
    await writeAuditLog({
      actorUserId: session.userId,
      action: "ga_song_lesson.approved",
      entityType: "ga_song_lesson",
      entityId: song.id,
      metadata: { reviewStatus: song.reviewStatus },
    });
    return NextResponse.json({ item: serializeGaSongLesson(song) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to approve Ga song lesson." }, { status: 400 });
  }
}
