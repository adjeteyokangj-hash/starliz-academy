import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission, checkRateLimit } from "@/lib/api_guard";
import { generateApiKey, listGeneratedKeys } from "@/lib/api-management";
import { API_SCOPES } from "@/lib/api-management/scopes";

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  environment: z.enum(["test", "live"]),
  scopes: z.array(z.enum(API_SCOPES)).min(1),
  expiresAt: z.string().datetime().optional().nullable(),
  rateLimit: z.number().int().min(1).max(10_000).optional(),
});

export async function GET() {
  const { session, response } = await requireAdminPermission("MANAGE_API_KEYS");
  if (!session) return response;

  const keys = await listGeneratedKeys();
  return NextResponse.json({ keys });
}

export async function POST(request: Request) {
  const { session, response } = await requireAdminPermission("MANAGE_API_KEYS");
  if (!session) return response;

  const rate = checkRateLimit({
    key: `admin:api-mgmt-key-create:${session.userId}`,
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
    const body = createSchema.parse(await request.json());
    const result = await generateApiKey(
      {
        name: body.name,
        description: body.description,
        environment: body.environment,
        scopes: body.scopes,
        expiresAt: body.expiresAt ?? null,
        rateLimit: body.rateLimit,
        createdByAdminId: session.userId,
      },
      session.userId,
    );

    return NextResponse.json(
      {
        key: result.record,
        fullKey: result.fullKey,
        warning: "Copy this key now. It will not be shown again.",
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid API key payload." }, { status: 400 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate API key." },
      { status: 400 },
    );
  }
}
