import { prisma } from "@/lib/db";

type AuditInput = {
  actorUserId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
};

export async function writeAuditLog({ actorUserId, action, entityType, entityId, metadata }: AuditInput) {
  await prisma.auditLog.create({
    data: {
      actorUserId,
      action,
      entityType,
      entityId,
      metadataJson: metadata ? JSON.stringify(metadata) : undefined,
    },
  });
}

