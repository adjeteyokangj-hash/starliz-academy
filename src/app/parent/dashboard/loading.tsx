export default function ParentDashboardLoading() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8">
      <section className="mx-auto max-w-7xl space-y-6">
        <div className="h-12 w-64 animate-pulse rounded-2xl bg-white/10" />
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1, 2, 3].map((idx) => (
            <div key={idx} className="h-40 animate-pulse rounded-3xl border border-white/10 bg-white/5" />
          ))}
        </div>
      </section>
    </main>
  );
}
