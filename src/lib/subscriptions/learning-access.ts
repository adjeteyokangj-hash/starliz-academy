import { NextResponse } from "next/server";
import { canUseFeature, type SubscriptionAccessDecision } from "@/lib/subscriptions/enforcement";
import { prisma } from "@/lib/db";

export type LearningAccessDeps = {
  canUseFeature: typeof canUseFeature;
  getConsentState: (parentId: string) => Promise<{ acceptedAt: Date | null; withdrawnAt: Date | null }>;
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
  deps: LearningAccessDeps = {
    canUseFeature,
    getConsentState: async (id: string) => {
      const user = await prisma.user.findUnique({
        where: { id },
        select: { consentAcceptedAt: true, consentWithdrawnAt: true },
      });
      return {
        acceptedAt: user?.consentAcceptedAt ?? null,
        withdrawnAt: user?.consentWithdrawnAt ?? null,
      };
    },
  },
): Promise<{ decision: SubscriptionAccessDecision; response: NextResponse | null }> {
  const consent = await deps.getConsentState(parentId);
  if (!consent.acceptedAt || Boolean(consent.withdrawnAt)) {
    const decision: SubscriptionAccessDecision = {
      allowed: false,
      reason: "CONSENT_REQUIRED",
      upgradeRequired: false,
      status: "consent_required",
    };
    return {
      decision,
      response: NextResponse.json(
        {
          error: "Parent consent is required before child learning access.",
          code: "CONSENT_REQUIRED",
          access: decision,
        },
        { status: 403 },
      ),
    };
  }

  const decision = await deps.canUseFeature(parentId, "learning");
  if (!decision.allowed) {
    return { decision, response: buildLearningAccessDeniedResponse(decision) };
  }
  return { decision, response: null };
}
