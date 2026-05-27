import Link from "next/link"

const featureList = [
  {
    icon: "🧭",
    title: "Quick Level Finder",
    desc: "Start at the right level with a quick check of subject confidence, starting point and learning needs.",
  },
  {
    icon: "📘",
    title: "Adaptive Lessons",
    desc: "Lessons and practice are matched to your child’s level, progress and learning needs.",
  },
  {
    icon: "🧒",
    title: "Daily Learning Journey",
    desc: "A personalised learning journey with guided practice across spelling, maths and reading each day.",
  },
  {
    icon: "🗣️",
    title: "Smart Coach Support",
    desc: "Children receive smart learning support with hints and step-by-step guidance to keep confidence high.",
  },
  {
    icon: "🎯",
    title: "Smart Catch-Up",
    desc: "Targeted catch-up sessions focus on weak areas and help children recover momentum quickly.",
  },
  {
    icon: "🗺️",
    title: "Curriculum Mastery Map",
    desc: "Practice activities are organised around subject skills, learning levels, weak areas and progress evidence.",
  },
  {
    icon: "🎓",
    title: "Assessment & Exam Readiness",
    desc: "Assessment readiness support helps children prepare for classroom checks, tests and GCSE pathway expectations.",
  },
  {
    icon: "⭐",
    title: "Certificates & Achievements",
    desc: "Celebrate progress with certificates, milestones and visible achievement tracking for children and parents.",
  },
]

export default function Features() {
  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <header className="border-b border-slate-800/80 px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Link href="/" className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-xl font-black text-transparent tracking-tight">
            StarLiz Academy
          </Link>
          <Link href="/signup" className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold hover:bg-blue-500">
            Start your child&apos;s learning journey
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="text-center mb-14">
          <h1 className="text-4xl font-black mb-4">Features</h1>
          <p className="mx-auto max-w-3xl text-lg text-slate-400">
            StarLiz Academy helps children learn with adaptive lessons, smart catch-up, guided practice,
            parent visibility and curriculum-aware progress tracking from primary learning through KS3 and GCSE readiness.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {featureList.map((f) => (
            <div key={f.title} className="rounded-2xl border border-slate-800 bg-slate-900 p-7">
              <span className="text-4xl">{f.icon}</span>
              <h2 className="mt-4 text-xl font-semibold mb-2">{f.title}</h2>
              <p className="text-slate-400 leading-7">{f.desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 text-center">
          <Link href="/pricing" className="inline-flex rounded-xl bg-blue-600 px-8 py-4 font-bold shadow-lg shadow-blue-600/20 hover:bg-blue-500">
            View pricing and platform options
          </Link>
        </div>
      </div>

      <footer className="border-t border-slate-800/80 px-6 py-8 text-center text-sm text-slate-500">
        <p>&#169; 2026 StarLiz Academy. All rights reserved.</p>
        <p className="mt-2 text-xs">Best viewed on the latest version of Google Chrome.</p>
      </footer>
    </main>
  )
}
