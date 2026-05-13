import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email-provider";
import { createPasswordResetToken, getPasswordResetExpiry, PASSWORD_RESET_TTL_MINUTES } from "@/lib/password-reset";

const GENERIC_MESSAGE = "If an account exists, a reset link has been sent.";
const RESET_URL_ORIGIN = "https://www.starlizacademy.com";

function normalizeEmail(email: unknown) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function buildResetEmail(resetUrl: string) {
  return {
    subject: "Reset your StarLiz Academy password",
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
        <h1 style="font-size:24px">Reset your StarLiz Academy password</h1>
        <p>Hello,</p>
        <p>We received a request to reset the password for your StarLiz Academy parent account.</p>
        <p>
          <a href="${resetUrl}" style="display:inline-block;background:#2563eb;color:white;padding:12px 18px;border-radius:12px;text-decoration:none;font-weight:700">
            Reset password
          </a>
        </p>
        <p>This secure link expires in ${PASSWORD_RESET_TTL_MINUTES} minutes.</p>
        <p>If the button does not work, copy and paste this link into your browser:</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>If you did not request this, you can safely ignore this email.</p>
      </div>
    `,
    text: [
      "Reset your StarLiz Academy password",
      "",
      "We received a request to reset the password for your StarLiz Academy parent account.",
      `Open this secure link to choose a new password: ${resetUrl}`,
      "",
      `This link expires in ${PASSWORD_RESET_TTL_MINUTES} minutes.`,
      "If you did not request this, you can safely ignore this email.",
    ].join("\n"),
  };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = normalizeEmail(body?.email);

  if (!email) {
    return NextResponse.json({ message: GENERIC_MESSAGE });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true },
    });

    if (user) {
      const { token, tokenHash } = createPasswordResetToken();
      const resetUrl = `${RESET_URL_ORIGIN}/auth/reset-password?token=${encodeURIComponent(token)}`;
      const emailContent = buildResetEmail(resetUrl);

      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetToken: tokenHash,
          passwordResetExpires: getPasswordResetExpiry(),
        },
      });

      const sent = await sendEmail({
        to: user.email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      });

      if (!sent.ok) {
        console.error("[forgot-password] Reset email failed:", sent.reason);
      }
    }
  } catch (error) {
    console.error("[forgot-password] Reset request failed:", error);
  }

  return NextResponse.json({ message: GENERIC_MESSAGE });
}
