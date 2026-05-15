import { prisma } from "@/lib/db";
import { planKeyFromPricingPlan, resolveCurrentPricingPlan } from "@/lib/pricing/service";
import { addDays, DEFAULT_TRIAL_DAYS, PremiumFeature } from "./plans";

const TRIAL_SESSION_LIMIT = 3;

export type AccessBlockedReason =
  | "NO_SUBSCRIPTION"
  | "EXPIRED"
  | "PAST_DUE"
  | "CANCELLED"
  | "BLOCKED"
  | "CHILD_LIMIT_REACHED"
  | "FEATURE_LOCKED"
  | "TRIAL_LIMIT_REACHED";

export type SubscriptionAccessDecision = {
  allowed: boolean;
  reason?: AccessBlockedReason;
  upgradeRequired: boolean;
  status?: string;
  planKey?: string;
  childrenUsed?: number;
  childrenAllowed?: number;
  trialEndsAt?: string | null;
  currentPeriodEnd?: string | null;
  trialSessionsUsed?: number;
  trialLimit?: number;
  trialSessionsLeft?: number;
  hasPaidSubscription?: boolean;
};

async function getOrCreateSubscription(parentId: string) {
  const [existing, user] = await Promise.all([
    prisma.subscription.findFirst({
      where: { parentId },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.user.findUnique({ where: { id: parentId }, select: { id: true, trialSessionsUsed: true } }),
  ]);
  if (existing) return { subscription: existing, trialSessionsUsed: user?.trialSessionsUsed ?? 0 };

  const subscription = await prisma.subscription.create({
    data: {
      parentId,
      provider: "manual",
      planKey: "free",
      status: "active",
      trialEndsAt: addDays(new Date(), DEFAULT_TRIAL_DAYS),
    },
  });

  return { subscription, trialSessionsUsed: user?.trialSessionsUsed ?? 0 };
}

function statusDecision(subscription: Awaited<ReturnType<typeof getOrCreateSubscription>>["subscription"]): Pick<SubscriptionAccessDecision, "allowed" | "reason"> {
  const now = new Date();
  const status = (subscription.status ?? "active").toLowerCase();

  if (status === "active") return { allowed: true };
  if (status === "trial" || status === "trialing") {
    return !subscription.trialEndsAt || subscription.trialEndsAt >= now ? { allowed: true } : { allowed: false, reason: "EXPIRED" };
  }
  if (status === "past_due") {
    return subscription.graceEndsAt && subscription.graceEndsAt >= now ? { allowed: true } : { allowed: false, reason: "PAST_DUE" };
  }
  if (status === "cancelled") {
    return subscription.currentPeriodEnd && subscription.currentPeriodEnd >= now ? { allowed: true } : { allowed: false, reason: "CANCELLED" };
  }
  if (status === "blocked") return { allowed: false, reason: "BLOCKED" };
  return { allowed: false, reason: "EXPIRED" };
}

async function resolvePlanState(subscription: Awaited<ReturnType<typeof getOrCreateSubscription>>["subscription"]) {
  const currentPlan = await resolveCurrentPricingPlan({
    pricingPlanId: subscription.pricingPlanId,
    legacyPlanKey: subscription.planKey,
  });

  return {
    currentPlan,
    childLimit: currentPlan?.childLimit ?? 1,
    hasPaidSubscription: Boolean(currentPlan && currentPlan.price > 0),
    planKey: currentPlan ? planKeyFromPricingPlan(currentPlan) : (subscription.planKey ?? "free"),
  };
}

async function serializeDecision(
  payload: Awaited<ReturnType<typeof getOrCreateSubscription>>,
  childrenUsed: number,
  override?: Pick<SubscriptionAccessDecision, "allowed" | "reason">,
): Promise<SubscriptionAccessDecision> {
  const subscription = payload.subscription;
  const planState = await resolvePlanState(subscription);
  const trialSessionsUsed = payload.trialSessionsUsed ?? 0;
  const trialSessionsLeft = Math.max(0, TRIAL_SESSION_LIMIT - trialSessionsUsed);
  const status = override ?? statusDecision(subscription);

  return {
    allowed: status.allowed,
    reason: status.reason,
    upgradeRequired: !status.allowed,
    status: subscription.status,
    planKey: planState.planKey,
    childrenUsed,
    childrenAllowed: planState.childLimit,
    trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
    currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
    trialSessionsUsed,
    trialLimit: TRIAL_SESSION_LIMIT,
    trialSessionsLeft,
    hasPaidSubscription: planState.hasPaidSubscription,
  };
}

export async function checkSubscriptionAccess(parentId: string): Promise<SubscriptionAccessDecision> {
  const [subscription, childrenUsed] = await Promise.all([
    getOrCreateSubscription(parentId),
    prisma.childProfile.count({ where: { parentId, archived: false } }),
  ]);
  return await serializeDecision(subscription, childrenUsed);
}

export async function canAddChild(parentId: string): Promise<SubscriptionAccessDecision> {
  const [subscription, childrenUsed] = await Promise.all([
    getOrCreateSubscription(parentId),
    prisma.childProfile.count({ where: { parentId, archived: false } }),
  ]);
  const planState = await resolvePlanState(subscription.subscription);
  const base = statusDecision(subscription.subscription);
  if (!base.allowed) return await serializeDecision(subscription, childrenUsed, base);
  if (childrenUsed >= planState.childLimit) {
    return await serializeDecision(subscription, childrenUsed, { allowed: false, reason: "CHILD_LIMIT_REACHED" });
  }
  return await serializeDecision(subscription, childrenUsed, { allowed: true });
}

export async function canUseFeature(parentId: string, feature: PremiumFeature): Promise<SubscriptionAccessDecision> {
  const [subscription, childrenUsed] = await Promise.all([
    getOrCreateSubscription(parentId),
    prisma.childProfile.count({ where: { parentId, archived: false } }),
  ]);
  const base = statusDecision(subscription.subscription);
  if (!base.allowed) return await serializeDecision(subscription, childrenUsed, base);

  const planState = await resolvePlanState(subscription.subscription);
  if (!planState.hasPaidSubscription && subscription.trialSessionsUsed >= TRIAL_SESSION_LIMIT) {
    return await serializeDecision(subscription, childrenUsed, { allowed: false, reason: "TRIAL_LIMIT_REACHED" });
  }

  const featureTokens = (planState.currentPlan?.features ?? []).map((entry) => entry.toLowerCase());
  const featureSearch = feature.toLowerCase();
  const hasFeatureAccess = feature === "learning"
    ? true
    : featureTokens.some((token) => token.includes(featureSearch) || token.includes(featureSearch.replace("-", " ")));

  if (!hasFeatureAccess) {
    return await serializeDecision(subscription, childrenUsed, { allowed: false, reason: "FEATURE_LOCKED" });
  }
  return await serializeDecision(subscription, childrenUsed, { allowed: true });
}

export function getTrialSessionLimit(): number {
  return TRIAL_SESSION_LIMIT;
}
