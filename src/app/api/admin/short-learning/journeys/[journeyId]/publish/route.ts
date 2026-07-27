import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/api_guard";
import { publishShortLearningJourney } from "@/lib/schools/short-learning-journey";

type Context = { params: Promise<{ journeyId: string }> };

const bodySchema = z.object({
  schoolId: z.string().min(1),
});

export async function POST(request: Request, context: Context) {
  const { session, response } = await requireAdminPermission("APPROVE_CONTENT");
  if (!session) return response!;
  const { journeyId } = await context.params;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const result = await publishShortLearningJourney({
      journeyId,
      schoolId: body.schoolId,
      actorUserId: session.userId,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: "Publish rejected.", failures: result.failures, journey: result.journey },
        { status: 422 },
      );
    }
    return NextResponse.json({ ok: true, journey: result.journey });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Publish failed." },
      { status: 500 },
    );
  }
}
