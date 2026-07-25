import Link from "next/link";
import { redirect } from "next/navigation";
import ShortLearningOverviewMetrics from "@/components/school-admin/ShortLearningOverviewMetrics";
import { readSessionFromCookie } from "@/lib/auth";
import { getSchoolTeacherContext } from "@/lib/schools/rbac";
import { SHORT_LEARNING_PROMISE } from "@/lib/schools/short-learning-bookings";

export default async function SchoolAdminHomePage() {
  const session = await readSessionFromCookie();
  if (!session) redirect("/auth/login?next=/school-admin");

  const ctx = await getSchoolTeacherContext(session.userId);
  if (!ctx) redirect("/teacher");

  return (
    <div className="mx-auto max-w-5xl p-6 lg:p-10">
      <h1 className="text-3xl font-bold text-foreground">{ctx.schoolName}</h1>
      <p className="mt-1 text-sm text-foreground/60">School admin overview</p>

      <section className="mt-8 rounded-2xl border border-sky-200 bg-sky-50/40 p-6">
        <h2 className="text-lg font-semibold text-foreground">Day School</h2>
        <p className="mt-2 max-w-2xl text-sm text-foreground/70">
          Your school timetable, classrooms, and live teaching run through Day School. Use{" "}
          <Link href="/api/portal/mode?mode=teaching" className="font-semibold text-primary underline">
            Switch to Teaching
          </Link>{" "}
          in the sidebar for classroom tools, attendance, and period content — not Short Learning bookings.
        </p>
      </section>

      <section className="mt-6 rounded-2xl border border-violet-200 bg-violet-50/30 p-6">
        <h2 className="text-lg font-semibold text-foreground">Short Learning</h2>
        <p className="mt-2 max-w-2xl text-sm text-foreground/70">
          Parent-booked, after-hours, AI-led sessions — separate from Day School attendance and timetables.
        </p>
        <p className="mt-2 max-w-2xl text-sm text-foreground/70">{SHORT_LEARNING_PROMISE}</p>

        <ShortLearningOverviewMetrics />

        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/school-admin/short-learning"
            className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Short Learning overview
          </Link>
          <Link
            href="/school-admin/short-learning/bookings"
            className="rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted/40"
          >
            Bookings
          </Link>
          <Link
            href="/school-admin/short-learning/forecast"
            className="rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted/40"
          >
            Demand forecast
          </Link>
          <Link
            href="/school-admin/short-learning/shifts"
            className="rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted/40"
          >
            Tutor shifts
          </Link>
          <Link
            href="/school-admin/short-learning/coverage"
            className="rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted/40"
          >
            Coverage
          </Link>
          <Link
            href="/school-admin/short-learning/policies"
            className="rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted/40"
          >
            Policies
          </Link>
          <Link
            href="/school-admin/short-learning/reliability"
            className="rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted/40"
          >
            Reliability
          </Link>
        </div>
      </section>
    </div>
  );
}
