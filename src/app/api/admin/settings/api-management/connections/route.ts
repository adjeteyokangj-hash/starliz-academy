import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission, checkRateLimit } from "@/lib/api_guard";
import {
  AUTH_TYPES,
  CONNECTION_ENVIRONMENTS,
  createConnection,
  listConnections,
  parseAdditionalHeaders,
} from "@/lib/api-management";

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  baseUrl: z.string().trim().url(),
  authType: z.enum(AUTH_TYPES),
  credential: z.string().optional().nullable(),
  headerName: z.string().trim().max(100).optional().nullable(),
  additionalHeaders: z.unknown().optional().nullable(),
  environment: z.enum(CONNECTION_ENVIRONMENTS).optional(),
  enabled: z.boolean().optional(),
});

export async function GET() {
  const { session, response } = await requireAdminPermission("MANAGE_API_KEYS");
  if (!session) return response;

  const connections = await listConnections();
  return NextResponse.json({ connections });
}

export async function POST(request: Request) {
  const { session, response } = await requireAdminPermission("MANAGE_API_KEYS");
  if (!session) return response;

  const rate = checkRateLimit({
    key: `admin:api-mgmt-conn-create:${session.userId}`,
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
    const body = createSchema.parse(await request.json());
    let additionalHeaders: Record<string, string> | null = null;
    try {
      additionalHeaders = parseAdditionalHeaders(body.additionalHeaders ?? null);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Invalid additional headers." },
        { status: 400 },
      );
    }

    const connection = await createConnection(
      {
        name: body.name,
        description: body.description,
        baseUrl: body.baseUrl,
        authType: body.authType,
        credential: body.credential,
        headerName: body.headerName,
        additionalHeaders,
        environment: body.environment,
        enabled: body.enabled,
        createdByAdminId: session.userId,
      },
      session.userId,
    );

    return NextResponse.json({ connection }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid connection payload." }, { status: 400 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create connection." },
      { status: 400 },
    );
  }
}
