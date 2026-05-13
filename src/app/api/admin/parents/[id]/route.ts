import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin, requireAdminPermission } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";

const updateParentSchema = z.object({
  name: z.string().trim().min(1).optional(),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().min(7).optional(),
  whatsappNumber: z.string().trim().nullable().optional(),
  address: z.string().trim().nullable().optional(),
  country: z.string().trim().nullable().optional(),
  timezone: z.string().trim().nullable().optional(),
  parentRole: z.string().trim().nullable().optional(),
  status: z.enum(["active", "pending", "suspended"]).optional(),
  emailVerified: z.boolean().optional(),
  smsConsent: z.boolean().optional(),
  whatsappConsent: z.boolean().optional(),
  emailConsent: z.boolean().optional(),
  numberOfChildren: z.number().int().min(0).nullable().optional(),
  preferredLearningFocus: z.string().trim().nullable().optional(),
  schoolType: z.string().trim().nullable().optional(),
  curriculum: z.string().trim().nullable().optional(),
  trialStatus: z.string().trim().nullable().optional(),
  subscriptionPlan: z.string().trim().nullable().optional(),
  stripeCustomerId: z.string().trim().nullable().optional(),
  paystackCustomerId: z.string().trim().nullable().optional(),
  avatarUrl: z.string().trim().url().nullable().optional(),
  parentNotes: z.string().trim().nullable().optional(),
  emergencyContactName: z.string().trim().nullable().optional(),
  emergencyContactPhone: z.string().trim().nullable().optional(),
  secondaryGuardianName: z.string().trim().nullable().optional(),
  secondaryGuardianPhone: z.string().trim().nullable().optional(),
  devices: z
    .array(
      z.object({
        name: z.string().trim().min(1),
        browser: z.string().trim().optional(),
        lastSeen: z.string().trim().optional(),
        ipAddress: z.string().trim().optional(),
        trusted: z.boolean().optional(),
      })
    )
    .optional(),
  forcePasswordReset: z.boolean().optional(),
  mfaEnabled: z.boolean().optional(),
  lastLoginAt: z.string().datetime().nullable().optional(),
  deviceTrackingJson: z.string().nullable().optional(),
});

function buildDeviceTrackingJson(input: {
  deviceTrackingJson?: string | null;
  devices?: Array<{
    name: string;
    browser?: string;
    lastSeen?: string;
    ipAddress?: string;
    trusted?: boolean;
  }>;
  avatarUrl?: string | null;
  parentNotes?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  secondaryGuardianName?: string | null;
  secondaryGuardianPhone?: string | null;
}) {
  let parsed: Record<string, unknown> = {};
  if (typeof input.deviceTrackingJson === "string" && input.deviceTrackingJson.trim()) {
    try {
      const maybeObject = JSON.parse(input.deviceTrackingJson);
      if (maybeObject && typeof maybeObject === "object" && !Array.isArray(maybeObject)) {
        parsed = maybeObject as Record<string, unknown>;
      }
    } catch {
      throw new Error("DEVICE_JSON_INVALID");
    }
  }

  const devices = input.devices ?? (Array.isArray(parsed.devices) ? parsed.devices : []);
  const profile = {
    avatarUrl: input.avatarUrl ?? null,
    notes: input.parentNotes ?? null,
    emergencyContactName: input.emergencyContactName ?? null,
    emergencyContactPhone: input.emergencyContactPhone ?? null,
    secondaryGuardianName: input.secondaryGuardianName ?? null,
    secondaryGuardianPhone: input.secondaryGuardianPhone ?? null,
  };

  return JSON.stringify({ ...parsed, devices, profile });
}

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { session, response } = await requireAdminPermission("parents:write");
  if (!session) return response;

  const { id } = await context.params;
  const parent = await prisma.user.findFirst({
    where: { id, role: "parent" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      activeChildId: true,
      createdAt: true,
      updatedAt: true,
      consentVersion: true,
      consentAcceptedAt: true,
      consentWithdrawnAt: true,
      parentProfile: true,
      subscriptions: {
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          planKey: true,
          currentPeriodEnd: true,
          updatedAt: true,
        },
      },
      notificationPreferences: {
        where: {
          schoolId: null,
          trustId: null,
          eventType: {
            in: [
              "parent_weekly_report",
              "parent_assignment_alert",
              "parent_lesson_reminder",
              "parent_reward_notification",
              "parent_product_update",
            ],
          },
        },
        select: {
          eventType: true,
          emailEnabled: true,
          updatedAt: true,
        },
      },
      children: {
        where: { archived: false },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          name: true,
          age: true,
          yearGroup: true,
          level: true,
          stars: true,
          xp: true,
          streak: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!parent) {
    return NextResponse.json({ error: "Parent not found." }, { status: 404 });
  }

  const auditTrail = await prisma.auditLog.findMany({
    where: {
      OR: [
        { actorUserId: id, action: { in: ["consent.accepted", "consent.withdrawn", "parent.notifications.updated", "parent.password.updated"] } },
        { entityId: id, action: { in: ["consent.accepted", "consent.withdrawn", "parent.notifications.updated", "parent.password.updated"] } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const latestSubscription = parent.subscriptions[0] ?? null;

  return NextResponse.json({
    parent: {
      ...parent,
      createdAt: parent.createdAt.toISOString(),
      updatedAt: parent.updatedAt.toISOString(),
      consentAcceptedAt: parent.consentAcceptedAt?.toISOString() ?? null,
      consentWithdrawnAt: parent.consentWithdrawnAt?.toISOString() ?? null,
      parentProfile: parent.parentProfile
        ? {
            ...parent.parentProfile,
            lastLoginAt: parent.parentProfile.lastLoginAt?.toISOString() ?? null,
            createdAt: parent.parentProfile.createdAt.toISOString(),
            updatedAt: parent.parentProfile.updatedAt.toISOString(),
          }
        : null,
      subscription: latestSubscription
        ? {
            ...latestSubscription,
            currentPeriodEnd: latestSubscription.currentPeriodEnd?.toISOString() ?? null,
            updatedAt: latestSubscription.updatedAt.toISOString(),
          }
        : null,
      notificationPreferences: parent.notificationPreferences.map((pref) => ({
        ...pref,
        updatedAt: pref.updatedAt.toISOString(),
      })),
      children: parent.children.map((child) => ({ ...child, updatedAt: child.updatedAt.toISOString() })),
      auditTrail: auditTrail.map((entry) => ({
        id: entry.id,
        action: entry.action,
        entityType: entry.entityType,
        metadataJson: entry.metadataJson,
        createdAt: entry.createdAt.toISOString(),
      })),
    },
  });
}

export async function PATCH(request: Request, context: Context) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  const { id } = await context.params;
  try {
    const body = updateParentSchema.parse(await request.json());
    const current = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, parentProfile: { select: { deviceTrackingJson: true } } },
    });

    if (!current || current.role !== "parent") {
      return NextResponse.json({ error: "Parent not found." }, { status: 404 });
    }

    const shouldRebuildDeviceJson =
      body.deviceTrackingJson !== undefined ||
      body.devices !== undefined ||
      body.avatarUrl !== undefined ||
      body.parentNotes !== undefined ||
      body.emergencyContactName !== undefined ||
      body.emergencyContactPhone !== undefined ||
      body.secondaryGuardianName !== undefined ||
      body.secondaryGuardianPhone !== undefined;

    const profileData = {
      ...(body.phone !== undefined ? { phone: body.phone } : {}),
      ...(body.whatsappNumber !== undefined ? { whatsappNumber: body.whatsappNumber } : {}),
      ...(body.address !== undefined ? { address: body.address } : {}),
      ...(body.country !== undefined ? { country: body.country } : {}),
      ...(body.timezone !== undefined ? { timezone: body.timezone } : {}),
      ...(body.parentRole !== undefined ? { parentRole: body.parentRole } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.emailVerified !== undefined ? { emailVerified: body.emailVerified } : {}),
      ...(body.smsConsent !== undefined ? { smsConsent: body.smsConsent } : {}),
      ...(body.whatsappConsent !== undefined ? { whatsappConsent: body.whatsappConsent } : {}),
      ...(body.emailConsent !== undefined ? { emailConsent: body.emailConsent } : {}),
      ...(body.numberOfChildren !== undefined ? { numberOfChildren: body.numberOfChildren } : {}),
      ...(body.preferredLearningFocus !== undefined ? { preferredLearningFocus: body.preferredLearningFocus } : {}),
      ...(body.schoolType !== undefined ? { schoolType: body.schoolType } : {}),
      ...(body.curriculum !== undefined ? { curriculum: body.curriculum } : {}),
      ...(body.trialStatus !== undefined ? { trialStatus: body.trialStatus } : {}),
      ...(body.subscriptionPlan !== undefined ? { subscriptionPlan: body.subscriptionPlan } : {}),
      ...(body.stripeCustomerId !== undefined ? { stripeCustomerId: body.stripeCustomerId } : {}),
      ...(body.paystackCustomerId !== undefined ? { paystackCustomerId: body.paystackCustomerId } : {}),
      ...(body.forcePasswordReset !== undefined ? { forcePasswordReset: body.forcePasswordReset } : {}),
      ...(body.mfaEnabled !== undefined ? { mfaEnabled: body.mfaEnabled } : {}),
      ...(body.lastLoginAt !== undefined ? { lastLoginAt: body.lastLoginAt ? new Date(body.lastLoginAt) : null } : {}),
      ...(shouldRebuildDeviceJson
        ? {
            deviceTrackingJson: buildDeviceTrackingJson({
              deviceTrackingJson: body.deviceTrackingJson ?? current.parentProfile?.deviceTrackingJson,
              devices: body.devices,
              avatarUrl: body.avatarUrl,
              parentNotes: body.parentNotes,
              emergencyContactName: body.emergencyContactName,
              emergencyContactPhone: body.emergencyContactPhone,
              secondaryGuardianName: body.secondaryGuardianName,
              secondaryGuardianPhone: body.secondaryGuardianPhone,
            }),
          }
        : {}),
    };
    const parent = await prisma.user.update({
      where: { id },
      data: {
        ...(body.name ? { name: body.name } : {}),
        ...(body.email ? { email: body.email.toLowerCase() } : {}),
        ...(Object.keys(profileData).length
          ? {
              parentProfile: {
                upsert: {
                  create: {
                    phone: body.phone ?? "Not set",
                    ...profileData,
                  },
                  update: profileData,
                },
              },
            }
          : {}),
      },
      select: { id: true, name: true, email: true, role: true },
    });

    if (parent.role !== "parent") {
      return NextResponse.json({ error: "Target user is not a parent." }, { status: 400 });
    }

    await writeAuditLog({
      actorUserId: session.userId,
      action: "updated",
      entityType: "parent",
      entityId: parent.id,
      metadata: body,
    });

    return NextResponse.json({ parent });
  } catch (error) {
    if (error instanceof Error && error.message === "DEVICE_JSON_INVALID") {
      return NextResponse.json(
        { error: "Device tracking JSON must be valid JSON." },
        { status: 400 }
      );
    }
    if (error instanceof z.ZodError) {
      const issue = error.issues[0];
      const fieldNameRaw = issue.path[0] ?? "field";
      const fieldName = typeof fieldNameRaw === "string" ? fieldNameRaw : String(fieldNameRaw);
      return NextResponse.json({ error: `${fieldName}: ${issue.message}` }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid parent update." }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: Context) {
  const { session, response } = await requireAdminPermission("parents:write");
  if (!session) return response;

  const { id } = await context.params;
  const parent = await prisma.user.findFirst({
    where: { id, role: "parent" },
    select: { id: true, email: true },
  });

  if (!parent) {
    return NextResponse.json({ error: "Parent not found." }, { status: 404 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const archivedChildren = await tx.childProfile.updateMany({
      where: { parentId: parent.id, archived: false },
      data: { archived: true },
    });

    await tx.parentProfile.updateMany({
      where: { userId: parent.id },
      data: { status: "suspended" },
    });

    return { archivedChildren: archivedChildren.count };
  });

  await writeAuditLog({
    actorUserId: session.userId,
    action: "archived",
    entityType: "parent",
    entityId: parent.id,
    metadata: { email: parent.email, archivedChildren: result.archivedChildren },
  });

  return NextResponse.json({ ok: true, archivedChildren: result.archivedChildren });
}
