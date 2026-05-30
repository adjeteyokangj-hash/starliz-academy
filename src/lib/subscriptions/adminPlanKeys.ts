export type AdminPlanKey = "free" | "starter" | "standard" | "pro" | "enterprise";

type PricingPlanShape = {
  name?: string | null;
  interval?: string | null;
  audience?: string | null;
};

function normalizeRaw(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

export function normalizeAdminPlanKey(value: string | null | undefined): AdminPlanKey {
  const raw = normalizeRaw(value);
  if (!raw || raw === "free" || raw === "trial") return "free";

  const token = raw.startsWith("pricing:") ? raw.slice("pricing:".length) : raw;

  if (token.includes("starter")) return "starter";
  if (token === "standard" || token === "monthly" || token.includes("standard")) return "standard";
  if (
    token === "pro"
    || token === "yearly"
    || token === "family"
    || token === "premium"
    || token.includes("pro")
    || token.includes("annual")
    || token.includes("year")
  ) return "pro";
  if (
    token.includes("enterprise")
    || token.includes("custom")
    || token.includes("school")
    || token.includes("organisation")
  ) return "enterprise";

  return "free";
}

export function adminPlanKeyFromPricingPlan(plan: PricingPlanShape | null | undefined): AdminPlanKey {
  if (!plan) return "free";

  const byName = normalizeAdminPlanKey(plan.name ?? null);
  if (byName !== "free") return byName;

  const interval = normalizeRaw(plan.interval);
  const audience = normalizeRaw(plan.audience);

  if (interval === "year") return "pro";
  if (interval === "custom" || audience === "school" || audience === "organisation") return "enterprise";
  if (audience === "individual") return "starter";
  if (audience === "family") return "standard";

  return "free";
}

export function toStoredPlanKey(adminPlanKey: AdminPlanKey): string {
  if (adminPlanKey === "standard") return "monthly";
  if (adminPlanKey === "pro") return "yearly";
  if (adminPlanKey === "enterprise") return "enterprise_custom";
  return adminPlanKey;
}
