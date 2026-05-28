import Link from "next/link"

const policyCards = [
  {
    icon: "🔐",
    title: "Privacy Policy",
    href: "/privacy",
    desc: "How we collect, use and protect family and learning data.",
  },
  {
    icon: "📘",
    title: "Terms of Use",
    href: "/terms",
    desc: "The main rules for using StarLiz Academy and managing an account.",
  },
  {
    icon: "🛡️",
    title: "Child safety and safeguarding",
    href: "/privacy",
    desc: "A short summary of parent-led access, supervision and child-safe usage.",
  },
  {
    icon: "🗂️",
    title: "Learning records and data use",
    href: "/privacy",
    desc: "A summary of the learning records we keep to support progress and reporting.",
  },
]

export default function Policies() {
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
        <h1 className="text-4xl font-black mb-4">Policies</h1>
        <p className="text-slate-400 mb-12">Quick links for parents and carers.</p>

        <div className="grid gap-6 sm:grid-cols-2">
          {policyCards.map((policy) => (
            <Link key={policy.title} href={policy.href} className="rounded-2xl border border-slate-800 bg-slate-900 p-7 transition hover:border-blue-500/60 hover:bg-slate-900/80">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">{policy.icon}</span>
                <h2 className="text-xl font-bold">{policy.title}</h2>
              </div>
              <p className="text-slate-400 leading-7">{policy.desc}</p>
            </Link>
          ))}
        </div>
      </div>

      <footer className="border-t border-slate-800/80 px-6 py-8 text-center text-sm text-slate-500">
        <p>&#169; 2026 StarLiz Academy. All rights reserved.</p>
      </footer>
    </main>
  )
}
