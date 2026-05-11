export type SubscriptionPlanKey = "free" | "monthly" | "yearly";
export type PremiumFeature = "learning" | "ai-content" | "reports" | "store";
export type SubscriptionStatus = "active" | "trialing" | "cancelled" | "past_due" | "blocked";

type SubscriptionPlan = {
  key: SubscriptionPlanKey;
  name: string;
  childLimit: number;
  features: PremiumFeature[];
  monthlyPricePence: number;
  yearlyPricePence?: number;
  description: string;
};

export const DEFAULT_TRIAL_DAYS = 14;
export const PAST_DUE_GRACE_DAYS = 7;

export const SUBSCRIPTION_PLANS: Record<SubscriptionPlanKey, SubscriptionPlan> = {
  free: {
    key: "free",
    name: "Free",
    childLimit: 1,
    features: ["learning"],
    monthlyPricePence: 0,
    description: "Great for getting started with one learner.",
  },
  monthly: {
    key: "monthly",
    name: "Monthly",
    childLimit: 4,
    features: ["learning", "store"],
    monthlyPricePence: 1299,
    description: "Flexible monthly access with more learners.",
  },
  yearly: {
    key: "yearly",
    name: "Yearly",
    childLimit: 6,
    features: ["learning", "ai-content", "reports", "store"],
    monthlyPricePence: 1099,
    yearlyPricePence: 12999,
    description: "Best value for families using StarLiz all year.",
  },
};

const LEGACY_PLAN_MAP: Record<string, SubscriptionPlanKey> = {
  trial: "free",
  starter: "monthly",
  family: "yearly",
  premium: "yearly",
  school: "yearly",
};

export function normalizePlanKey(planKey: string | null | undefined): SubscriptionPlanKey {
  const raw = (planKey ?? "free").toLowerCase();
  if (raw in SUBSCRIPTION_PLANS) return raw as SubscriptionPlanKey;
  return LEGACY_PLAN_MAP[raw] ?? "free";
}

export function getPlan(planKey: string | null | undefined): SubscriptionPlan {
  return SUBSCRIPTION_PLANS[normalizePlanKey(planKey)] ?? SUBSCRIPTION_PLANS.free;
}

export function planBadgeText(planKey: string | null | undefined, status: string | null | undefined): string {
  const plan = getPlan(planKey);
  const normalizedStatus = (status ?? "active").toLowerCase();
  if (normalizedStatus === "trialing") return `${plan.name} Trial`;
  if (normalizedStatus === "past_due") return `${plan.name} (Payment Issue)`;
  if (normalizedStatus === "cancelled") return `${plan.name} (Cancelled)`;
  return plan.name;
}

export function listPlans(): SubscriptionPlan[] {
  return [SUBSCRIPTION_PLANS.free, SUBSCRIPTION_PLANS.monthly, SUBSCRIPTION_PLANS.yearly];
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
