import { prisma } from "@/lib/db";
import { addDays, DEFAULT_TRIAL_DAYS, getPlan, normalizePlanKey, PremiumFeature } from "./plans";

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

function serializeDecision(
  payload: Awaited<ReturnType<typeof getOrCreateSubscription>>,
  childrenUsed: number,
  override?: Pick<SubscriptionAccessDecision, "allowed" | "reason">,
): SubscriptionAccessDecision {
  const subscription = payload.subscription;
  const plan = getPlan(subscription.planKey);
  const hasPaidSubscription = plan.key !== "free";
  const trialSessionsUsed = payload.trialSessionsUsed ?? 0;
  const trialSessionsLeft = Math.max(0, TRIAL_SESSION_LIMIT - trialSessionsUsed);
  const status = override ?? statusDecision(subscription);

  return {
    allowed: status.allowed,
    reason: status.reason,
    upgradeRequired: !status.allowed,
    status: subscription.status,
    planKey: normalizePlanKey(subscription.planKey),
    childrenUsed,
    childrenAllowed: plan.childLimit,
    trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
    currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
    trialSessionsUsed,
    trialLimit: TRIAL_SESSION_LIMIT,
    trialSessionsLeft,
    hasPaidSubscription,
  };
}

export async function checkSubscriptionAccess(parentId: string): Promise<SubscriptionAccessDecision> {
  const [subscription, childrenUsed] = await Promise.all([
    getOrCreateSubscription(parentId),
    prisma.childProfile.count({ where: { parentId, archived: false } }),
  ]);
  return serializeDecision(subscription, childrenUsed);
}

export async function canAddChild(parentId: string): Promise<SubscriptionAccessDecision> {
  const [subscription, childrenUsed] = await Promise.all([
    getOrCreateSubscription(parentId),
    prisma.childProfile.count({ where: { parentId, archived: false } }),
  ]);
  const plan = getPlan(subscription.subscription.planKey);
  const base = statusDecision(subscription.subscription);
  if (!base.allowed) return serializeDecision(subscription, childrenUsed, base);
  if (childrenUsed >= plan.childLimit) {
    return serializeDecision(subscription, childrenUsed, { allowed: false, reason: "CHILD_LIMIT_REACHED" });
  }
  return serializeDecision(subscription, childrenUsed, { allowed: true });
}

export async function canUseFeature(parentId: string, feature: PremiumFeature): Promise<SubscriptionAccessDecision> {
  const [subscription, childrenUsed] = await Promise.all([
    getOrCreateSubscription(parentId),
    prisma.childProfile.count({ where: { parentId, archived: false } }),
  ]);
  const base = statusDecision(subscription.subscription);
  if (!base.allowed) return serializeDecision(subscription, childrenUsed, base);

  const plan = getPlan(subscription.subscription.planKey);
  if (plan.key === "free" && subscription.trialSessionsUsed >= TRIAL_SESSION_LIMIT) {
    return serializeDecision(subscription, childrenUsed, { allowed: false, reason: "TRIAL_LIMIT_REACHED" });
  }
  if (!plan.features.includes(feature)) {
    return serializeDecision(subscription, childrenUsed, { allowed: false, reason: "FEATURE_LOCKED" });
  }
  return serializeDecision(subscription, childrenUsed, { allowed: true });
}

export function getTrialSessionLimit(): number {
  return TRIAL_SESSION_LIMIT;
}
