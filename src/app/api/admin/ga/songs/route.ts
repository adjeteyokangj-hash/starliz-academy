import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { createGaSongLesson, getGaSongAudioReadiness, listGaSongLessons, serializeGaSongLesson } from "@/lib/ga-audio";

const createSongSchema = z.object({
  title: z.string().trim().min(1),
  level: z.string().trim().min(1),
  category: z.string().trim().min(1),
  lyricsGa: z.string().trim().min(1),
  lyricsEnglish: z.string().trim().optional().nullable(),
  wordIdsUsed: z.array(z.string().trim()).optional(),
  sourceType: z.string().trim().optional().nullable(),
});

export async function GET() {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  const items = await listGaSongLessons();
  return NextResponse.json({
    items: items.map((song) => ({
      ...serializeGaSongLesson(song),
      audioReadiness: getGaSongAudioReadiness(song),
    })),
  });
}

export async function POST(request: Request) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  try {
    const body = createSongSchema.parse(await request.json());
    const song = await createGaSongLesson(body, session.userId);
    if (!song) throw new Error("Unable to create Ga song lesson.");
    await writeAuditLog({
      actorUserId: session.userId,
      action: "ga_song_lesson.created",
      entityType: "ga_song_lesson",
      entityId: song.id,
      metadata: { title: song.title, reviewStatus: song.reviewStatus, flaggedWords: song.unapprovedWordsFlagged.length },
    });
    return NextResponse.json({
      item: {
        ...serializeGaSongLesson(song),
        audioReadiness: getGaSongAudioReadiness(song),
      },
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create Ga song lesson." }, { status: 400 });
  }
}
