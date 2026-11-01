import { NextResponse } from "next/server";
import { z } from "zod";
import { saveCodingPlacement } from "@/lib/coding/workspace-store";
import { requireCodingLearner } from "@/lib/coding/student-context";

const bodySchema = z.object({
  answers: z.array(z.object({
    questionId: z.string().trim().min(1),
    choiceId: z.string().trim().min(1),
  })).max(8),
});

export async function POST(request: Request) {
  const { child, response } = await requireCodingLearner();
  if (!child) return response;
  try {
    const body = bodySchema.parse(await request.json());
    const placement = await saveCodingPlacement({
      childId: child.id,
      yearGroup: child.yearGroup,
      answers: body.answers,
    });
    return NextResponse.json({ ok: true, placement });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Placement could not be saved.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
