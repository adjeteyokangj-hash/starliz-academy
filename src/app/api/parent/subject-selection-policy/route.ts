import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { prisma } from "@/lib/db";
import { resolveCurrentPricingPlan } from "@/lib/pricing/service";
import { PARENT_SUBJECTS, resolveSubjectSelectionPolicy } from "@/lib/subject-selection";

export async function GET() {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  const subscription = await prisma.subscription.findFirst({
    where: { parentId: parentScope.parentId },
    orderBy: { updatedAt: "desc" },
    select: { pricingPlanId: true, planKey: true },
  });

  const currentPricingPlan = await resolveCurrentPricingPlan({
    pricingPlanId: subscription?.pricingPlanId ?? null,
    legacyPlanKey: subscription?.planKey ?? null,
  });

  const policy = resolveSubjectSelectionPolicy({
    planName: currentPricingPlan?.name ?? subscription?.planKey ?? "free",
    childLimit: currentPricingPlan?.childLimit ?? 1,
  });

  return NextResponse.json({
    ok: true,
    policy,
    subjects: PARENT_SUBJECTS,
    plan: {
      name: currentPricingPlan?.name ?? "Free",
      key: subscription?.planKey ?? "free",
    },
  });
}
