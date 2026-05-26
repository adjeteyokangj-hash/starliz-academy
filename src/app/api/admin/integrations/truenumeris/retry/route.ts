import { NextResponse } from "next/server";
import { checkRateLimit, requireAdminPermission } from "@/lib/api_guard";
import { retryFailedFinancialSyncs } from "@/lib/billing/reconciliation";
import { syncHistoricalTransactions } from "@/lib/truenumeris/client";

export async function POST() {
  const { session, response } = await requireAdminPermission("settings:api_keys:test");
  if (!session) return response;

  const rateCheck = checkRateLimit({
    key: `admin:truenumeris:retry:${session.userId}`,
    limit: 10,
    windowMs: 60_000,
  });

  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "Too many retry attempts." },
      { status: 429, headers: { "Retry-After": String(rateCheck.retryAfterSeconds) } },
    );
  }

  const retried = await retryFailedFinancialSyncs(100);
  const syncResult = await syncHistoricalTransactions({ payload: { lookbackDays: 90, limit: 100 }, actorUserId: session.userId });

  return NextResponse.json({ ok: true, retried: retried.retried, syncResult });
}
