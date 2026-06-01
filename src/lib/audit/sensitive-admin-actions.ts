import { prisma } from "@/lib/db";

type SensitiveAdminAuditInput = {
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
};

type SensitiveAdminAuditDeps = {
  createAuditLog: (input: {
    actorUserId: string;
    action: string;
    entityType: string;
    entityId: string;
    metadataJson?: string;
  }) => Promise<{ id: string }>;
};

export async function logSensitiveAdminAction(
  input: SensitiveAdminAuditInput,
  deps: SensitiveAdminAuditDeps = {
    createAuditLog: async (payload) => {
      const row = await prisma.auditLog.create({ data: payload });
      return { id: row.id };
    },
  },
): Promise<{ id: string }> {
  return await deps.createAuditLog({
    actorUserId: input.actorUserId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    metadataJson: input.metadata ? JSON.stringify(input.metadata) : undefined,
  });
}
