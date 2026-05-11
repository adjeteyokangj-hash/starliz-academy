/**
 * Teacher invite token utilities.
 *
 * Token lifecycle:
 *   1. Admin issues invite → createInviteToken() generates a signed token
 *   2. Token is emailed as a link: /invite/accept?token=<raw>
 *   3. Teacher opens link → POST /api/auth/teacher-invite/accept validates token + sets password
 *   4. SchoolTeacher status updated to "active", token marked usedAt
 *   5. If expired/used: admin can resendInvite → invalidates old token, creates new one
 *
 * Security:
 *   - Raw token never stored — only SHA-256 hash
 *   - Token expires after INVITE_TOKEN_TTL_HOURS
 *   - Single-use (usedAt is set on acceptance)
 */

import { randomBytes, createHash } from "crypto";
import { prisma } from "@/lib/db";

const INVITE_TOKEN_TTL_HOURS = 72;

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Creates a new invite token for a SchoolTeacher record.
 * Any existing unused token for this teacher is invalidated (usedAt = now).
 *
 * @returns the raw token to include in the invite URL
 */
export async function createInviteToken(schoolTeacherId: string): Promise<string> {
  const raw = randomBytes(32).toString("hex");
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + INVITE_TOKEN_TTL_HOURS * 60 * 60 * 1000);

  // Invalidate any existing active token for this teacher
  await prisma.teacherInviteToken.updateMany({
    where: { schoolTeacherId, usedAt: null },
    data: { usedAt: new Date() },
  });

  await prisma.teacherInviteToken.create({
    data: {
      schoolTeacherId,
      tokenHash,
      expiresAt,
    },
  });

  return raw;
}

/**
 * Validates a raw invite token.
 * Returns the TeacherInviteToken with its schoolTeacher relation, or null if invalid.
 */
export async function validateInviteToken(raw: string) {
  const tokenHash = hashToken(raw);

  const token = await prisma.teacherInviteToken.findUnique({
    where: { tokenHash },
    include: {
      schoolTeacher: {
        include: {
          school: { select: { id: true, name: true } },
          user: { select: { id: true, email: true, name: true } },
        },
      },
    },
  });

  if (!token) return { valid: false, reason: "NOT_FOUND" as const, token: null };
  if (token.usedAt) return { valid: false, reason: "ALREADY_USED" as const, token };
  if (token.expiresAt < new Date()) return { valid: false, reason: "EXPIRED" as const, token };

  return { valid: true, reason: null, token };
}

/**
 * Marks a token as used.
 */
export async function consumeInviteToken(tokenId: string): Promise<void> {
  await prisma.teacherInviteToken.update({
    where: { id: tokenId },
    data: { usedAt: new Date() },
  });
}

/**
 * Resends invite: increments resentCount + resentAt, then creates a fresh token.
 *
 * @returns the new raw token
 */
export async function resendInviteToken(schoolTeacherId: string): Promise<string> {
  // Mark any existing token as resent (expire it)
  await prisma.teacherInviteToken.updateMany({
    where: { schoolTeacherId, usedAt: null },
    data: { usedAt: new Date(), resentAt: new Date(), resentCount: { increment: 1 } },
  });

  return createInviteToken(schoolTeacherId);
}
