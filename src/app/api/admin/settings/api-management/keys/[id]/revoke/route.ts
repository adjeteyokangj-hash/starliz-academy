import { NextResponse } from "next/server";
import { requireAdminPermission, checkRateLimit } from "@/lib/api_guard";
import { revokeApiKey } from "@/lib/api-management";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Ctx) {
  const { session, response } = await requireAdminPermission("MANAGE_API_KEYS");
  if (!session) return response;

  const rate = checkRateLimit({
    key: `admin:api-mgmt-key-revoke:${session.userId}`,
    limit: 30,
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
    const key = await revokeApiKey(id, session.userId);
    return NextResponse.json({ key });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to revoke API key.";
    const status = message === "API key not found." ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
