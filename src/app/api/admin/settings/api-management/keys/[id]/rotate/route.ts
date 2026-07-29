import { NextResponse } from "next/server";
import { requireAdminPermission, checkRateLimit } from "@/lib/api_guard";
import { rotateApiKey } from "@/lib/api-management";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Ctx) {
  const { session, response } = await requireAdminPermission("MANAGE_API_KEYS");
  if (!session) return response;

  const rate = checkRateLimit({
    key: `admin:api-mgmt-key-rotate:${session.userId}`,
    limit: 20,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many requests." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  try {
    const { id } = await context.params;
    const result = await rotateApiKey(id, session.userId);
    return NextResponse.json({
      key: result.record,
      fullKey: result.fullKey,
      warning: "Copy this key now. It will not be shown again. The previous key has been revoked.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to rotate API key.";
    const status = message === "API key not found." ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
