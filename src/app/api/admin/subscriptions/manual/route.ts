import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { getAdminPricingPlans, planKeyFromPricingPlan } from "@/lib/pricing/service";

const schema = z.discriminatedUnion("action", [
  z.object({ parentId: z.string().min(1), action: z.literal("grant"), pricingPlanId: z.string().min(1), months: z.number().int().min(1).max(36) }),
  z.object({ parentId: z.string().min(1), action: z.literal("change_plan"), pricingPlanId: z.string().min(1) }),
  z.object({ parentId: z.string().min(1), action: z.literal("extend"), months: z.number().int().min(1).max(36) }),
]);

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

export async function GET() {
  const { session, response } = await requireAdminPermission("MANAGE_SUBSCRIPTIONS");
  if (!session) return response;

  const plans = (await getAdminPricingPlans())
    .filter((plan) => plan.isActive && plan.audience !== "school" && plan.audience !== "organisation")
    .map((plan) => ({
      id: plan.id,
      name: plan.name,
      price: plan.price,
      currency: plan.currency,
      interval: plan.interval,
      childLimit: plan.childLimit,
    }));

  return NextResponse.json({ plans });
}

export async function PATCH(request: Request) {
  const { session, response } = await requireAdminPermission("MANAGE_SUBSCRIPTIONS");
  if (!session) return response;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid manual subscription request." }, { status: 400 });
  }

  const body = parsed.data;
  const parent = await prisma.user.findUnique({ where: { id: body.parentId }, select: { id: true, role: true } });
  if (!parent || parent.role !== "parent") {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  const current = await prisma.subscription.findFirst({ where: { parentId: body.parentId }, orderBy: { updatedAt: "desc" } });
  const now = new Date();

  if (body.action === "extend") {
    if (!current) return NextResponse.json({ error: "Grant a subscription before extending it." }, { status: 409 });
    const base = current.currentPeriodEnd && current.currentPeriodEnd > now ? current.currentPeriodEnd : now;
    const end = addMonths(base, body.months);
    const updated = await prisma.subscription.update({
      where: { id: current.id },
      data: { provider: "manual", status: "active", currentPeriodEnd: end, graceEndsAt: null },
    });
    await writeAuditLog({ actorUserId: session.userId, action: "admin_subscription_extended", entityType: "Subscription", entityId: updated.id, metadata: { parentId: body.parentId, months: body.months, previousEnd: current.currentPeriodEnd?.toISOString() ?? null, newEnd: end.toISOString(), provider: "manual" } });
    return NextResponse.json({ ok: true, message: `Subscription extended by ${body.months} month${body.months === 1 ? "" : "s"}.`, accessEndsAt: end.toISOString() });
  }

  const plan = await prisma.pricingPlan.findUnique({ where: { id: body.pricingPlanId } });
  if (!plan || !plan.isActive || plan.audience === "school" || plan.audience === "organisation") {
    return NextResponse.json({ error: "Selected parent subscription plan is not available." }, { status: 400 });
  }
  const planKey = planKeyFromPricingPlan(plan);

  if (body.action === "change_plan") {
    if (!current) return NextResponse.json({ error: "Grant a subscription before changing its plan." }, { status: 409 });
    const updated = await prisma.$transaction(async (tx) => {
      const subscription = await tx.subscription.update({
        where: { id: current.id },
        data: { provider: "manual", pricingPlanId: plan.id, planKey, status: "active", graceEndsAt: null },
      });
      await tx.parentProfile.updateMany({ where: { userId: body.parentId }, data: { subscriptionPlan: planKey } });
      return subscription;
    });
    await writeAuditLog({ actorUserId: session.userId, action: "admin_subscription_plan_changed", entityType: "Subscription", entityId: updated.id, metadata: { parentId: body.parentId, previousPlanKey: current.planKey, planKey, pricingPlanId: plan.id, provider: "manual" } });
    return NextResponse.json({ ok: true, message: `Plan changed to ${plan.name}.` });
  }

  const end = addMonths(now, body.months);
  const subscription = await prisma.$transaction(async (tx) => {
    const saved = current
      ? await tx.subscription.update({
          where: { id: current.id },
          data: { provider: "manual", providerCustomerId: null, providerSubId: null, pricingPlanId: plan.id, planKey, status: "active", trialEndsAt: null, currentPeriodEnd: end, graceEndsAt: null },
        })
      : await tx.subscription.create({
          data: { parentId: body.parentId, provider: "manual", pricingPlanId: plan.id, planKey, status: "active", currentPeriodEnd: end },
        });
    await tx.parentProfile.updateMany({ where: { userId: body.parentId }, data: { subscriptionPlan: planKey, status: "active" } });
    return saved;
  });

  await writeAuditLog({ actorUserId: session.userId, action: "admin_subscription_granted", entityType: "Subscription", entityId: subscription.id, metadata: { parentId: body.parentId, planKey, pricingPlanId: plan.id, months: body.months, accessEndsAt: end.toISOString(), provider: "manual" } });
  return NextResponse.json({ ok: true, message: `${plan.name} subscription granted for ${body.months} month${body.months === 1 ? "" : "s"}.`, accessEndsAt: end.toISOString() });
}
