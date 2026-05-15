import Link from "next/link"
import Logo from "@/components/Logo"
import PublicPricingSection from "@/components/pricing/PublicPricingSection"
import { getPublicPricingPlans } from "@/lib/pricing/service"

export const dynamic = "force-dynamic"

const features = [
  {
    icon: "🧠",
    title: "Reception to GCSE Pathways",
    desc: "Supports England pathway stages: Reception-Year 6, KS3 (Years 7-9), and GCSE pathway (Years 10-11).",
  },
  {
    icon: "📘",
    title: "Exam-board Aware GCSE Support",
    desc: "GCSE pathway aligned with exam-board-aware tagging that supports AQA, Edexcel and OCR.",
  },
  {
    icon: "📊",
    title: "Parent Progress Dashboard",
    desc: "Track assigned lessons, weak-topic support, progress reports and GCSE readiness signals.",
  },
  {
    icon: "🧭",
    title: "Age-aware Experience",
    desc: "Playful dashboards for younger learners, structured primary tasks, and mature secondary revision views.",
  },
  {
    icon: "👨‍👩‍👧",
    title: "Built For Families, Tutors and Schools",
    desc: "Designed for parents across Reception to GCSE, tutors, and schools or organisations.",
  },
  {
    icon: "🛡️",
    title: "Safe, Structured Delivery",
    desc: "Pathway guidance, assigned content and reporting tools help families support progress without overclaiming outcomes.",
  },
]

const subjects = [
  {
    title: "Reception-Year 6",
    text: "National Curriculum aligned foundations with guided, age-appropriate practice.",
    icon: "🧒",
    color: "from-blue-600/20 to-blue-600/5",
    border: "border-blue-700/40",
  },
  {
    title: "KS3 (Years 7-9)",
    text: "KS3 pathway aligned learning with clearer progression and targeted support.",
    icon: "🎯",
    color: "from-purple-600/20 to-purple-600/5",
    border: "border-purple-700/40",
  },
  {
    title: "GCSE (Years 10-11)",
    text: "GCSE pathway aligned revision support with exam-board-aware tagging.",
    icon: "🎓",
    color: "from-emerald-600/20 to-emerald-600/5",
    border: "border-emerald-700/40",
  },
]

const steps = [
  {
    step: "1",
    title: "Set pathway and learner profile",
    desc: "Choose Reception-Year 6, KS3, or GCSE pathway aligned setup.",
    icon: "👤",
  },
  {
    step: "2",
    title: "Assign and track learning",
    desc: "Run assigned lessons and monitor weak-topic support from parent tools.",
    icon: "📝",
  },
  {
    step: "3",
    title: "Review progress and readiness",
    desc: "Use reports and GCSE readiness insights to guide next steps.",
    icon: "📊",
  },
]

const roadmapItems = [
  "🎓 Deeper GCSE pathway tooling",
  "🏷️ Expanded exam-board tagging and reporting",
  "📧 Parent insights and scheduling improvements",
  "🏫 School and tutor management enhancements",
  "📱 Improved mobile parent experience",
  "📊 Readiness and intervention analytics",
]

export default async function PublicHomePage() {
  const plans = await getPublicPricingPlans()

  return (
    <main className="min-h-screen bg-[#020617] text-white">
      {/* Navigation */}
      <header className="sticky top-0 z-50 border-b border-slate-800/80 bg-[#020617]/90 px-4 sm:px-6 py-3 sm:py-4 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Logo variant="wordmark" size={24} className="sm:size-32" />

          <nav className="hidden items-center gap-5 sm:gap-7 text-xs sm:text-sm text-slate-400 md:flex">
            <Link href="#features" className="transition hover:text-white">Features</Link>
            <Link href="#subjects" className="transition hover:text-white">Subjects</Link>
            <Link href="#how-it-works" className="transition hover:text-white">How it works</Link>
            <Link href="#pricing" className="transition hover:text-white">Pricing</Link>
            <Link href="/roadmap" className="transition hover:text-white">Roadmap</Link>
            <Link href="/login" className="transition hover:text-white">Login</Link>
          </nav>

          <Link
            href="/signup"
            className="rounded-lg sm:rounded-xl bg-blue-600 px-3 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-bold transition hover:bg-blue-500 whitespace-nowrap"
          >
            Free Trial
          </Link>
        </div>

        <details className="mx-auto mt-3 max-w-7xl md:hidden">
          <summary className="inline-flex list-none cursor-pointer items-center rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-900/70">
            Menu
          </summary>
          <nav className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-300">
            <Link href="#features" className="rounded-lg border border-slate-700 px-3 py-2 text-center transition hover:text-white">Features</Link>
            <Link href="#subjects" className="rounded-lg border border-slate-700 px-3 py-2 text-center transition hover:text-white">Subjects</Link>
            <Link href="#how-it-works" className="rounded-lg border border-slate-700 px-3 py-2 text-center transition hover:text-white">How it works</Link>
            <Link href="#pricing" className="rounded-lg border border-slate-700 px-3 py-2 text-center transition hover:text-white">Pricing</Link>
            <Link href="/roadmap" className="rounded-lg border border-slate-700 px-3 py-2 text-center transition hover:text-white">Roadmap</Link>
            <Link href="/login" className="rounded-lg border border-slate-700 px-3 py-2 text-center transition hover:text-white">Login</Link>
          </nav>
        </details>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden px-4 sm:px-6 py-12 sm:py-24">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(59,130,246,0.15),transparent)]" />
        <div className="mx-auto grid max-w-7xl gap-8 sm:gap-14 lg:grid-cols-2 lg:items-center">
          <div>
            <Logo variant="full" size={32} className="mb-4 sm:mb-6 sm:size-48" />
            <p className="mb-4 sm:mb-5 inline-flex rounded-full border border-blue-500/30 bg-blue-500/10 px-3 sm:px-4 py-1 sm:py-1.5 text-xs sm:text-sm font-semibold text-blue-300">
              Reception to GCSE support for families, tutors and schools
            </p>

            <h1 className="text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-black leading-[1.2] tracking-tight">
              England pathway learning{" "}
              <span className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
                from Reception to GCSE.
              </span>
            </h1>

            <p className="mt-4 sm:mt-6 max-w-xl text-sm sm:text-base lg:text-lg leading-6 sm:leading-8 text-slate-300">
              StarLiz Academy supports National Curriculum aligned primary learning,
              KS3 pathway aligned progress, and GCSE pathway aligned revision with
              exam-board-aware tagging for AQA, Edexcel and OCR.
            </p>

            <div className="mt-6 sm:mt-9 flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4">
              <Link
                href="/signup"
                className="rounded-lg sm:rounded-xl bg-blue-600 px-5 sm:px-7 py-3 sm:py-4 text-sm sm:text-base font-bold shadow-lg shadow-blue-600/20 transition hover:bg-blue-500 text-center"
              >
                Start your child&apos;s learning journey
              </Link>
              <Link
                href="/pricing"
                className="rounded-lg sm:rounded-xl border border-slate-700 px-5 sm:px-7 py-3 sm:py-4 text-sm sm:text-base font-bold transition hover:bg-slate-900 text-center"
              >
                Choose a plan
              </Link>
            </div>

            <p className="mt-3 sm:mt-4 text-xs sm:text-sm text-slate-500">
              No credit card required &middot; Cancel anytime
            </p>
          </div>

          <div className="rounded-2xl sm:rounded-3xl border border-slate-800 bg-slate-900/60 p-4 sm:p-6 shadow-2xl backdrop-blur-sm">
            <div className="rounded-2xl bg-slate-950 p-5">
              <p className="text-sm font-semibold text-blue-300">Today&apos;s Pathway Snapshot</p>
              <div className="mt-5 space-y-4">
                <div className="flex items-center gap-4 rounded-2xl bg-slate-900 p-4">
                  <span className="text-3xl">🔤</span>
                  <div>
                    <p className="font-semibold">GCSE Pathway &mdash; Algebra focus</p>
                    <p className="text-sm text-slate-400">Exam-board aware tagging: AQA</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 rounded-2xl bg-slate-900 p-4">
                  <span className="text-3xl">⭐</span>
                  <div>
                    <p className="font-semibold">Weak-topic support active</p>
                    <p className="text-sm text-slate-400">Parent dashboard shows targeted intervention areas.</p>
                  </div>
                </div>
                <div className="rounded-2xl border border-emerald-700/40 bg-emerald-500/10 p-4">
                  <p className="font-bold text-emerald-300">Readiness signals updated &#8593;</p>
                  <p className="mt-1 text-sm text-slate-300">
                    Next assigned lesson follows the learner&apos;s pathway profile.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="border-y border-slate-800/60 bg-slate-900/30 px-4 sm:px-6 py-4 sm:py-6">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-3 sm:gap-6 text-xs sm:text-sm font-medium text-slate-400">
          <span className="w-full sm:w-auto text-center sm:text-left">&#10003; Safe for children</span>
          <span className="hidden sm:inline text-slate-700">|</span>
          <span className="w-full sm:w-auto text-center sm:text-left">&#10003; No ads or distractions</span>
          <span className="hidden sm:inline text-slate-700">|</span>
          <span className="w-full sm:w-auto text-center sm:text-left">&#10003; Reception to GCSE pathways</span>
          <span className="hidden sm:inline text-slate-700">|</span>
          <span className="w-full sm:w-auto text-center sm:text-left">&#10003; Exam-board aware (AQA, Edexcel, OCR)</span>
          <span className="hidden sm:inline text-slate-700">|</span>
          <span className="w-full sm:w-auto text-center sm:text-left">&#10003; Cancel anytime</span>
        </div>
      </section>

      {/* Learning Areas */}
      <section id="subjects" className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20">
        <div className="text-center">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black">Learning Pathways</h2>
          <p className="mt-2 sm:mt-4 text-sm sm:text-base text-slate-400">Age-aware progression from early years to GCSE pathway aligned support.</p>
        </div>

        <div className="mt-8 sm:mt-12 grid gap-4 sm:gap-6 md:grid-cols-3">
          {subjects.map((subject) => (
            <div
              key={subject.title}
              className={`rounded-2xl sm:rounded-3xl border ${subject.border} bg-gradient-to-b ${subject.color} p-6 sm:p-8`}
            >
              <p className="text-4xl sm:text-5xl">{subject.icon}</p>
              <h3 className="mt-4 sm:mt-5 text-lg sm:text-xl font-bold">{subject.title}</h3>
              <p className="mt-2 sm:mt-3 text-sm sm:text-base leading-6 sm:leading-7 text-slate-400">{subject.text}</p>
              <Link href={subject.title.includes("GCSE") ? "/pricing" : "/signup"} className="mt-4 sm:mt-6 inline-block text-xs sm:text-sm font-semibold text-blue-400 hover:text-blue-300">
                {subject.title.includes("GCSE") ? "View GCSE pathway \u2192" : "Explore pathway support \u2192"}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="bg-slate-900/40 px-4 sm:px-6 py-12 sm:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="text-center">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black">Why families, tutors and schools choose StarLiz</h2>
            <p className="mt-2 sm:mt-4 text-sm sm:text-base text-slate-400">Pathway aligned delivery with parent visibility and practical intervention support.</p>
          </div>

          <div className="mt-8 sm:mt-12 grid gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div key={feature.title} className="rounded-xl sm:rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-6">
                <span className="text-2xl sm:text-3xl">{feature.icon}</span>
                <h3 className="mt-3 sm:mt-4 text-base sm:text-lg font-bold">{feature.title}</h3>
                <p className="mt-2 text-xs sm:text-sm leading-6 sm:leading-7 text-slate-400">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20">
        <div className="text-center">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black">How it works</h2>
          <p className="mt-2 sm:mt-4 text-sm sm:text-base text-slate-400">Up and running in under 5 minutes.</p>
        </div>

        <div className="mt-10 sm:mt-14 grid gap-6 sm:gap-8 md:grid-cols-3">
          {steps.map((step) => (
            <div key={step.step} className="relative text-center">
              <div className="mx-auto mb-4 sm:mb-5 flex h-14 sm:h-16 w-14 sm:w-16 items-center justify-center rounded-lg sm:rounded-2xl bg-blue-600/20 text-2xl sm:text-3xl ring-1 ring-blue-600/40">
                {step.icon}
              </div>
              <div className="mb-2 text-xs font-bold uppercase tracking-widest text-blue-400">
                Step {step.step}
              </div>
              <h3 className="text-base sm:text-lg lg:text-xl font-bold">{step.title}</h3>
              <p className="mt-2 sm:mt-3 text-xs sm:text-sm text-slate-400">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Parent Dashboard Preview */}
      <section className="bg-gradient-to-b from-slate-900/60 to-transparent px-4 sm:px-6 py-12 sm:py-20">
        <div className="mx-auto max-w-5xl text-center">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black">Real parent value at every stage</h2>
          <p className="mx-auto mt-2 sm:mt-4 max-w-2xl text-xs sm:text-sm lg:text-base text-slate-400">
            Parent dashboard tools include progress reports, assigned lessons, weak-topic support and GCSE readiness insights.
          </p>

          <div className="mt-8 sm:mt-12 grid gap-3 sm:gap-4 rounded-2xl sm:rounded-3xl border border-slate-800 bg-slate-900 p-4 sm:p-6 sm:grid-cols-3">
            <div className="rounded-lg sm:rounded-2xl bg-slate-950 p-4 sm:p-5">
              <p className="text-2xl sm:text-3xl font-black text-blue-400">3 pathways</p>
              <p className="mt-1 sm:mt-2 text-xs sm:text-sm text-slate-400">Reception-Year 6, KS3, GCSE</p>
            </div>
            <div className="rounded-lg sm:rounded-2xl bg-slate-950 p-4 sm:p-5">
              <p className="text-2xl sm:text-3xl font-black text-emerald-400">AQA/OCR/Edexcel</p>
              <p className="mt-1 sm:mt-2 text-xs sm:text-sm text-slate-400">Exam-board aware GCSE tagging</p>
            </div>
            <div className="rounded-lg sm:rounded-2xl bg-slate-950 p-4 sm:p-5">
              <p className="text-2xl sm:text-3xl font-black text-purple-400">Readiness</p>
              <p className="mt-1 sm:mt-2 text-xs sm:text-sm text-slate-400">GCSE readiness insights for parents</p>
            </div>
          </div>

          <Link href="/signup" className="mt-6 sm:mt-8 inline-flex rounded-lg sm:rounded-xl bg-blue-600 px-5 sm:px-7 py-3 sm:py-4 text-sm sm:text-base font-bold shadow-lg shadow-blue-600/20 transition hover:bg-blue-500">
            Explore Reception to GCSE support
          </Link>
        </div>
      </section>

      {/* Audience */}
      <section className="mx-auto max-w-7xl px-6 py-20">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="text-4xl font-black">Who StarLiz is for</h2>
            <p className="mt-4 leading-8 text-slate-400">
              StarLiz Academy is built for households, tutors and organisations supporting learners across England pathways.
            </p>
            <ul className="mt-6 space-y-3 text-slate-300">
              <li className="flex items-center gap-3"><span className="text-yellow-400">👨‍👩‍👧</span> Parents of Reception-Year 6 children</li>
              <li className="flex items-center gap-3"><span className="text-orange-400">🧑‍🎓</span> Parents of KS3 students</li>
              <li className="flex items-center gap-3"><span className="text-purple-400">🎓</span> Parents of GCSE students</li>
              <li className="flex items-center gap-3"><span className="text-blue-400">🧑‍🏫</span> Tutors and intervention providers</li>
              <li className="flex items-center gap-3"><span className="text-blue-400">🏫</span> Schools and organisations</li>
            </ul>
          </div>
          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-8 text-center">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-yellow-500/20 text-5xl ring-2 ring-yellow-500/30">🧭</div>
            <p className="text-2xl font-black">One platform, multiple stages</p>
            <p className="mt-2 text-slate-400">Age-aware journeys from early years to GCSE.</p>
            <div className="mt-6 grid grid-cols-3 gap-3">
              {["📘 Curriculum aligned", "🏷️ Exam-board aware", "📊 Parent visibility"].map((badge) => (
                <div key={badge} className="rounded-xl border border-slate-700 bg-slate-950 px-2 py-3 text-xs font-semibold">{badge}</div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <PublicPricingSection compact initialPlans={plans} />

      {/* Roadmap teaser */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <div className="text-center">
          <h2 className="text-4xl font-black">What&apos;s coming next</h2>
          <p className="mt-4 text-slate-400">
            We&apos;re constantly improving StarLiz.{" "}
            <Link href="/roadmap" className="text-blue-400 hover:text-blue-300">See the full roadmap &#8594;</Link>
          </p>
        </div>
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {roadmapItems.map((item) => (
            <div key={item} className="rounded-2xl border border-slate-800 bg-slate-900 px-5 py-4 text-sm text-slate-300">{item}</div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-6 pb-24">
        <div className="mx-auto max-w-4xl rounded-3xl bg-gradient-to-br from-blue-700 to-indigo-800 p-12 text-center shadow-2xl shadow-blue-900/40">
          <h2 className="text-4xl font-black">Start your child&apos;s learning journey today.</h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-blue-100">
            Explore Reception to GCSE support with pathway aligned learning, exam-board-aware GCSE tagging and parent progress visibility.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link href="/signup" className="rounded-xl bg-white px-8 py-4 font-bold text-blue-700 shadow-lg transition hover:bg-blue-50">
              Start your child&apos;s learning journey
            </Link>
            <Link href="/pricing" className="rounded-xl border border-white/30 bg-white/10 px-8 py-4 font-bold text-white transition hover:bg-white/20">
              Choose a plan
            </Link>
          </div>
          <p className="mt-4 text-sm text-blue-200">No credit card required &middot; Cancel anytime</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 px-6 pb-10 pt-10">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Logo variant="full" size={28} />
              <p className="mt-2 text-sm text-slate-400">Reception to GCSE pathway aligned learning for families, tutors and schools.</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-300">Product</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-500">
                <li><Link href="/features" className="hover:text-slate-300">Features</Link></li>
                <li><Link href="#pricing" className="hover:text-slate-300">Pricing</Link></li>
                <li><Link href="/roadmap" className="hover:text-slate-300">Roadmap</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-300">Company</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-500">
                <li><Link href="/about" className="hover:text-slate-300">About</Link></li>
                <li><Link href="/contact" className="hover:text-slate-300">Contact</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-300">Legal</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-500">
                <li><Link href="/privacy" className="hover:text-slate-300">Privacy</Link></li>
                <li><Link href="/terms" className="hover:text-slate-300">Terms</Link></li>
                <li><Link href="/policies" className="hover:text-slate-300">Policies</Link></li>
              </ul>
            </div>
          </div>
          <div className="mt-10 border-t border-slate-800/60 pt-6 text-center text-sm text-slate-500">
            <p>&#169; 2026 StarLiz Academy. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </main>
  )
}
