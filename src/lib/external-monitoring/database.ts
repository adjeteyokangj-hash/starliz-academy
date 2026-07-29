import { prisma } from "@/lib/db";
import type { MonitoringStatus } from "./capability-registry";
import { mapBinaryReachability } from "./status";

export type DatabaseStatusReport = {
  status: MonitoringStatus;
  checkedAt: string;
};

export async function getDatabaseStatus(): Promise<DatabaseStatusReport> {
  let ok: boolean | null = null;
  try {
    await prisma.$queryRaw`SELECT 1`;
    ok = true;
  } catch {
    // Never expose the underlying database error to external clients.
    ok = false;
  }

  return {
    status: mapBinaryReachability(ok),
    checkedAt: new Date().toISOString(),
  };
}
