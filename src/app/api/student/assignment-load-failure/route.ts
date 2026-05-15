import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { writeAuditLog } from "@/lib/audit";

const payloadSchema = z.object({
  assignmentId: z.string().trim().min(1).optional(),
  contentId: z.string().trim().min(1).optional(),
  subject: z.string().trim().optional(),
  skillFocus: z.string().trim().optional(),
  yearGroup: z.string().trim().optional(),
  keyStage: z.string().trim().optional(),
  reason: z.string().trim().min(1),
  details: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  try {
    const body = payloadSchema.parse(await request.json());
    await writeAuditLog({
      actorUserId: session.userId,
      action: "student.assignment_content_load_failed",
      entityType: "assignment",
      entityId: body.assignmentId,
      metadata: {
        parentId: parentScope.parentId,
        assignmentId: body.assignmentId ?? null,
        contentId: body.contentId ?? null,
        subject: body.subject ?? null,
        skillFocus: body.skillFocus ?? null,
        yearGroup: body.yearGroup ?? null,
        keyStage: body.keyStage ?? null,
        reason: body.reason,
        details: body.details ?? null,
      },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid failure payload." }, { status: 400 });
  }
}
