import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import type { SchoolInviteType } from "@prisma/client";

const DEFAULT_INVITE_TTL_HOURS = 72;

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

type CreateSchoolInviteTokenInput = {
  schoolId: string;
  inviteType: SchoolInviteType;
  targetEmail: string;
  targetRole?: string;
  targetSchoolStudentId?: string;
  createdByUserId?: string;
  metadata?: Record<string, unknown>;
  ttlHours?: number;
};

/**
 * Generic invite token lifecycle infrastructure for teacher/admin/parent invites.
 * Existing teacher-specific flow can continue in parallel while callers migrate.
 */
export async function createSchoolInviteToken(input: CreateSchoolInviteTokenInput) {
  const raw = randomBytes(32).toString("hex");
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + (input.ttlHours ?? DEFAULT_INVITE_TTL_HOURS) * 60 * 60 * 1000);

  // Invalidate old active invites for same school + target + type.
  await prisma.schoolInviteToken.updateMany({
    where: {
      schoolId: input.schoolId,
      inviteType: input.inviteType,
      targetEmail: input.targetEmail.toLowerCase(),
      usedAt: null,
    },
    data: { usedAt: new Date() },
  });

  await prisma.schoolInviteToken.create({
    data: {
      schoolId: input.schoolId,
      inviteType: input.inviteType,
      targetEmail: input.targetEmail.toLowerCase(),
      targetRole: input.targetRole ?? null,
      targetSchoolStudentId: input.targetSchoolStudentId ?? null,
      tokenHash,
      expiresAt,
      createdByUserId: input.createdByUserId ?? null,
      metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
    },
  });

  return raw;
}

export async function validateSchoolInviteToken(rawToken: string) {
  const tokenHash = hashToken(rawToken);
  const token = await prisma.schoolInviteToken.findUnique({
    where: { tokenHash },
    include: { school: { select: { id: true, name: true } } },
  });

  if (!token) return { valid: false as const, reason: "NOT_FOUND" as const, token: null };
  if (token.usedAt) return { valid: false as const, reason: "ALREADY_USED" as const, token };
  if (token.expiresAt < new Date()) return { valid: false as const, reason: "EXPIRED" as const, token };

  return { valid: true as const, reason: null, token };
}

export async function consumeSchoolInviteToken(tokenId: string, consumedByUserId?: string) {
  await prisma.schoolInviteToken.update({
    where: { id: tokenId },
    data: {
      usedAt: new Date(),
      consumedByUserId: consumedByUserId ?? null,
    },
  });
}
