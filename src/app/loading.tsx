export default function AppLoading() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-12 text-slate-100">
      <section className="mx-auto flex max-w-3xl flex-col items-center justify-center rounded-3xl border border-cyan-400/30 bg-slate-900/70 px-8 py-16 text-center shadow-2xl">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-cyan-300/30 border-t-cyan-300" aria-hidden="true" />
        <p className="mt-6 text-sm font-bold uppercase tracking-[0.2em] text-cyan-300">Loading page</p>
        <p className="mt-2 text-base text-slate-300">Please wait while we prepare your next screen.</p>
      </section>
    </main>
  );
}
