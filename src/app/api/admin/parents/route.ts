import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin, requireAdminPermission } from "@/lib/api_guard";
import { hashPassword } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

const createParentSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  password: z.string().min(8),
  phone: z.string().trim().min(7),
  whatsappNumber: z.string().trim().optional(),
  address: z.string().trim().optional(),
  country: z.string().trim().optional(),
  timezone: z.string().trim().optional(),
  parentRole: z.string().trim().optional(),
  status: z.enum(["active", "pending", "suspended"]).default("active"),
  emailVerified: z.boolean().optional(),
  forcePasswordReset: z.boolean().optional(),
  emailConsent: z.boolean().optional(),
  smsConsent: z.boolean().optional(),
  whatsappConsent: z.boolean().optional(),
  numberOfChildren: z.number().int().min(0).optional(),
  preferredLearningFocus: z.string().trim().optional(),
  schoolType: z.string().trim().optional(),
  curriculum: z.string().trim().optional(),
  trialStatus: z.string().trim().optional(),
  subscriptionPlan: z.string().trim().optional(),
  stripeCustomerId: z.string().trim().optional(),
  paystackCustomerId: z.string().trim().optional(),
  mfaEnabled: z.boolean().optional(),
  lastLoginAt: z.string().datetime().optional(),
  deviceTrackingJson: z.string().optional(),
});

export async function GET() {
  const { session, response } = await requireAdminPermission("parents:write");
  if (!session) return response;

  const parents = await prisma.user.findMany({
    where: { role: "parent" },
    orderBy: { updatedAt: "desc" },
    include: {
      parentProfile: true,
      _count: { select: { children: true } },
      children: {
        where: { archived: false },
        select: { updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
      subscriptions: {
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: { status: true, planKey: true },
      },
    },
  });

  return NextResponse.json({
    parents: parents.map((parent) => {
      const sub = parent.subscriptions[0];
      const subscriptionStatus = sub
        ? sub.status.charAt(0).toUpperCase() + sub.status.slice(1)
        : "Free";
      return {
        id: parent.id,
        name: parent.name,
        email: parent.email,
        phone: parent.parentProfile?.phone ?? null,
        status: parent.parentProfile?.status ?? "active",
        childrenCount: parent._count.children,
        subscriptionStatus,
        lastLogin: parent.children[0]?.updatedAt?.toISOString() ?? parent.updatedAt.toISOString(),
        createdAt: parent.createdAt.toISOString(),
      };
    }),
  });
}

export async function POST(request: Request) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  try {
    let body;
    try {
      body = createParentSchema.parse(await request.json());
    } catch (parseError) {
      if (parseError instanceof z.ZodError) {
        const issue = parseError.issues[0];
        const fieldNameRaw = issue.path[0] ?? "body";
        const fieldName = typeof fieldNameRaw === "string" ? fieldNameRaw : String(fieldNameRaw);
        let message = `${fieldName}: ${issue.message}`;
        if (fieldName === "password" && issue.code === "too_small") {
          message = "Password must be at least 8 characters";
        } else if (fieldName === "phone" && issue.code === "too_small") {
          message = "Phone number is required";
        } else if (fieldName === "email" && (issue.code === "invalid_string" || issue.code === "invalid_format")) {
          message = "Please provide a valid email address";
        } else if (fieldName === "name" && issue.code === "too_small") {
          message = "Parent name is required";
        }
        return NextResponse.json({ error: message }, { status: 400 });
      }
      throw parseError;
    }

    // Check if email already exists
    const existing = await prisma.user.findUnique({
      where: { email: body.email.toLowerCase() },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 400 }
      );
    }

    const passwordHash = await hashPassword(body.password);
    const parent = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email.toLowerCase(),
        passwordHash,
        role: "parent",
        parentProfile: {
          create: {
            phone: body.phone,
            whatsappNumber: body.whatsappNumber || null,
            address: body.address || null,
            country: body.country || null,
            timezone: body.timezone || null,
            parentRole: body.parentRole || "parent",
            status: body.status,
            emailVerified: body.emailVerified ?? false,
            smsConsent: body.smsConsent ?? false,
            whatsappConsent: body.whatsappConsent ?? false,
            emailConsent: body.emailConsent ?? false,
            numberOfChildren: body.numberOfChildren,
            preferredLearningFocus: body.preferredLearningFocus || null,
            schoolType: body.schoolType || null,
            curriculum: body.curriculum || null,
            trialStatus: body.trialStatus || "none",
            subscriptionPlan: body.subscriptionPlan || null,
            stripeCustomerId: body.stripeCustomerId || null,
            paystackCustomerId: body.paystackCustomerId || null,
            forcePasswordReset: body.forcePasswordReset ?? false,
            mfaEnabled: body.mfaEnabled ?? false,
            lastLoginAt: body.lastLoginAt ? new Date(body.lastLoginAt) : null,
            deviceTrackingJson: body.deviceTrackingJson || null,
          },
        },
      },
      select: { id: true, email: true, name: true, role: true },
    });

    await writeAuditLog({
      actorUserId: session.userId,
      action: "created",
      entityType: "parent",
      entityId: parent.id,
      metadata: {
        email: parent.email,
        onboarding: {
          phone: body.phone,
          whatsappNumber: body.whatsappNumber ?? null,
          address: body.address ?? null,
          status: body.status,
          forcePasswordReset: body.forcePasswordReset ?? false,
          emailConsent: body.emailConsent ?? false,
          smsConsent: body.smsConsent ?? false,
          whatsappConsent: body.whatsappConsent ?? false,
        },
      },
    });

    return NextResponse.json({ parent }, { status: 201 });
  } catch (error) {
    console.error("Parent creation error:", error);
    return NextResponse.json(
      { error: "Unable to create parent account. Please try again." },
      { status: 500 }
    );
  }
}
