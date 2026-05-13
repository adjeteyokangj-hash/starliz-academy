import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getAuthCookieName } from "@/lib/auth";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { getPlan, planBadgeText } from "@/lib/subscriptions/plans";
import { writeAuditLog } from "@/lib/audit";

const PARENT_NOTIFICATION_TYPES = {
  emailWeeklyReport: "parent_weekly_report",
  assignmentAlerts: "parent_assignment_alert",
  lessonReminders: "parent_lesson_reminder",
  rewardNotifications: "parent_reward_notification",
  productUpdates: "parent_product_update",
} as const;

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  notifications: z
    .object({
      emailWeeklyReport: z.boolean().optional(),
      assignmentAlerts: z.boolean().optional(),
      lessonReminders: z.boolean().optional(),
      rewardNotifications: z.boolean().optional(),
      productUpdates: z.boolean().optional(),
    })
    .optional(),
});

type NotificationPrefs = {
  emailWeeklyReport: boolean;
  assignmentAlerts: boolean;
  lessonReminders: boolean;
  rewardNotifications: boolean;
  productUpdates: boolean;
};

function defaultNotificationPrefs(): NotificationPrefs {
  return {
    emailWeeklyReport: true,
    assignmentAlerts: true,
    lessonReminders: true,
    rewardNotifications: true,
    productUpdates: false,
  };
}

async function getNotificationPrefs(userId: string): Promise<NotificationPrefs> {
  const defaults = defaultNotificationPrefs();
  const rows = await prisma.notificationPreference.findMany({
    where: {
      userId,
      schoolId: null,
      trustId: null,
      eventType: { in: Object.values(PARENT_NOTIFICATION_TYPES) },
    },
  });

  const byType = new Map(rows.map((row) => [row.eventType ?? "", row]));
  return {
    emailWeeklyReport: byType.get(PARENT_NOTIFICATION_TYPES.emailWeeklyReport)?.emailEnabled ?? defaults.emailWeeklyReport,
    assignmentAlerts: byType.get(PARENT_NOTIFICATION_TYPES.assignmentAlerts)?.emailEnabled ?? defaults.assignmentAlerts,
    lessonReminders: byType.get(PARENT_NOTIFICATION_TYPES.lessonReminders)?.emailEnabled ?? defaults.lessonReminders,
    rewardNotifications: byType.get(PARENT_NOTIFICATION_TYPES.rewardNotifications)?.emailEnabled ?? defaults.rewardNotifications,
    productUpdates: byType.get(PARENT_NOTIFICATION_TYPES.productUpdates)?.emailEnabled ?? defaults.productUpdates,
  };
}

async function setNotificationPrefs(userId: string, preferences: NotificationPrefs): Promise<void> {
  const entries = [
    [PARENT_NOTIFICATION_TYPES.emailWeeklyReport, preferences.emailWeeklyReport],
    [PARENT_NOTIFICATION_TYPES.assignmentAlerts, preferences.assignmentAlerts],
    [PARENT_NOTIFICATION_TYPES.lessonReminders, preferences.lessonReminders],
    [PARENT_NOTIFICATION_TYPES.rewardNotifications, preferences.rewardNotifications],
    [PARENT_NOTIFICATION_TYPES.productUpdates, preferences.productUpdates],
  ] as const;

  await Promise.all(
    entries.map(async ([eventType, enabled]) => {
      const existing = await prisma.notificationPreference.findFirst({
        where: { userId, eventType, schoolId: null, trustId: null },
        select: { id: true },
      });

      if (existing) {
        await prisma.notificationPreference.update({
          where: { id: existing.id },
          data: { emailEnabled: enabled },
        });
        return;
      }

      await prisma.notificationPreference.create({
        data: {
          userId,
          eventType,
          emailEnabled: enabled,
          smsEnabled: false,
          whatsappEnabled: false,
        },
      });
    })
  );
}

export async function GET() {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  const [account, childrenCount, activeChild, notifications, subscription, parentProfile] = await Promise.all([
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
    getNotificationPrefs(parentScope.parentId),
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
    prisma.parentProfile.findUnique({
      where: { userId: parentScope.parentId },
      select: { stripeCustomerId: true, deviceTrackingJson: true },
    }),
  ]);

  if (!account) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  let lastPasswordChangedAt: string | null = null;
  if (parentProfile?.deviceTrackingJson) {
    try {
      const parsed = JSON.parse(parentProfile.deviceTrackingJson) as { security?: { lastPasswordChangedAt?: string | null } };
      lastPasswordChangedAt = parsed.security?.lastPasswordChangedAt ?? null;
    } catch {
      lastPasswordChangedAt = null;
    }
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
      stripeCustomerId: parentProfile?.stripeCustomerId ?? null,
      security: {
        lastPasswordChangedAt,
      },
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
      const current = await getNotificationPrefs(parentScope.parentId);
      nextNotifications = {
        emailWeeklyReport: body.notifications.emailWeeklyReport ?? current.emailWeeklyReport,
        assignmentAlerts: body.notifications.assignmentAlerts ?? current.assignmentAlerts,
        lessonReminders: body.notifications.lessonReminders ?? current.lessonReminders,
        rewardNotifications: body.notifications.rewardNotifications ?? current.rewardNotifications,
        productUpdates: body.notifications.productUpdates ?? current.productUpdates,
      };
      await setNotificationPrefs(parentScope.parentId, nextNotifications);

      await writeAuditLog({
        actorUserId: session.userId,
        action: "parent.notifications.updated",
        entityType: "parent_account",
        entityId: parentScope.parentId,
        metadata: nextNotifications,
      });
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
