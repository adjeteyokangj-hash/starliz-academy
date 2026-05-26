import { prisma } from "@/lib/db";

export type SyncQueueStats = {
  pending: number;
  failed: number;
  synced: number;
  lastSyncAt: Date | null;
  failedRefs: string[];
};

function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { code?: string; message?: string };
  if (maybeError.code === "P2021" || maybeError.code === "P2022") return true;
  const message = String(maybeError.message ?? "").toLowerCase();
  return (
    message.includes("does not exist")
    || message.includes("not found in the current database")
    || (message.includes("cannot read properties of undefined") && message.includes("findmany"))
  );
}

export async function getFinancialSyncQueueStats(): Promise<SyncQueueStats> {
  try {
    const [pending, failed, synced, lastSynced, failedRows] = await Promise.all([
      prisma.financialSyncEvent.count({ where: { syncStatus: "pending" } }),
      prisma.financialSyncEvent.count({ where: { syncStatus: "failed" } }),
      prisma.financialSyncEvent.count({ where: { syncStatus: "synced" } }),
      prisma.financialSyncEvent.findFirst({
        where: { syncedAt: { not: null } },
        orderBy: { syncedAt: "desc" },
        select: { syncedAt: true },
      }),
      prisma.financialSyncEvent.findMany({
        where: { syncStatus: "failed" },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: { paymentReference: true },
      }),
    ]);

    return {
      pending,
      failed,
      synced,
      lastSyncAt: lastSynced?.syncedAt ?? null,
      failedRefs: failedRows.map((row) => row.paymentReference).filter((ref): ref is string => Boolean(ref)),
    };
  } catch (error) {
    if (isMissingTableError(error)) {
      return {
        pending: 0,
        failed: 0,
        synced: 0,
        lastSyncAt: null,
        failedRefs: [],
      };
    }
    throw error;
  }
}

export async function retryFailedFinancialSyncs(limit = 50): Promise<{ retried: number }> {
  let failedRows: Array<{ id: string }> = [];
  try {
    failedRows = await prisma.financialSyncEvent.findMany({
      where: { syncStatus: "failed" },
      orderBy: { createdAt: "asc" },
      take: limit,
      select: { id: true },
    });
  } catch (error) {
    if (isMissingTableError(error)) return { retried: 0 };
    throw error;
  }

  if (!failedRows.length) {
    return { retried: 0 };
  }

  try {
    await prisma.financialSyncEvent.updateMany({
      where: { id: { in: failedRows.map((row) => row.id) } },
      data: {
        syncStatus: "pending",
        errorMessage: null,
      },
    });
  } catch (error) {
    if (isMissingTableError(error)) return { retried: 0 };
    throw error;
  }

  return { retried: failedRows.length };
}

export async function getFinancialDashboardSnapshot() {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  try {
    const [todayRevenueRows, monthlyRevenueRows, vatRows, failedPayments, queue] = await Promise.all([
      prisma.financialInvoice.findMany({
        where: { createdAt: { gte: startOfDay }, status: { in: ["issued", "paid"] } },
        select: { grossAmount: true },
      }),
      prisma.financialInvoice.findMany({
        where: { createdAt: { gte: startOfMonth }, status: { in: ["issued", "paid"] } },
        select: { grossAmount: true },
      }),
      prisma.financialInvoice.findMany({
        where: { createdAt: { gte: startOfMonth }, status: { in: ["issued", "paid"] } },
        select: { vatAmount: true },
      }),
      prisma.financialSyncEvent.count({ where: { eventType: "subscription_payment_failed" } }),
      getFinancialSyncQueueStats(),
    ]);

    const toNumber = (value: unknown): number => Number(value ?? 0);
    const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

    return {
      todayRevenue: sum(todayRevenueRows.map((row) => toNumber(row.grossAmount))),
      monthlyRevenue: sum(monthlyRevenueRows.map((row) => toNumber(row.grossAmount))),
      vatCollected: sum(vatRows.map((row) => toNumber(row.vatAmount))),
      failedPayments,
      pendingSyncs: queue.pending,
      reconciliationStatus: queue.failed > 0 ? "attention" : "healthy",
      mrr: 0,
      arr: 0,
      churn: 0,
      taxLiabilityEstimate: sum(vatRows.map((row) => toNumber(row.vatAmount))),
    };
  } catch (error) {
    if (isMissingTableError(error)) {
      return {
        todayRevenue: 0,
        monthlyRevenue: 0,
        vatCollected: 0,
        failedPayments: 0,
        pendingSyncs: 0,
        reconciliationStatus: "unavailable",
        mrr: 0,
        arr: 0,
        churn: 0,
        taxLiabilityEstimate: 0,
      };
    }
    throw error;
  }
}
