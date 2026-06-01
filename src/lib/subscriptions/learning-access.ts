import { NextResponse } from "next/server";
import { canUseFeature, type SubscriptionAccessDecision } from "@/lib/subscriptions/enforcement";

export type LearningAccessDeps = {
  canUseFeature: typeof canUseFeature;
};

export function buildLearningAccessDeniedResponse(decision: SubscriptionAccessDecision): NextResponse {
  return NextResponse.json(
    {
      error: "Subscription required for learning access.",
      code: decision.reason ?? "FEATURE_LOCKED",
      access: decision,
    },
    { status: 402 },
  );
}

export async function ensureLearningAccess(
  parentId: string,
  deps: LearningAccessDeps = { canUseFeature },
): Promise<{ decision: SubscriptionAccessDecision; response: NextResponse | null }> {
  const decision = await deps.canUseFeature(parentId, "learning");
  if (!decision.allowed) {
    return { decision, response: buildLearningAccessDeniedResponse(decision) };
  }
  return { decision, response: null };
}
