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

  let result: Awaited<ReturnType<typeof testTrueNumerisConnection>>;
  try {
    result = await testTrueNumerisConnection(session.userId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error during connection test.";
    return NextResponse.json(
      { ok: false, statusCode: 500, message: msg, checkedAt: new Date().toISOString() },
      { status: 500 },
    );
  }
  const responseStatus = result.ok ? 200 : Math.max(400, result.statusCode || 502);
  return NextResponse.json(result, { status: responseStatus });
}
