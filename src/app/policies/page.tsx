import Link from "next/link"

const policies = [
  {
    icon: "🛡️",
    title: "Child Safety Policy",
    desc: "StarLiz Academy is designed as a safe learning environment. All features are built with child safety as the first priority. No user-generated content, no chat, no contact with strangers.",
  },
  {
    icon: "📋",
    title: "Content Review Policy",
    desc: "All educational content is reviewed before being published. We use age-appropriate language and activities suitable for children aged 5 to 10.",
  },
  {
    icon: "🔒",
    title: "Data Protection Summary",
    desc: "We collect only the minimum data needed. Parent email, child first name, age range and progress data. No sensitive personal data is collected from children. See our Privacy Policy for full details.",
  },
  {
    icon: "🤝",
    title: "Safeguarding Approach",
    desc: "We follow a parent-first approach. Parents control all account settings, child profiles and data. Children cannot make purchases or change account settings.",
  },
  {
    icon: "🤖",
    title: "AI Usage Policy",
    desc: "AI is used to personalise learning and generate age-appropriate content. All AI-generated content is filtered, reviewed and controlled. We do not use AI to collect or analyse children&apos;s personal data beyond what is needed for learning.",
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
        <p className="text-slate-400 mb-12">Our commitment to keeping children safe and parents informed.</p>

        <div className="space-y-6">
          {policies.map((policy) => (
            <div key={policy.title} className="rounded-2xl border border-slate-800 bg-slate-900 p-7">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">{policy.icon}</span>
                <h2 className="text-xl font-bold">{policy.title}</h2>
              </div>
              <p className="text-slate-400 leading-7">{policy.desc}</p>
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
