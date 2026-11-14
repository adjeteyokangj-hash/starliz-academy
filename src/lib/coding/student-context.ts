import { NextResponse } from "next/server";
import { resolveActiveChildForSession } from "@/lib/activeChild";
import { requireSession } from "@/lib/api_guard";
import { prisma } from "@/lib/db";
import { ensureLearningAccess } from "@/lib/subscriptions/learning-access";
import { evaluateStudentAssignmentAccess } from "@/lib/schools/licensing";
import { resolveShortLearningSchoolStudentIdsForChild } from "@/lib/schools/short-learning-bookings";
import { isShortLearningBookingActive } from "@/lib/schools/support-eligibility";
import { codingPlanIncludesLab } from "@/lib/coding/learning/entitlements";
export type CodingFunding = { kind: "covered" } | { kind: "trial"; parentId: string };

export async function requireCodingLearner(context?: { bookingId?: string | null }) {
  const { session, response } = await requireSession();
  if (!session) return { child: null, response };
  const resolved = await resolveActiveChildForSession(session);
  if (!resolved.ok) {
    return {
      child: null,
      response: NextResponse.json({ error: "Choose a learner profile first." }, { status: 400 }),
    };
  }
  const child = await prisma.childProfile.findFirst({
    where: { id: resolved.childId, archived: false },
    select: { id: true, yearGroup: true, name: true, age: true },
  });
  if (!child) {
    return {
      child: null,
      response: NextResponse.json({ error: "Learner profile not found." }, { status: 404 }),
    };
  }
  // School learning is covered by a valid school licence; home learning uses
  // the existing consent, subscription, payment and trial-limit decisions.
  const consent = await prisma.user.findUnique({
    where: { id: resolved.parentId }, select: { consentAcceptedAt: true, consentWithdrawnAt: true },
  });
  if (!consent?.consentAcceptedAt || consent.consentWithdrawnAt) {
    return { child: null, response: NextResponse.json({ error: "Parent consent is required before Coding learning.", code: "CONSENT_REQUIRED" }, { status: 403 }) };
  }
  if (context?.bookingId) {
    const ids = await resolveShortLearningSchoolStudentIdsForChild(child.id);
    const booking = await prisma.studentLearningBooking.findFirst({
      where: { id: context.bookingId, schoolStudentId: { in: ids }, parentUserId: resolved.parentId },
      select: { startsAt: true, endsAt: true, status: true, subject: true },
    });
    if (booking && booking.subject.trim().toLowerCase() === "coding" && isShortLearningBookingActive(booking)) {
      return { child, response: null as unknown as NextResponse, billing: { kind: "covered" } as CodingFunding };
    }
    return { child: null, response: NextResponse.json({ error: "An active Coding booking for this learner is required.", code: "BOOKING_ACCESS_DENIED" }, { status: 403 }) };
  }
  const school = await evaluateStudentAssignmentAccess(child.id);
  if (!(school.allowed && school.schoolId)) {
    const access = await ensureLearningAccess(resolved.parentId);
    if (access.response) return { child: null, response: access.response };
    if (!await codingPlanIncludesLab({ parentId: resolved.parentId })) return { child: null, response: NextResponse.json({ error: "Your current subscription does not include Coding Learning.", code: "CODING_ACCESS_REQUIRED" }, { status: 402 }) };
    return { child, response: null as unknown as NextResponse, billing: (access.decision.hasPaidSubscription ? { kind: "covered" } : { kind: "trial", parentId: resolved.parentId }) as CodingFunding };
  } else if (!await codingPlanIncludesLab({ schoolId: school.schoolId })) {
    return { child: null, response: NextResponse.json({ error: "This school licence does not include Coding Learning.", code: "CODING_LICENCE_REQUIRED" }, { status: 403 }) };
  }
  return { child, response: null as unknown as NextResponse, billing: { kind: "covered" } as CodingFunding };
}
