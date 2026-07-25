import Link from "next/link";

import { redirect } from "next/navigation";

import Navbar from "@/components/layout/Navbar";

import { readChildSelectionFromCookie, readSessionFromCookie } from "@/lib/auth";

import { prisma } from "@/lib/db";

import { SHORT_LEARNING_PROMISE } from "@/lib/schools/short-learning-bookings";

import { resolveParentActiveChildId } from "@/lib/activeChild";

import { resolveParentScope } from "@/lib/parent_scope";



export default async function StudentShortLearningListPage() {

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



  const memberships = await prisma.schoolStudent.findMany({

    where: { childId, status: "active" },

    select: { id: true },

  });

  const schoolStudentIds = memberships.map((m) => m.id);

  const now = new Date();

  const bookings = schoolStudentIds.length

    ? await prisma.studentLearningBooking.findMany({

        where: {

          schoolStudentId: { in: schoolStudentIds },

          status: { in: ["booked", "confirmed", "attended"] },

          endsAt: { gte: now },

        },

        include: { school: { select: { name: true } } },

        orderBy: { startsAt: "asc" },

        take: 50,

      })

    : [];



  return (

    <main className="min-h-screen bg-background">

      <Navbar />

      <div className="mx-auto max-w-3xl px-6 py-10">

        <Link href="/student/dashboard" className="text-sm font-semibold text-primary hover:underline">

          ← Dashboard

        </Link>



        <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50/80 p-4">

          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-700">Short Learning · AI-led</p>

          <h1 className="mt-1 text-3xl font-bold text-foreground">After-hours sessions</h1>

          <p className="mt-2 text-sm text-foreground/70">

            Parent-booked learning outside your Day School timetable. This is not classroom attendance — AI coaching

            leads every session.

          </p>

          <p className="mt-2 text-sm text-foreground/70">{SHORT_LEARNING_PROMISE}</p>

        </div>



        {bookings.length === 0 ? (

          <div className="mt-8 rounded-2xl border border-dashed border-border bg-muted/20 p-6">

            <p className="text-sm font-semibold text-foreground">No upcoming Short Learning sessions</p>

            <p className="mt-1 text-sm text-foreground/60">

              Ask your parent to book a session from their portal. Day School lessons remain on your{" "}

              <Link href="/student/today" className="font-semibold text-primary underline">

                school day timetable

              </Link>

              .

            </p>

          </div>

        ) : (

          <ul className="mt-8 space-y-3">

            {bookings.map((booking) => {

              const joinable = booking.startsAt <= new Date(now.getTime() + 15 * 60_000);

              return (

                <li key={booking.id} className="rounded-2xl border border-border bg-card p-4">

                  <div className="flex flex-wrap items-center justify-between gap-3">

                    <div>

                      <p className="text-[10px] font-bold uppercase tracking-wide text-violet-700">Short Learning</p>

                      <p className="font-semibold capitalize text-foreground">{booking.subject}</p>

                      <p className="text-sm text-foreground/60">

                        {booking.school.name} · {new Date(booking.startsAt).toLocaleString()} · {booking.durationMinutes} min

                      </p>

                    </div>

                    {joinable ? (

                      <Link

                        href={`/student/short-learning/${booking.id}`}

                        className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-600"

                      >

                        Join session

                      </Link>

                    ) : (

                      <span className="text-xs font-semibold text-foreground/50">Opens near start time</span>

                    )}

                  </div>

                </li>

              );

            })}

          </ul>

        )}

      </div>

    </main>

  );

}


