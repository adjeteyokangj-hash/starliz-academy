import { NextResponse } from "next/server";
import type { AdminPermission } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api_guard";
import { hashPassword } from "@/lib/auth";
import { sendEmail } from "@/lib/email-provider";
import { createPasswordResetToken, getPasswordResetExpiry, PASSWORD_RESET_TTL_MINUTES } from "@/lib/password-reset";
import { writeAuditLog } from "@/lib/audit";
import { hasPermission } from "@/lib/rbac";

const RESET_URL_ORIGIN = "https://www.starlizacademy.com";

const bodySchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("email") }),
  z.object({
    mode: z.literal("set"),
    password: z.string().min(8, "Password must be at least 8 characters"),
  }),
]);

function buildResetEmail(resetUrl: string, adminName: string | null) {
  const name = adminName ?? "Admin";
  return {
    subject: "Reset your StarLiz Academy admin password",
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
        <h1 style="font-size:24px">Reset your admin password</h1>
        <p>Hello ${name},</p>
        <p>An administrator has requested that you reset your StarLiz Academy admin password.</p>
        <p>
          <a href="${resetUrl}" style="display:inline-block;background:#2563eb;color:white;padding:12px 18px;border-radius:12px;text-decoration:none;font-weight:700">
            Reset password
          </a>
        </p>
        <p>This secure link expires in ${PASSWORD_RESET_TTL_MINUTES} minutes.</p>
        <p>If the button does not work, copy and paste this link into your browser:</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>If you did not expect this email, contact another Super Admin immediately.</p>
      </div>
    `,
    text: [
      "Reset your StarLiz Academy admin password",
      "",
      `Hello ${name},`,
      "An administrator has requested that you reset your StarLiz Academy admin password.",
      `Open this secure link to choose a new password: ${resetUrl}`,
      "",
      `This link expires in ${PASSWORD_RESET_TTL_MINUTES} minutes.`,
      "If you did not expect this email, contact another Super Admin immediately.",
    ].join("\n"),
  };
}

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const { session, response } = await requireAdmin();
  if (!session) return response!;

  const actorProfile = await prisma.adminUser.findUnique({ where: { userId: session.userId } });
  if (!actorProfile) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (actorProfile.roleId && !(await hasPermission(actorProfile.id, "MANAGE_ADMINS" as AdminPermission))) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({ mode: "email" })));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request." },
        { status: 400 },
      );
    }
    const body = parsed.data;

    const target = await prisma.adminUser.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, name: true, role: true } },
      },
    });

    if (!target || target.user.role !== "admin") {
      return NextResponse.json({ error: "Admin user not found" }, { status: 404 });
    }

    if (body.mode === "set") {
      await prisma.user.update({
        where: { id: target.userId },
        data: {
          passwordHash: await hashPassword(body.password),
          passwordResetToken: null,
          passwordResetExpires: null,
        },
      });

      await writeAuditLog({
        actorUserId: session.userId,
        action: "ADMIN_SET_ADMIN_PASSWORD",
        entityType: "AdminUser",
        entityId: target.id,
        metadata: { email: target.user.email, targetUserId: target.userId },
      });

      return NextResponse.json({
        message: `Password updated for ${target.user.email}`,
      });
    }

    const { token, tokenHash } = createPasswordResetToken();
    const resetUrl = `${RESET_URL_ORIGIN}/auth/reset-password?token=${encodeURIComponent(token)}`;

    await prisma.user.update({
      where: { id: target.userId },
      data: {
        passwordResetToken: tokenHash,
        passwordResetExpires: getPasswordResetExpiry(),
      },
    });

    const emailContent = buildResetEmail(resetUrl, target.user.name);
    const sent = await sendEmail({
      to: target.user.email,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });

    if (!sent.ok) {
      console.error("[admin/users/reset-password] Email failed:", {
        reason: sent.reason,
        email: target.user.email,
      });
      return NextResponse.json(
        {
          error: "Failed to send reset email. Use Set password instead, or check email delivery settings.",
        },
        { status: 500 },
      );
    }

    await writeAuditLog({
      actorUserId: session.userId,
      action: "ADMIN_TRIGGERED_ADMIN_PASSWORD_RESET",
      entityType: "AdminUser",
      entityId: target.id,
      metadata: { email: target.user.email, targetUserId: target.userId },
    });

    return NextResponse.json({
      message: `Password reset link sent to ${target.user.email}`,
    });
  } catch (error) {
    console.error("[admin/users/reset-password] Error:", error);
    return NextResponse.json({ error: "An error occurred. Please try again." }, { status: 500 });
  }
}
