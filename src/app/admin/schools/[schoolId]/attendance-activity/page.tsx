import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";

type PageProps = {
  params: Promise<{ schoolId: string }>;
};

export default async function SchoolAttendanceActivityPage({ params }: PageProps) {
  const { schoolId } = await params;

  return (
    <SchoolDashboardShell
      schoolId={schoolId}
      activeTab="attendance-activity"
      title="Attendance / Activity"
      subtitle="Attendance trends, engagement signals, and recent school activity timeline."
    >
      <div className="grid gap-3 lg:grid-cols-2">
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Attendance Signals</h2>
          <p className="mt-1 text-xs text-slate-400">Spot attendance drift, persistent absence patterns, and class-level concern thresholds.</p>
        </article>
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Activity Timeline</h2>
          <p className="mt-1 text-xs text-slate-400">Review notable school actions, assignment events, and operational updates.</p>
        </article>
      </div>
    </SchoolDashboardShell>
  );
}
