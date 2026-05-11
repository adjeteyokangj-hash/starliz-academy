import Link from "next/link"

export default function About() {
  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <header className="border-b border-slate-800/80 px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Link href="/" className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-xl font-black text-transparent tracking-tight">
            StarLiz Academy
          </Link>
          <Link href="/signup" className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold hover:bg-blue-500">
            Start Free Trial
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-20">
        <h1 className="text-4xl font-black mb-6">About StarLiz Academy</h1>

        <p className="mb-6 text-lg text-slate-300">
          StarLiz Academy is an AI-powered learning platform designed to help
          primary school children build confidence in spelling, maths and reading.
        </p>

        <p className="mb-6 text-slate-400 leading-8">
          We believe learning should be engaging, personalised and effective.
          Every child learns differently, which is why StarLiz adapts to each
          child&apos;s ability, helping them improve where they need it most.
        </p>

        <p className="mb-10 text-slate-400 leading-8">
          Our mission is simple: make learning enjoyable while delivering real
          progress that parents can see and trust.
        </p>

        <div className="grid gap-6 sm:grid-cols-3 mb-12">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center">
            <p className="text-3xl mb-2">🎯</p>
            <p className="font-bold">Personalised</p>
            <p className="mt-2 text-sm text-slate-400">Adapts to each child</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center">
            <p className="text-3xl mb-2">🛡️</p>
            <p className="font-bold">Safe</p>
            <p className="mt-2 text-sm text-slate-400">Designed for children</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center">
            <p className="text-3xl mb-2">📊</p>
            <p className="font-bold">Trackable</p>
            <p className="mt-2 text-sm text-slate-400">Real parent insights</p>
          </div>
        </div>

        <Link href="/signup" className="inline-flex rounded-xl bg-blue-600 px-7 py-4 font-bold shadow-lg shadow-blue-600/20 hover:bg-blue-500">
          Get Started Free
        </Link>
      </div>

      <footer className="border-t border-slate-800/80 px-6 py-8 text-center text-sm text-slate-500">
        <p>&#169; 2026 StarLiz Academy. All rights reserved.</p>
      </footer>
    </main>
  )
}
