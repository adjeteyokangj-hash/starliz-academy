import Link from "next/link"

const items = [
  { icon: "🎤", title: "AI voice tutor feedback", desc: "Real-time spoken feedback to guide children through activities." },
  { icon: "📧", title: "Weekly parent progress emails", desc: "Automated weekly reports straight to your inbox." },
  { icon: "🧩", title: "Mini-games for weak areas", desc: "Targeted mini-games that focus on where each child needs the most help." },
  { icon: "📱", title: "Mobile app improvements", desc: "A faster, smoother experience on mobile and tablet." },
  { icon: "🏫", title: "School and teacher accounts", desc: "Class-level progress tracking and teacher dashboards." },
  { icon: "🌍", title: "More subjects", desc: "Science, writing and creative challenges are on the roadmap." },
]

export default function Roadmap() {
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
        <h1 className="text-4xl font-black mb-4">Roadmap</h1>
        <p className="text-slate-400 mb-12">What we&apos;re building next for StarLiz Academy.</p>

        <div className="space-y-6">
          {items.map((item) => (
            <div key={item.title} className="flex gap-5 rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <span className="text-3xl">{item.icon}</span>
              <div>
                <p className="font-bold text-lg">{item.title}</p>
                <p className="mt-1 text-slate-400">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <footer className="border-t border-slate-800/80 px-6 py-8 text-center text-sm text-slate-500">
        <p>&#169; 2026 StarLiz Academy. All rights reserved.</p>
      </footer>
    </main>
  )
}
