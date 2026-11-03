import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resolveCurrentPricingPlan } from "@/lib/pricing/service";

/** Legacy whole-learning plans retain access; an explicit lab list is authoritative. */
export function labIncluded(features: unknown, lab = "coding"): boolean {
  if (!features || typeof features !== "object" || Array.isArray(features) || !("labs" in features)) return true;
  const labs = (features as { labs: unknown }).labs;
  if (Array.isArray(labs)) return labs.includes(lab) || labs.includes("*");
  if (!labs || typeof labs !== "object") return false;
  const grants = labs as Record<string, unknown>;
  return Object.hasOwn(grants, lab) ? grants[lab] === true : grants["*"] === true;
}

export function withCodingAccess(features: Prisma.JsonValue, enabled: boolean): Prisma.InputJsonObject {
  const prior: Prisma.JsonObject = features && typeof features === "object" && !Array.isArray(features) ? features : { bullets: Array.isArray(features) ? features : [] };
  const raw = prior.labs;
  const grants: Prisma.JsonObject = Array.isArray(raw) ? Object.fromEntries(raw.filter((entry): entry is string => typeof entry === "string").map((entry) => [entry, true]))
    : raw && typeof raw === "object" ? raw : Object.hasOwn(prior, "labs") ? {} : { "*": true };
  return { ...prior, labs: { ...grants, coding: enabled } } as Prisma.InputJsonObject;
}

export async function codingPlanIncludesLab(context: { parentId: string } | { schoolId: string }): Promise<boolean> {
  let planId: string | null = null;
  if ("schoolId" in context) {
    const licence = await prisma.schoolLicence.findUnique({ where: { schoolId: context.schoolId }, select: { pricingPlanId: true } });
    planId = licence?.pricingPlanId ?? null;
  } else {
    const subscription = await prisma.subscription.findFirst({ where: { parentId: context.parentId }, orderBy: { updatedAt: "desc" }, select: { pricingPlanId: true, planKey: true } });
    if (subscription) {
      const plan = await resolveCurrentPricingPlan({ pricingPlanId: subscription.pricingPlanId, legacyPlanKey: subscription.planKey });
      planId = subscription.pricingPlanId ?? plan?.id ?? null;
    }
  }
  if (!planId) return true;
  const plan = await prisma.pricingPlan.findUnique({ where: { id: planId }, select: { features: true } });
  return plan ? labIncluded(plan.features) : false;
}
