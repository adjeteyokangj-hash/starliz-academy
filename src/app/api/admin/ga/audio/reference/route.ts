import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { createGaPronunciationReference, listGaPronunciationReferences, serializeGaPronunciationReference } from "@/lib/ga-audio";

const createReferenceSchema = z.object({
  referenceType: z.string().trim().min(1),
  sourceUrl: z.string().trim().min(1),
  sourceTitle: z.string().trim().optional().nullable(),
  speakerName: z.string().trim().optional().nullable(),
  channelName: z.string().trim().optional().nullable(),
  timestampStart: z.string().trim().optional().nullable(),
  timestampEnd: z.string().trim().optional().nullable(),
  linkedWordId: z.string().trim().optional().nullable(),
  linkedLessonId: z.string().trim().optional().nullable(),
  linkedLetter: z.string().trim().optional().nullable(),
  linkedSound: z.string().trim().optional().nullable(),
  linkedPhraseText: z.string().trim().optional().nullable(),
  pronunciationNote: z.string().trim().optional().nullable(),
  permissionStatus: z.string().trim().optional().nullable(),
  reviewStatus: z.string().trim().optional().nullable(),
  confidenceLevel: z.number().int().optional().nullable(),
});

export async function GET() {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  const items = await listGaPronunciationReferences();
  return NextResponse.json({ items: items.map(serializeGaPronunciationReference) });
}

export async function POST(request: Request) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  try {
    const body = createReferenceSchema.parse(await request.json());
    const reference = await createGaPronunciationReference(body, session.userId);
    await writeAuditLog({
      actorUserId: session.userId,
      action: "ga_pronunciation_reference.created",
      entityType: "ga_pronunciation_reference",
      entityId: reference.id,
      metadata: { referenceType: reference.referenceType, sourceUrl: reference.sourceUrl, reviewStatus: reference.reviewStatus },
    });
    return NextResponse.json({ item: serializeGaPronunciationReference(reference) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create pronunciation reference." }, { status: 400 });
  }
}
