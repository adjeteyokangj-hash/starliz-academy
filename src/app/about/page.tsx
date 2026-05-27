import Link from "next/link"
import PublicShell from "@/components/layout/PublicShell"

export default function About() {
  return (
    <PublicShell>
      <div className="mx-auto max-w-4xl px-6 py-20">
        <h1 className="text-4xl font-black mb-6">About StarLiz Academy</h1>

        <p className="mb-6 text-lg text-slate-300">
          StarLiz Academy is an AI-supported learning platform for Reception-Year 6,
          KS3 (Years 7-9), and GCSE pathway aligned support (Years 10-11).
        </p>

        <p className="mb-6 text-slate-400 leading-8">
          We believe learning should be engaging, age-aware and practical.
          StarLiz helps families assign lessons, track weak-topic support and review
          progress with tools built for parents, tutors and schools.
        </p>

        <p className="mb-10 text-slate-400 leading-8">
          Our mission is to support consistent, visible progress across the learner journey.
          For GCSE stages, StarLiz is pathway aligned with exam-board aligned revision guidance
          and clear progress support for families.
        </p>

        <div className="grid gap-6 sm:grid-cols-3 mb-12">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center">
            <p className="text-3xl mb-2">🎯</p>
            <p className="font-bold">Pathway Aligned</p>
            <p className="mt-2 text-sm text-slate-400">Reception to GCSE progression</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center">
            <p className="text-3xl mb-2">🛡️</p>
            <p className="font-bold">Exam-board Aligned</p>
            <p className="mt-2 text-sm text-slate-400">Aligned GCSE revision guidance</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center">
            <p className="text-3xl mb-2">📊</p>
            <p className="font-bold">Parent Visibility</p>
            <p className="mt-2 text-sm text-slate-400">Reports, assigned lessons, readiness insights</p>
          </div>
        </div>

        <Link href="/signup" className="inline-flex rounded-xl bg-blue-600 px-7 py-4 font-bold shadow-lg shadow-blue-600/20 hover:bg-blue-500">
          Explore Reception to GCSE support
        </Link>
      </div>

    </PublicShell>
  )
}
