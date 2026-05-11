import { NextResponse } from "next/server";
import { calculateRewardPoints } from "@/lib/rewards";

export async function POST(request: Request) {
  const body = await request.json();
  const points = calculateRewardPoints(body.reason);

  console.log("[Reward awarded]", {
    childId: body.childId,
    game: body.game,
    reason: body.reason,
    points,
    createdAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, points });
}