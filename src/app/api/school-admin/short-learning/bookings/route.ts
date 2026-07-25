import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { prisma } from "@/lib/db";
import { canDo } from "@/lib/schools/permissions";
import { requireSchoolAdminContext } from "@/lib/schools/portal-routing";

export async function GET() {
  const { session, response } = await requireSession();
  if (!session) return response;

  const ctx = await requireSchoolAdminContext(session.userId);
  if (!ctx) {
    return NextResponse.json({ error: "School admin access required." }, { status: 403 });
  }
  if (!canDo(ctx.role, "viewStudents") && !canDo(ctx.role, "viewDashboard")) {
    return NextResponse.json({ error: "Not permitted to view bookings." }, { status: 403 });
  }

  const bookings = await prisma.studentLearningBooking.findMany({
    where: { schoolId: ctx.schoolId },
    include: {
      schoolStudent: {
        include: { child: { select: { name: true } } },
      },
    },
    orderBy: { startsAt: "desc" },
    take: 200,
  });

  const parentIds = [...new Set(bookings.map((b) => b.parentUserId))];
  const parents = parentIds.length
    ? await prisma.user.findMany({
        where: { id: { in: parentIds } },
        select: { id: true, email: true, name: true },
      })
    : [];
  const parentById = new Map(parents.map((p) => [p.id, p]));

  return NextResponse.json({
    ok: true,
    bookings: bookings.map((row) => ({
      id: row.id,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      durationMinutes: row.durationMinutes,
      subject: row.subject,
      status: row.status,
      studentName: row.schoolStudent.child.name,
      parentEmail: parentById.get(row.parentUserId)?.email ?? null,
    })),
  });
}
