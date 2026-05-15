import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/api_guard";
import { sendEmail } from "@/lib/email-provider";
import { createPasswordResetToken, getPasswordResetExpiry, PASSWORD_RESET_TTL_MINUTES } from "@/lib/password-reset";
import { writeAuditLog } from "@/lib/audit";

const RESET_URL_ORIGIN = "https://www.starlizacademy.com";

function buildResetEmail(resetUrl: string, parentName: string | null) {
  const name = parentName ?? "Parent";
  return {
    subject: "Reset your StarLiz Academy password",
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
        <h1 style="font-size:24px">Reset your StarLiz Academy password</h1>
        <p>Hello ${name},</p>
        <p>An administrator has requested that you reset your StarLiz Academy password.</p>
        <p>
          <a href="${resetUrl}" style="display:inline-block;background:#2563eb;color:white;padding:12px 18px;border-radius:12px;text-decoration:none;font-weight:700">
            Reset password
          </a>
        </p>
        <p>This secure link expires in ${PASSWORD_RESET_TTL_MINUTES} minutes.</p>
        <p>If the button does not work, copy and paste this link into your browser:</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>If you did not expect this email, please contact support immediately.</p>
      </div>
    `,
    text: [
      "Reset your StarLiz Academy password",
      "",
      `Hello ${name},`,
      "An administrator has requested that you reset your StarLiz Academy password.",
      `Open this secure link to choose a new password: ${resetUrl}`,
      "",
      `This link expires in ${PASSWORD_RESET_TTL_MINUTES} minutes.`,
      "If you did not expect this email, please contact support immediately.",
    ].join("\n"),
  };
}

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  const { session, response } = await requireAdminPermission("parents:write");
  if (!session) return response;

  try {
    const { id } = await context.params;

    // Fetch parent to verify existence and get email
    const parent = await prisma.user.findFirst({
      where: { id, role: "parent" },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    if (!parent) {
      return NextResponse.json(
        { error: "Parent account not found" },
        { status: 404 }
      );
    }

    // Create password reset token
    const { token, tokenHash } = createPasswordResetToken();
    const resetUrl = `${RESET_URL_ORIGIN}/auth/reset-password?token=${encodeURIComponent(token)}`;

    // Update user with reset token
    await prisma.user.update({
      where: { id: parent.id },
      data: {
        passwordResetToken: tokenHash,
        passwordResetExpires: getPasswordResetExpiry(),
      },
    });

    // Send reset email
    const emailContent = buildResetEmail(resetUrl, parent.name);
    const sent = await sendEmail({
      to: parent.email,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });

    if (!sent.ok) {
      console.error("[admin/reset-password] Email failed:", {
        reason: sent.reason,
        email: parent.email,
      });
      return NextResponse.json(
        { error: "Failed to send reset email. Please try again." },
        { status: 500 }
      );
    }

    // Write audit log
    await writeAuditLog({
      actorUserId: session.userId,
      action: "ADMIN_TRIGGERED_PARENT_PASSWORD_RESET",
      entityType: "ParentProfile",
      entityId: parent.id,
      metadata: { email: parent.email },
    });

    return NextResponse.json({
      message: `Password reset link sent to ${parent.email}`,
    });
  } catch (error) {
    console.error("[admin/reset-password] Error:", error);
    return NextResponse.json(
      { error: "An error occurred. Please try again." },
      { status: 500 }
    );
  }
}
