import Link from "next/link";

export default function UpgradePage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-white">
      <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col justify-center">
        <div className="rounded-[28px] border border-white/10 bg-white/[0.06] p-8 shadow-2xl">
          <p className="text-sm font-bold uppercase tracking-[0.28em] text-violet-300">Subscription</p>
          <h1 className="mt-4 text-4xl font-black">Your subscription needs attention.</h1>
          <p className="mt-4 text-lg text-slate-300">
            Update your plan to continue spelling, maths and reading activities.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link className="rounded-2xl bg-violet-500 px-5 py-3 font-bold text-white shadow-lg shadow-violet-500/20" href="/parent?billing=1">
              Upgrade / Renew
            </Link>
            <Link className="rounded-2xl border border-white/15 px-5 py-3 font-bold text-slate-200" href="/dashboard">
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
