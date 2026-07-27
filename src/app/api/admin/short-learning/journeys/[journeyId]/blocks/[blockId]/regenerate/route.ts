import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/api_guard";
import { regenerateShortLearningJourneyBlock } from "@/lib/schools/short-learning-journey";

type Context = { params: Promise<{ journeyId: string; blockId: string }> };

const bodySchema = z.object({
  schoolId: z.string().min(1),
});

export async function POST(request: Request, context: Context) {
  const { session, response } = await requireAdminPermission("MANAGE_CONTENT");
  if (!session) return response!;
  const { journeyId, blockId } = await context.params;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const block = await regenerateShortLearningJourneyBlock({
      journeyId,
      blockId,
      schoolId: body.schoolId,
      actorUserId: session.userId,
    });
    return NextResponse.json({ ok: true, block });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Regeneration failed." },
      { status: 400 },
    );
  }
}
