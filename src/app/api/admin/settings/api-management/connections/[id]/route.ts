import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission, checkRateLimit } from "@/lib/api_guard";
import {
  AUTH_TYPES,
  CONNECTION_ENVIRONMENTS,
  deleteConnection,
  getConnection,
  parseAdditionalHeaders,
  updateConnection,
} from "@/lib/api-management";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  baseUrl: z.string().trim().url().optional(),
  authType: z.enum(AUTH_TYPES).optional(),
  credential: z.string().optional().nullable(),
  clearCredential: z.boolean().optional(),
  headerName: z.string().trim().max(100).optional().nullable(),
  additionalHeaders: z.unknown().optional().nullable(),
  clearAdditionalHeaders: z.boolean().optional(),
  environment: z.enum(CONNECTION_ENVIRONMENTS).optional(),
  enabled: z.boolean().optional(),
});

export async function GET(_request: Request, context: Ctx) {
  const { session, response } = await requireAdminPermission("MANAGE_API_KEYS");
  if (!session) return response;

  const { id } = await context.params;
  const connection = await getConnection(id);
  if (!connection) {
    return NextResponse.json({ error: "Connection not found." }, { status: 404 });
  }
  return NextResponse.json({ connection });
}

export async function PATCH(request: Request, context: Ctx) {
  const { session, response } = await requireAdminPermission("MANAGE_API_KEYS");
  if (!session) return response;

  const rate = checkRateLimit({
    key: `admin:api-mgmt-conn-patch:${session.userId}`,
    limit: 60,
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
    const body = patchSchema.parse(await request.json());
    let additionalHeaders: Record<string, string> | null | undefined;
    if (body.additionalHeaders !== undefined) {
      try {
        additionalHeaders = parseAdditionalHeaders(body.additionalHeaders);
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "Invalid additional headers." },
          { status: 400 },
        );
      }
    }

    const connection = await updateConnection(
      id,
      {
        name: body.name,
        description: body.description,
        baseUrl: body.baseUrl,
        authType: body.authType,
        credential: body.credential,
        clearCredential: body.clearCredential,
        headerName: body.headerName,
        additionalHeaders,
        clearAdditionalHeaders: body.clearAdditionalHeaders,
        environment: body.environment,
        enabled: body.enabled,
      },
      session.userId,
    );

    return NextResponse.json({ connection });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid update payload." }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Failed to update connection.";
    const status = message === "Connection not found." ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_request: Request, context: Ctx) {
  const { session, response } = await requireAdminPermission("MANAGE_API_KEYS");
  if (!session) return response;

  try {
    const { id } = await context.params;
    await deleteConnection(id, session.userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete connection.";
    const status = message === "Connection not found." ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
