import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getAuthCookieName } from "@/lib/auth";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { getPlan, planBadgeText } from "@/lib/subscriptions/plans";

const NOTIFICATION_PREFS_COOKIE = "starliz_notify_prefs";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  notifications: z
    .object({
      emailWeeklyReport: z.boolean().optional(),
      assignmentAlerts: z.boolean().optional(),
      productUpdates: z.boolean().optional(),
    })
    .optional(),
});

type NotificationPrefs = {
  emailWeeklyReport: boolean;
  assignmentAlerts: boolean;
  productUpdates: boolean;
};

function defaultNotificationPrefs(): NotificationPrefs {
  return {
    emailWeeklyReport: true,
    assignmentAlerts: true,
    productUpdates: false,
  };
}

async function getNotificationPrefs(): Promise<NotificationPrefs> {
  const raw = (await cookies()).get(NOTIFICATION_PREFS_COOKIE)?.value;
  if (!raw) return defaultNotificationPrefs();
  try {
    const parsed = JSON.parse(raw) as Partial<NotificationPrefs>;
    return {
      emailWeeklyReport: parsed.emailWeeklyReport ?? true,
      assignmentAlerts: parsed.assignmentAlerts ?? true,
      productUpdates: parsed.productUpdates ?? false,
    };
  } catch {
    return defaultNotificationPrefs();
  }
}

async function setNotificationPrefs(preferences: NotificationPrefs): Promise<void> {
  (await cookies()).set(NOTIFICATION_PREFS_COOKIE, JSON.stringify(preferences), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function GET() {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  const [account, childrenCount, activeChild, notifications, subscription] = await Promise.all([
    prisma.user.findUnique({
      where: { id: parentScope.parentId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        trialSessionsUsed: true,
        createdAt: true,
        activeChildId: true,
      },
    }),
    prisma.childProfile.count({ where: { parentId: parentScope.parentId, archived: false } }),
    prisma.user.findUnique({
      where: { id: parentScope.parentId },
      select: {
        activeChildId: true,
      },
    }).then(async (row) => {
      if (!row?.activeChildId) return null;
      return prisma.childProfile.findFirst({
        where: { id: row.activeChildId, parentId: parentScope.parentId, archived: false },
        select: { id: true, name: true, avatar: true },
      });
    }),
    getNotificationPrefs(),
    prisma.subscription.findFirst({
      where: { parentId: parentScope.parentId },
      orderBy: { updatedAt: "desc" },
      select: {
        planKey: true,
        status: true,
        provider: true,
        currentPeriodEnd: true,
      },
    }),
  ]);

  if (!account) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  const plan = getPlan(subscription?.planKey);

  return NextResponse.json({
    account: {
      id: account.id,
      name: account.name ?? "Parent",
      email: account.email,
      role: account.role,
      createdAt: account.createdAt.toISOString(),
      linkedChildrenCount: childrenCount,
      subscriptionStatus: planBadgeText(subscription?.planKey, subscription?.status),
      subscriptionState: subscription?.status ?? "active",
      subscriptionPlanKey: plan.key,
      subscriptionProvider: subscription?.provider ?? "stripe",
      childLimit: plan.childLimit,
      trialUsed: account.trialSessionsUsed,
      renewalDate: subscription?.currentPeriodEnd?.toISOString() ?? null,
    },
    activeChild,
    notifications,
  });
}

export async function PATCH(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  try {
    const body = updateSchema.parse(await request.json());

    if (body.name) {
      await prisma.user.update({
        where: { id: parentScope.parentId },
        data: { name: body.name },
      });
    }

    let nextNotifications: NotificationPrefs | null = null;
    if (body.notifications) {
      const current = await getNotificationPrefs();
      nextNotifications = {
        emailWeeklyReport: body.notifications.emailWeeklyReport ?? current.emailWeeklyReport,
        assignmentAlerts: body.notifications.assignmentAlerts ?? current.assignmentAlerts,
        productUpdates: body.notifications.productUpdates ?? current.productUpdates,
      };
      await setNotificationPrefs(nextNotifications);
    }

    const updated = await prisma.user.findUnique({
      where: { id: parentScope.parentId },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });

    return NextResponse.json({
      ok: true,
      account: {
        id: updated?.id,
        name: updated?.name ?? "Parent",
        email: updated?.email ?? parentScope.parentEmail,
        role: updated?.role ?? "parent",
        createdAt: updated?.createdAt?.toISOString(),
      },
      notifications: nextNotifications,
    });
  } catch {
    return NextResponse.json({ error: "Invalid account update payload." }, { status: 400 });
  }
}

export async function DELETE() {
  const { session, response } = await requireSession();
  if (!session) return response;

  await prisma.user.delete({ where: { id: session.userId } });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(getAuthCookieName(), "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}
