import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { resetChildLoginCredentials } from "@/lib/child-account-create";
import { writeAuditLog } from "@/lib/audit";

const bodySchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("generated"),
  }),
  z.object({
    mode: z.literal("manual"),
    username: z.string().optional(),
    password: z.string().min(1),
  }),
]);

type RouteContext = {
  params: Promise<{ childId: string }> | { childId: string };
};

export async function POST(request: Request, context: RouteContext) {
  const { session, response } = await requireSession();
  if (!session) return response;

  if (session.role !== "parent") {
    return NextResponse.json(
      { error: "Only parent accounts can reset child logins.", code: "forbidden" },
      { status: 403 },
    );
  }

  const parentScope = await resolveParentScope(session);
  if (!parentScope || parentScope.parentId !== session.userId) {
    return NextResponse.json(
      { error: "Only parent accounts can reset child logins.", code: "forbidden" },
      { status: 403 },
    );
  }

  const params = await Promise.resolve(context.params);
  const childId = typeof params.childId === "string" ? params.childId.trim() : "";
  if (!childId) {
    return NextResponse.json({ error: "Child id is required.", code: "child_id_required" }, { status: 400 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid Reset Login request." }, { status: 400 });
  }

  const result = await resetChildLoginCredentials({
    parentId: parentScope.parentId,
    childId,
    mode: body.mode,
    username: body.mode === "manual" ? body.username : undefined,
    password: body.mode === "manual" ? body.password : undefined,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        code: result.code,
        fieldErrors: result.fieldErrors,
        suggestions: result.suggestions ?? [],
      },
      { status: result.status },
    );
  }

  // Audit without plaintext credentials or password material.
  void writeAuditLog({
    actorUserId: parentScope.parentId,
    action: "child_login_reset",
    entityType: "ChildProfile",
    entityId: result.child.id,
    metadata: {
      mode: result.credentials.mode,
      username: result.credentials.username,
      childUserId: result.child.userId,
    },
  }).catch(() => undefined);

  return NextResponse.json({
    ok: true,
    child: result.child,
    credentials: {
      username: result.credentials.username,
      password: result.credentials.password,
      mode: result.credentials.mode,
    },
    notice:
      "Save this username and password now. The password cannot be shown again because it is not stored in plain text.",
  });
}
