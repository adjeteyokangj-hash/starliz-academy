import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/api_guard";
import { getPlan, normalizePlanKey, planBadgeText } from "@/lib/subscriptions/plans";

const updateSchema = z.object({
  parentId: z.string().min(1),
  planKey: z.enum(["free", "monthly", "yearly"]),
  status: z.enum(["active", "trialing", "cancelled", "past_due", "blocked"]),
  provider: z.enum(["stripe", "paystack"]).optional(),
  renewalDate: z.string().datetime().nullable().optional(),
});

export async function GET() {
  const { session, response } = await requireAdminPermission("parents:write");
  if (!session) return response;

  const parents = await prisma.user.findMany({
    where: { role: "parent" },
    select: {
      id: true,
      email: true,
      subscriptions: {
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
      _count: { select: { children: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({
    rows: parents.map((parent) => {
      const subscription = parent.subscriptions[0] ?? null;
      const plan = getPlan(subscription?.planKey);
      return {
        parentId: parent.id,
        parentEmail: parent.email,
        planKey: plan.key,
        plan: plan.name,
        status: subscription?.status ?? "active",
        childLimit: plan.childLimit,
        childrenUsed: parent._count.children,
        renewalDate: subscription?.currentPeriodEnd?.toISOString() ?? null,
        paymentProvider: subscription?.provider === "paystack" ? "paystack" : "stripe",
        badge: planBadgeText(subscription?.planKey, subscription?.status),
        paymentFailed: (subscription?.status ?? "").toLowerCase() === "past_due",
      };
    }),
  });
}

export async function PATCH(request: Request) {
  const { session, response } = await requireAdminPermission("parents:write");
  if (!session) return response;

  try {
    const body = updateSchema.parse(await request.json());

    const parent = await prisma.user.findUnique({ where: { id: body.parentId }, select: { id: true, role: true } });
    if (!parent || parent.role !== "parent") {
      return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
    }

    const current = await prisma.subscription.findFirst({
      where: { parentId: body.parentId },
      orderBy: { updatedAt: "desc" },
    });

    const data = {
      planKey: normalizePlanKey(body.planKey),
      status: body.status,
      provider: body.provider ?? (current?.provider === "paystack" ? "paystack" : "stripe"),
      currentPeriodEnd: body.renewalDate ? new Date(body.renewalDate) : current?.currentPeriodEnd ?? null,
      trialEndsAt: body.status === "trialing" ? (current?.trialEndsAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)) : null,
      graceEndsAt: body.status === "past_due" ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : null,
    };

    if (current) {
      await prisma.subscription.update({ where: { id: current.id }, data });
    } else {
      await prisma.subscription.create({ data: { parentId: body.parentId, ...data } });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid subscription override payload." }, { status: 400 });
  }
}
