export default function ContentLibraryLoading() {
  return (
    <main className="space-y-6 pb-24">
      <div className="h-14 w-64 animate-pulse rounded-2xl bg-slate-800" />
      <div className="h-24 animate-pulse rounded-2xl bg-slate-900/60" />
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="grid gap-3 xl:grid-cols-2">
          {[0, 1, 2, 3].map((idx) => (
            <div key={idx} className="h-40 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/60" />
          ))}
        </div>
        <div className="h-40 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/60" />
      </div>
      <div className="h-64 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/60" />
    </main>
  );
}
