import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { rejectGaSongLesson, serializeGaSongLesson } from "@/lib/ga-audio";

const rejectSchema = z.object({
  songId: z.string().trim().min(1),
  notes: z.string().trim().optional().nullable(),
});

export async function POST(request: Request) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  try {
    const body = rejectSchema.parse(await request.json());
    const song = await rejectGaSongLesson(body.songId, session.userId, body.notes);
    if (!song) return NextResponse.json({ error: "Ga song lesson not found." }, { status: 404 });
    await writeAuditLog({
      actorUserId: session.userId,
      action: "ga_song_lesson.rejected",
      entityType: "ga_song_lesson",
      entityId: song.id,
      metadata: { reviewStatus: song.reviewStatus },
    });
    return NextResponse.json({ item: serializeGaSongLesson(song) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to reject Ga song lesson." }, { status: 400 });
  }
}
