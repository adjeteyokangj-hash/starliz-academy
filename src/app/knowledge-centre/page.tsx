import PublicShell from "@/components/layout/PublicShell"
import KnowledgeCentreClient from "@/components/public/KnowledgeCentreClient"

export default function KnowledgeCentrePage() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-4xl px-6 py-16">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-300">Help centre</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight md:text-5xl">Knowledge Centre</h1>
        <p className="mt-4 text-lg text-slate-300">
          Guides for parents, students, school administrators, and teachers — covering Day School, Short
          Learning, booking rules, and how AI-led sessions work.
        </p>

        <KnowledgeCentreClient />
      </section>
    </PublicShell>
  )
}
