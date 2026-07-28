"use client";

import Link from "next/link";
import { useSchoolDashboardRecord } from "@/components/admin/schools/school-dashboard-data";

type Props = {
  schoolId: string;
  surface?: "attendance" | "ai";
};

export default function SchoolSampleDataBanner({ schoolId, surface = "attendance" }: Props) {
  const { school, loading } = useSchoolDashboardRecord(schoolId);
  if (loading || !school) return null;

  const enrolled = school.students.filter((row) => row.status === "active").length;

  if (enrolled > 0) {
    return (
      <section className="rounded-xl border border-slate-600/50 bg-slate-900/60 p-4 text-xs text-slate-200">
        <p className="font-semibold text-white">Live intelligence not wired</p>
        <p className="mt-1 text-slate-400">
          {surface === "ai"
            ? "AI narratives are unavailable for schools with enrolments until live intelligence is connected."
            : "Attendance risk lists are unavailable for schools with enrolments. Sample figures are not shown as live data."}
          {" "}
          Use the{" "}
          <Link href={`/admin/schools/${schoolId}/attendance`} className="font-semibold text-slate-100 underline hover:text-white">
            attendance register
          </Link>
          {" "}for operational truth.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-50">
      <p className="font-semibold">Sample intelligence — enrol students to use live data</p>
      <p className="mt-1 text-amber-100/90">
        {surface === "ai"
          ? "AI narratives below are illustrative while this school has zero enrolled students."
          : "Attendance risk lists below are demo samples while this school has zero enrolled students."}
        {" "}
        <Link href={`/admin/schools/${schoolId}/students/new`} className="font-semibold underline hover:text-white">
          Enrol a student
        </Link>
        {" "}or complete{" "}
        <Link href={`/admin/schools/${schoolId}/dashboard`} className="font-semibold underline hover:text-white">
          school setup
        </Link>
        .
      </p>
    </section>
  );
}
