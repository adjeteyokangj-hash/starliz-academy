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
});

export async function GET() {
  const { session, response } = await requireAdminPermission("parents:write");
  if (!session) return response;

  const parents = await prisma.user.findMany({
    where: { role: "parent" },
    orderBy: { updatedAt: "desc" },
    include: {
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
        const fieldName = issue.path[0] ?? "body";
        let message = `${fieldName}: ${issue.message}`;
        if (fieldName === "password" && issue.code === "too_small") {
          message = "Password must be at least 8 characters";
        } else if (fieldName === "email" && issue.code === "invalid_string") {
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
      },
      select: { id: true, email: true, name: true, role: true },
    });

    await writeAuditLog({
      actorUserId: session.userId,
      action: "created",
      entityType: "parent",
      entityId: parent.id,
      metadata: { email: parent.email },
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
