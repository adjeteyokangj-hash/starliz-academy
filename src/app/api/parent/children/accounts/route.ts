import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { createChildLoginAccount } from "@/lib/child-account-create";
import { writeAuditLog } from "@/lib/audit";

const profileSchema = z.object({
  name: z.string().trim().min(1).max(64),
  yearGroup: z.string().trim().min(1).max(40),
  ageYears: z.number().int().min(3).max(18),
  avatar: z.string().trim().min(1).max(16).optional(),
  dateOfBirth: z.string().trim().optional(),
  keyStageLevel: z.string().trim().max(40).optional(),
  selectedSubjects: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  learningGoals: z.array(z.string().trim().min(1).max(120)).max(8).optional(),
  senSupportNeeds: z.string().trim().max(500).optional(),
  startLevelChoice: z.enum(["Beginner", "Intermediate", "Confident"]).optional(),
});

const bodySchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("generated"),
    profile: profileSchema,
  }),
  z.object({
    mode: z.literal("manual"),
    profile: profileSchema,
    username: z.string().min(1),
    password: z.string().min(1),
  }),
]);

export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  if (session.role !== "parent") {
    return NextResponse.json(
      { error: "Only parent accounts can create child login accounts." },
      { status: 403 },
    );
  }

  const parentScope = await resolveParentScope(session);
  if (!parentScope || parentScope.parentId !== session.userId) {
    return NextResponse.json(
      { error: "Only parent accounts can create child login accounts." },
      { status: 403 },
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid child account request." }, { status: 400 });
  }

  const result = await createChildLoginAccount({
    parentId: parentScope.parentId,
    mode: body.mode,
    profile: body.profile,
    username: body.mode === "manual" ? body.username : undefined,
    password: body.mode === "manual" ? body.password : undefined,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        code: result.code,
        fieldErrors: result.fieldErrors,
      },
      { status: result.status },
    );
  }

  // Audit without plaintext credentials or password material.
  void writeAuditLog({
    actorUserId: parentScope.parentId,
    action: "child_login_account_created",
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
