import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { prisma } from "@/lib/db";
import { getActiveGuidanceForChild } from "@/lib/schools/human-support-scheduler";

/**
 * Student-facing one-way teacher guidance for an active human support session.
 * Never returns private tutor notes or full snapshot internals.
 */
export async function GET() {
  const { session, response } = await requireSession();
  if (!session) return response;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { activeChildId: true },
  });
  const childId = user?.activeChildId;
  if (!childId) {
    return NextResponse.json({ ok: true, guidance: null, session: null });
  }

  const link = await prisma.schoolStudent.findFirst({
    where: { childId, status: "active" },
    select: { schoolId: true },
  });
  if (!link) {
    return NextResponse.json({ ok: true, guidance: null, session: null });
  }

  const active = await getActiveGuidanceForChild({
    schoolId: link.schoolId,
    childId,
  });

  if (!active) {
    return NextResponse.json({ ok: true, guidance: null, session: null });
  }

  return NextResponse.json({
    ok: true,
    session: {
      sessionId: active.sessionId,
      plannedEndsAt: active.plannedEndsAt,
      returnAction: active.returnAction,
    },
    guidance: active.guidance
      ? {
          text: active.guidance.text,
          createdAt: active.guidance.createdAt,
        }
      : null,
    banner: active.guidance
      ? `Teacher says: ${active.guidance.text}`
      : null,
  });
}
