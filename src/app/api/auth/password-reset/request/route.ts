import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email-provider";
import { createPasswordResetToken, getPasswordResetExpiry, PASSWORD_RESET_TTL_MINUTES } from "@/lib/password-reset";

function normalizeEmail(email: unknown) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function buildResetEmail(resetUrl: string) {
  return {
    subject: "Reset your StarLiz Academy password",
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
        <h1 style="font-size:24px">Reset your password</h1>
        <p>Use this secure link to choose a new StarLiz Academy password. It expires in ${PASSWORD_RESET_TTL_MINUTES} minutes.</p>
        <p><a href="${resetUrl}" style="display:inline-block;background:#2563eb;color:white;padding:12px 18px;border-radius:12px;text-decoration:none;font-weight:700">Reset password</a></p>
        <p>If you did not request this, you can ignore this email.</p>
      </div>
    `,
    text: `Reset your StarLiz Academy password: ${resetUrl}\n\nThis link expires in ${PASSWORD_RESET_TTL_MINUTES} minutes. If you did not request this, ignore this email.`,
  };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = normalizeEmail(body?.email);

  if (!email) {
    return NextResponse.json({ error: "Enter your account email." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  });

  let devResetUrl: string | undefined;

  if (user) {
    const { token, tokenHash } = createPasswordResetToken();
    const expiresAt = getPasswordResetExpiry();
    const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    const resetUrl = `${origin}/reset-password?token=${encodeURIComponent(token)}`;
    const emailContent = buildResetEmail(resetUrl);

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    const sent = await sendEmail({
      to: user.email,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });

    if (!sent.ok && process.env.NODE_ENV !== "production") {
      devResetUrl = resetUrl;
      console.warn(`[password-reset] Email not sent: ${sent.reason}. Dev reset URL: ${resetUrl}`);
    }
  }

  return NextResponse.json({
    ok: true,
    message: "If that email is registered, a reset link has been sent.",
    devResetUrl,
  });
}

