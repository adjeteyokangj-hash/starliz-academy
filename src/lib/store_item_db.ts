import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type StorePolicyWrite = {
  rewardType?: string;
  approvalMode?: string;
  stockTotal?: number | null;
};

export type StoreItemPolicyRow = {
  id: string;
  rewardType: string;
  approvalMode: string;
  stockTotal: number | null;
};

/** Prisma client may lag schema until `prisma generate`; keep policy fields off typed writes. */
export function splitStoreItemWrite<T extends Record<string, unknown>>(data: T): {
  base: Omit<T, "rewardType" | "approvalMode" | "stockTotal">;
  policy: StorePolicyWrite;
} {
  const { rewardType, approvalMode, stockTotal, ...base } = data;
  return {
    base: base as Omit<T, "rewardType" | "approvalMode" | "stockTotal">,
    policy: {
      rewardType: typeof rewardType === "string" ? rewardType : undefined,
      approvalMode: typeof approvalMode === "string" ? approvalMode : undefined,
      stockTotal:
        stockTotal === undefined
          ? undefined
          : stockTotal === null
            ? null
            : Number(stockTotal),
    },
  };
}

export async function applyStoreItemPolicy(id: string, policy: StorePolicyWrite): Promise<void> {
  const sets: Prisma.Sql[] = [];
  if (policy.rewardType !== undefined) {
    sets.push(Prisma.sql`"rewardType" = ${policy.rewardType}`);
  }
  if (policy.approvalMode !== undefined) {
    sets.push(Prisma.sql`"approvalMode" = ${policy.approvalMode}`);
  }
  if (policy.stockTotal !== undefined) {
    sets.push(Prisma.sql`"stockTotal" = ${policy.stockTotal}`);
  }
  if (!sets.length) return;

  await prisma.$executeRaw(
    Prisma.sql`UPDATE "StoreItem" SET ${Prisma.join(sets, ", ")} WHERE "id" = ${id}`,
  );
}

export async function enrichStoreItemsWithPolicy<T extends { id: string }>(
  records: T[],
): Promise<Array<T & StoreItemPolicyRow>> {
  if (!records.length) return [];
  const ids = records.map((row) => row.id);
  try {
    const rows = await prisma.$queryRaw<StoreItemPolicyRow[]>(
      Prisma.sql`
        SELECT "id", "rewardType", "approvalMode", "stockTotal"
        FROM "StoreItem"
        WHERE "id" IN (${Prisma.join(ids)})
      `,
    );
    const byId = new Map(rows.map((row) => [row.id, row]));
    return records.map((record) => {
      const policy = byId.get(record.id);
      return {
        ...record,
        rewardType: policy?.rewardType ?? "digital",
        approvalMode: policy?.approvalMode ?? "none",
        stockTotal: policy?.stockTotal ?? null,
      };
    });
  } catch {
    // Columns missing or client/DB mismatch — keep records usable with defaults.
    return records.map((record) => ({
      ...record,
      rewardType: "digital",
      approvalMode: "none",
      stockTotal: null,
    }));
  }
}
