import Link from "next/link"

const featureList = [
  {
    icon: "🧭",
    title: "Reception to GCSE Pathways",
    desc: "Supports England pathway stages across Reception-Year 6, KS3 (Years 7-9), and GCSE pathway aligned support.",
  },
  {
    icon: "🏷️",
    title: "Exam-board Aware GCSE Support",
    desc: "GCSE stages include exam-board-aware tagging that supports AQA, Edexcel and OCR.",
  },
  {
    icon: "👶",
    title: "Age-aware Learning Experience",
    desc: "Younger learners get playful guidance, while older learners get clearer structured revision workflows.",
  },
  {
    icon: "📊",
    title: "Parent Dashboard",
    desc: "Track progress reports, assigned lessons, weak-topic support and GCSE readiness insights.",
  },
  {
    icon: "🧑‍🏫",
    title: "Tutor and School Friendly",
    desc: "Supports parents, tutors and organisations coordinating structured interventions and progress checks.",
  },
  {
    icon: "🛡️",
    title: "Safe, Practical Delivery",
    desc: "No overclaiming: clear pathway guidance, structured assignments and transparent progress tracking.",
  },
  {
    icon: "📘",
    title: "Curriculum-aware Coverage",
    desc: "National Curriculum aligned progression and staged support for key transitions through school years.",
  },
  {
    icon: "🎯",
    title: "Targeted Intervention Support",
    desc: "Weak-topic signals and assigned-content workflows make it easier to focus support where it matters.",
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
          <p className="text-lg text-slate-400">Explore Reception to GCSE support built for families, tutors and schools.</p>
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
            View GCSE pathway
          </Link>
        </div>
      </div>

      <footer className="border-t border-slate-800/80 px-6 py-8 text-center text-sm text-slate-500">
        <p>&#169; 2026 StarLiz Academy. All rights reserved.</p>
      </footer>
    </main>
  )
}
