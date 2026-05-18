export default function ParentProfilesLoading() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#161a4b_0%,_#090d2a_38%,_#030513_100%)] px-4 py-8 text-white sm:px-6">
      <section className="mx-auto max-w-6xl rounded-[2rem] border border-white/10 bg-slate-950/45 p-5 md:p-8">
        <div className="h-12 w-40 animate-pulse rounded-2xl bg-white/10" />
        <div className="mt-7 h-7 w-2/3 animate-pulse rounded-xl bg-white/10" />
        <div className="mt-3 h-5 w-1/2 animate-pulse rounded-xl bg-white/10" />
        <div className="mt-8 grid gap-3 md:grid-cols-3">
          {[0, 1, 2].map((idx) => (
            <div key={idx} className="h-24 animate-pulse rounded-2xl border border-white/10 bg-white/5" />
          ))}
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {[0, 1, 2].map((idx) => (
            <div key={idx} className="h-44 animate-pulse rounded-[1.6rem] border border-white/10 bg-white/5" />
          ))}
        </div>
      </section>
    </main>
  );
}
