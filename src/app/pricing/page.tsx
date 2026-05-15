import Link from "next/link"
import PublicPricingSection from "@/components/pricing/PublicPricingSection"

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <section className="relative overflow-hidden px-6 pb-14 pt-24 text-center">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-25%,rgba(59,130,246,0.18),transparent)]" />
        <div className="relative mx-auto max-w-4xl">
          <p className="inline-flex rounded-full border border-blue-500/35 bg-blue-500/10 px-4 py-1.5 text-sm font-semibold text-blue-300">
            Reception to GCSE Support Plans
          </p>
          <h1 className="mt-6 text-5xl font-black leading-tight tracking-tight md:text-6xl">
            Choose a plan for every learning stage
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-300">
            Flexible options for families, tutors and schools supporting Reception-Year 6, KS3 and GCSE pathway aligned learning.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link href="/signup" className="rounded-xl bg-blue-600 px-7 py-3 font-bold transition hover:bg-blue-500">
              Start your child&apos;s learning journey
            </Link>
            <Link href="/features" className="rounded-xl border border-slate-700 px-7 py-3 font-bold text-slate-200 transition hover:bg-slate-900">
              Explore Reception to GCSE support
            </Link>
          </div>
        </div>
      </section>

      <PublicPricingSection />
    </main>
  )
}
