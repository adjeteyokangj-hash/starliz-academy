export default function AdminAssignmentsLoading() {
  return (
    <main className="space-y-6">
      <div className="h-14 w-64 animate-pulse rounded-2xl bg-slate-800" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((idx) => (
          <div key={idx} className="h-12 animate-pulse rounded-xl bg-slate-800" />
        ))}
      </div>
      <div className="grid gap-4">
        {[0, 1, 2].map((idx) => (
          <div key={idx} className="h-44 animate-pulse rounded-3xl border border-slate-800 bg-slate-900/60" />
        ))}
      </div>
    </main>
  );
}
