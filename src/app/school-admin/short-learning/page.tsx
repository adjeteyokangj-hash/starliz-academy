import Link from "next/link";

import ShortLearningOverviewMetrics from "@/components/school-admin/ShortLearningOverviewMetrics";
import { SHORT_LEARNING_CHECKBOX, SHORT_LEARNING_PROMISE } from "@/lib/schools/short-learning-bookings";

import ShortLearningSubNav from "@/components/school-admin/ShortLearningSubNav";

const SECTIONS = [
  {
    href: "/school-admin/short-learning/bookings",
    title: "Bookings",
    description: "Review parent-booked AI-led Short Learning sessions for your school.",
  },
  {
    href: "/school-admin/short-learning/forecast",
    title: "Demand forecast",
    description: "Project booking demand by slot across rolling 7d, 48h, deadline, and late-capacity views.",
  },
  {
    href: "/school-admin/short-learning/shifts",
    title: "Tutor support shifts",
    description: "Publish when tutors may become available for human safety-net support.",
  },
  {
    href: "/school-admin/short-learning/coverage",
    title: "Coverage gaps",
    description: "Compare estimated tutor demand against published shifts and get advisory minute recommendations.",
  },
  {
    href: "/school-admin/short-learning/policies",
    title: "Policies & settings",
    description: "Learning windows, coverage assumptions, and parent reliability thresholds.",
  },
  {
    href: "/school-admin/short-learning/reliability",
    title: "Reliability",
    description: "No-show counts and restricted-parent summaries for admin review.",
  },
] as const;

export default function SchoolAdminShortLearningPage() {
  return (
    <div className="mx-auto max-w-5xl p-6 lg:p-10">
      <h1 className="text-3xl font-bold text-foreground">Short Learning</h1>
      <p className="mt-2 max-w-2xl text-sm text-foreground/70">{SHORT_LEARNING_PROMISE}</p>
      <p className="mt-3 max-w-2xl text-xs text-foreground/50">Parent honesty checkbox: {SHORT_LEARNING_CHECKBOX}</p>

      <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50/40 p-4">
        <p className="text-sm font-semibold text-foreground">Day School vs Short Learning</p>
        <p className="mt-1 text-sm text-foreground/70">
          <strong className="font-semibold text-foreground">Day School</strong> is your fixed school-day timetable with
          classroom periods and attendance.{" "}
          <strong className="font-semibold text-foreground">Short Learning</strong> is parent-booked, after-hours, and
          AI-led — tutor shifts here are a human safety net, not private 1:1 bookings.
        </p>
      </div>

      <ShortLearningSubNav />

      <ShortLearningOverviewMetrics />

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="rounded-2xl border border-border bg-card p-5 transition hover:border-primary/40 hover:shadow-sm"
          >
            <h2 className="text-lg font-semibold text-foreground">{section.title}</h2>
            <p className="mt-2 text-sm text-foreground/60">{section.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
