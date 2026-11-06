import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/api_guard";
import { prisma } from "@/lib/db";
import { labIncluded, withCodingAccess } from "@/lib/coding/learning/entitlements";

export async function GET() {
  const { session, response } = await requireAdminPermission("MANAGE_BILLING");
  if (!session) return response;
  const plans = await prisma.pricingPlan.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true, audience: true, features: true, updatedAt: true, isActive: true } });
  return NextResponse.json({ plans: plans.map((plan) => ({ id: plan.id, name: plan.name, audience: plan.audience,
    codingIncluded: labIncluded(plan.features), revision: plan.updatedAt.toISOString(), active: plan.isActive })) }, { headers: { "Cache-Control": "private, no-store" } });
}
export async function PUT(request: Request) {
  const { session, response } = await requireAdminPermission("MANAGE_BILLING");
  if (!session) return response;
  const parsed = z.object({ planId: z.string().min(1).max(100), codingIncluded: z.boolean(), revision: z.string().datetime() }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a pricing plan and its current revision." }, { status: 400 });
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const plan = await tx.pricingPlan.findUnique({ where: { id: parsed.data.planId } });
      if (!plan || plan.updatedAt.toISOString() !== parsed.data.revision) return null;
      const updated = await tx.pricingPlan.update({ where: { id: plan.id, updatedAt: plan.updatedAt }, data: { features: withCodingAccess(plan.features, parsed.data.codingIncluded) } });
      await tx.auditLog.create({ data: { actorUserId: session.userId, action: "coding.entitlement.updated", entityType: "PricingPlan", entityId: plan.id,
        metadataJson: JSON.stringify({ codingIncluded: parsed.data.codingIncluded }) } });
      return updated;
    });
    return updated ? NextResponse.json({ codingIncluded: labIncluded(updated.features), revision: updated.updatedAt.toISOString() })
      : NextResponse.json({ error: "The plan changed. Reload before editing its Coding access." }, { status: 409 });
  } catch { return NextResponse.json({ error: "Coding access could not be saved. Reload the current plan and retry." }, { status: 409 }); }
}
