import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { prisma } from "@/lib/db";
import { canDo } from "@/lib/schools/permissions";
import { requireSchoolAdminContext } from "@/lib/schools/portal-routing";
import {
  BOOKING_AUDIT_ACTIONS,
  BOOKING_ENTITY_TYPE,
  bookingChangeRequiresReview,
  bookingChangeSourceLabel,
  formatBookingRef,
  parseBookingChangeEvent,
  resolveBookingActorKind,
  type BookingChangeActorKind,
  type BookingSnapshot,
} from "@/lib/schools/short-learning-booking-audit";

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
        include: {
          child: { select: { name: true, yearGroup: true } },
          classroom: { select: { yearGroup: true, name: true } },
        },
      },
    },
    orderBy: { startsAt: "desc" },
    take: 200,
  });

  const bookingIds = bookings.map((b) => b.id);
  const parentIds = [...new Set(bookings.map((b) => b.parentUserId))];
  const parents = parentIds.length
    ? await prisma.user.findMany({
        where: { id: { in: parentIds } },
        select: { id: true, email: true, name: true },
      })
    : [];
  const parentById = new Map(parents.map((p) => [p.id, p]));

  const auditRows = bookingIds.length
    ? await prisma.schoolAuditLog.findMany({
        where: {
          schoolId: ctx.schoolId,
          entityType: BOOKING_ENTITY_TYPE,
          entityId: { in: bookingIds },
          action: { in: [...BOOKING_AUDIT_ACTIONS] },
        },
        orderBy: { createdAt: "desc" },
        take: 500,
      })
    : [];

  const latestByBooking = new Map<string, (typeof auditRows)[number]>();
  for (const row of auditRows) {
    if (!row.entityId || latestByBooking.has(row.entityId)) continue;
    latestByBooking.set(row.entityId, row);
  }

  const now = new Date();
  const recentChanges = auditRows
    .filter((row) => now.getTime() - row.createdAt.getTime() <= 7 * 86_400_000)
    .slice(0, 12)
    .map((row) => parseBookingChangeEvent(row, now));

  const changesRequiringReview = recentChanges.filter((event) => event.requiresReview).length;

  return NextResponse.json({
    ok: true,
    schoolId: ctx.schoolId,
    recentChanges,
    changesRequiringReview,
    bookings: bookings.map((row) => {
      const latest = latestByBooking.get(row.id);
      const latestEvent = latest ? parseBookingChangeEvent(latest, now) : null;
      let actorKind: BookingChangeActorKind | null = latestEvent?.actorKind ?? null;
      if (!actorKind) {
        actorKind = resolveBookingActorKind({
          source: row.source,
          actorUserId: row.parentUserId,
          parentUserId: row.parentUserId,
        });
      }
      const parent = parentById.get(row.parentUserId);
      const yearGroup =
        row.schoolStudent.child.yearGroup
        ?? row.schoolStudent.classroom?.yearGroup
        ?? null;

      return {
        id: row.id,
        bookingRef: formatBookingRef(row.id),
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        durationMinutes: row.durationMinutes,
        subject: row.subject,
        status: row.status,
        studentName: row.schoolStudent.child.name,
        yearGroup,
        parentName: parent?.name ?? null,
        parentEmail: parent?.email ?? null,
        lastChangedAt: latestEvent?.createdAt ?? row.updatedAt.toISOString(),
        changeIndicator: latestEvent
          ? {
              label: latestEvent.actorLabel,
              actorKind: latestEvent.actorKind,
              summary: latestEvent.summary,
              requiresReview: latestEvent.requiresReview,
            }
          : row.updatedAt.getTime() > row.createdAt.getTime() + 1000
            ? {
                label: bookingChangeSourceLabel(actorKind),
                actorKind,
                summary: "Updated",
                requiresReview: bookingChangeRequiresReview({
                  action: "short_learning_booking_changed",
                  actorKind,
                  before: null,
                  after: {
                    startsAt: row.startsAt.toISOString(),
                    durationMinutes: row.durationMinutes,
                    subject: row.subject,
                    status: row.status,
                  } satisfies BookingSnapshot,
                  createdAt: row.updatedAt,
                  now,
                }),
              }
            : null,
      };
    }),
  });
}