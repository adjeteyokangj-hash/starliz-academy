import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import { readChildSelectionFromCookie, readSessionFromCookie } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SHORT_LEARNING_PROMISE } from "@/lib/schools/short-learning-bookings";
import { isShortLearningBookingActive } from "@/lib/schools/support-eligibility";
import { resolveParentActiveChildId } from "@/lib/activeChild";
import { resolveParentScope } from "@/lib/parent_scope";

type Params = { params: Promise<{ bookingId: string }> };

export default async function StudentShortLearningSessionPage({ params }: Params) {
  const session = await readSessionFromCookie();
  if (!session) redirect("/auth/login?next=/student/short-learning");

  let childId: string | null = await readChildSelectionFromCookie(session.userId);
  if (!childId && session.role === "parent") {
    const parentScope = await resolveParentScope(session);
    if (parentScope) childId = await resolveParentActiveChildId(parentScope.parentId);
  }
  if (!childId) {
    redirect("/parent/profiles?intent=child&next=/student/short-learning");
  }

  const { bookingId } = await params;
  const booking = await prisma.studentLearningBooking.findFirst({
    where: {
      id: bookingId,
      schoolStudent: { childId, status: "active" },
      status: { in: ["booked", "confirmed", "attended"] },
    },
    include: { school: { select: { name: true } } },
  });
  if (!booking) notFound();

  const now = new Date();
  const active = isShortLearningBookingActive({
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    status: booking.status,
    now,
    earlyEntryMinutes: 10,
  });

  if (active && !booking.joinedAt) {
    await prisma.studentLearningBooking.update({
      where: { id: booking.id },
      data: { joinedAt: now, status: booking.status === "booked" ? "attended" : booking.status },
    });
  }

  const learnHref = `/student/short-learning/${encodeURIComponent(booking.id)}/learn`;

  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Link href="/student/short-learning" className="text-sm font-semibold text-primary hover:underline">
          ← Short Learning
        </Link>

        <div className="mt-6 rounded-2xl border border-violet-200 bg-violet-50/80 p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-700">Session type</p>
          <h1 className="mt-1 text-2xl font-bold text-foreground">Short Learning · AI-led</h1>
          <p className="mt-2 text-sm text-foreground/70">
            This is not a Day School classroom period. Day School is your school timetable with live classroom
            support. Short Learning is an after-hours, AI-led session your parent booked.
          </p>
          <p className="mt-3 text-sm font-medium text-violet-950">{SHORT_LEARNING_PROMISE}</p>
        </div>

        <section className="mt-8 rounded-2xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold capitalize text-foreground">{booking.subject}</h2>
          <p className="mt-1 text-sm text-foreground/60">
            {booking.school.name} · {new Date(booking.startsAt).toLocaleString()} · {booking.durationMinutes} minutes
          </p>
          {booking.learningFocus ? (
            <p className="mt-3 text-sm text-foreground/80">Focus: {booking.learningFocus}</p>
          ) : null}

          {!active ? (
            <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              {now < booking.startsAt ? (
                <p>
                  You can enter from 10 minutes before the start (
                  {new Date(booking.startsAt.getTime() - 10 * 60_000).toLocaleString()}).
                </p>
              ) : (
                <p>This Short Learning window has ended.</p>
              )}
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              <div className="space-y-3 rounded-xl bg-muted/40 p-4 text-sm text-foreground/80">
                <p>
                  Your AI coach leads this session. A human tutor may join only if they are on a published support
                  shift and available — they are a safety net, not a private booking.
                </p>
                <p>
                  If no tutor is eligible, AI tutoring continues. You will not be left on an indefinite waiting screen.
                </p>
              </div>
              <Link
                href={learnHref}
                className="inline-flex rounded-xl bg-violet-700 px-5 py-3 text-sm font-bold text-white hover:bg-violet-600"
              >
                Continue with AI Tutor
              </Link>
            </div>
          )}

          <p className="mt-6 text-sm text-foreground/60">
            Prefer Day School? Return to your{" "}
            <Link href="/student/dashboard" className="font-semibold text-primary underline">
              student dashboard
            </Link>{" "}
            for timetable periods.
          </p>
        </section>
      </div>
    </main>
  );
}
