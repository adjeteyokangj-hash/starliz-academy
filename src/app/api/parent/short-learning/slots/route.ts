import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { prisma } from "@/lib/db";
import {
  listAvailableSlots,
  parentHasShortLearningEntitlement,
} from "@/lib/schools/short-learning-bookings";

export async function GET(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;
  if (session.role !== "parent" && session.role !== "admin") {
    return NextResponse.json({ error: "Parent access required." }, { status: 403 });
  }

  const url = new URL(request.url);
  const schoolId = url.searchParams.get("schoolId")?.trim() || null;
  const dateIso = url.searchParams.get("date")?.trim() || null;
  const durationMinutes = Number(url.searchParams.get("durationMinutes") ?? "90");

  if (!schoolId || !dateIso) {
    return NextResponse.json({ error: "schoolId and date (YYYY-MM-DD) are required." }, { status: 400 });
  }

  const entitled = await parentHasShortLearningEntitlement(session.userId);
  if (!entitled && session.role !== "admin") {
    return NextResponse.json({ error: "An active subscription or school entitlement is required." }, { status: 403 });
  }

  const link = await prisma.parentSchoolLink.findFirst({
    where: {
      parentUserId: session.userId,
      schoolId,
      status: "active",
    },
    select: { id: true },
  });
  if (!link && session.role !== "admin") {
    return NextResponse.json({ error: "No active link to this school." }, { status: 403 });
  }

  const slots = await listAvailableSlots({
    schoolId,
    dateIso,
    durationMinutes: Number.isFinite(durationMinutes) ? durationMinutes : 90,
  });

  return NextResponse.json({
    ok: true,
    slots: slots.map((slot) => ({
      startsAt: slot.startsAt.toISOString(),
      endsAt: slot.endsAt.toISOString(),
      durationMinutes: slot.durationMinutes,
      capacityRemaining: slot.capacityRemaining,
      lateBooking: slot.lateBooking,
    })),
  });
}
