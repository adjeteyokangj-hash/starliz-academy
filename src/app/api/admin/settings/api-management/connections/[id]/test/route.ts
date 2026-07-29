import { NextResponse } from "next/server";
import { requireAdminPermission, checkRateLimit } from "@/lib/api_guard";
import { testConnection } from "@/lib/api-management";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Ctx) {
  const { session, response } = await requireAdminPermission("MANAGE_API_KEYS");
  if (!session) return response;

  const rate = checkRateLimit({
    key: `admin:api-mgmt-conn-test:${session.userId}`,
    limit: 20,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many connection tests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  try {
    const { id } = await context.params;
    const result = await testConnection(id, session.userId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection test failed.";
    const status = message === "Connection not found." ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
