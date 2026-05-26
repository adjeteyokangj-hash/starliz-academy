import { NextResponse } from "next/server";
import { checkRateLimit, requireAdminPermission } from "@/lib/api_guard";
import { testTrueNumerisConnection } from "@/lib/truenumeris/client";

export async function POST() {
  const { session, response } = await requireAdminPermission("settings:api_keys:test");
  if (!session) return response;

  const rateCheck = checkRateLimit({
    key: `admin:truenumeris:test:${session.userId}`,
    limit: 20,
    windowMs: 60_000,
  });

  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "Too many test attempts." },
      { status: 429, headers: { "Retry-After": String(rateCheck.retryAfterSeconds) } },
    );
  }

  const result = await testTrueNumerisConnection(session.userId);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
