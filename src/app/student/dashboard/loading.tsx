export default function StudentDashboardLoading() {
  return (
    <main className="min-h-screen bg-[#f6f8ff] px-6 py-8">
      <section className="mx-auto max-w-6xl space-y-6">
        <div className="h-16 animate-pulse rounded-2xl bg-slate-200/80" />
        <div className="grid gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((idx) => (
            <div key={idx} className="h-20 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
        <div className="h-56 animate-pulse rounded-3xl bg-slate-100" />
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((idx) => (
            <div key={idx} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      </section>
    </main>
  );
}
