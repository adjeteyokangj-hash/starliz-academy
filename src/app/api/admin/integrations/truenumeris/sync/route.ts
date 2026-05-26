import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, requireAdminPermission } from "@/lib/api_guard";
import { syncHistoricalTransactions } from "@/lib/truenumeris/client";

const payloadSchema = z.object({
  lookbackDays: z.number().int().min(1).max(365).default(30),
  limit: z.number().int().min(1).max(1000).default(200),
});

export async function POST(request: Request) {
  const { session, response } = await requireAdminPermission("settings:api_keys:test");
  if (!session) return response;

  const rateCheck = checkRateLimit({
    key: `admin:truenumeris:sync:${session.userId}`,
    limit: 10,
    windowMs: 60_000,
  });

  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "Too many sync attempts." },
      { status: 429, headers: { "Retry-After": String(rateCheck.retryAfterSeconds) } },
    );
  }

  try {
    const payload = payloadSchema.parse(await request.json().catch(() => ({})));
    const result = await syncHistoricalTransactions({ payload, actorUserId: session.userId });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Invalid sync payload." }, { status: 400 });
  }
}
