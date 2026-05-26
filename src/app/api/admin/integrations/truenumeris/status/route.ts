import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api_guard";
import { getTrueNumerisSettings } from "@/lib/truenumeris/integration";
import { getFinancialSyncQueueStats } from "@/lib/billing/reconciliation";

export async function GET() {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  const [settings, queue] = await Promise.all([
    getTrueNumerisSettings(),
    getFinancialSyncQueueStats(),
  ]);

  return NextResponse.json({
    ok: true,
    status: {
      enabled: settings.enabled,
      region: settings.region,
      lastSyncAt: settings.lastSyncAt,
      lastSyncStatus: settings.lastSyncStatus,
      lastSyncMessage: settings.lastSyncMessage,
      queue,
    },
  });
}
