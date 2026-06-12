import Link from "next/link"
import Logo from "@/components/Logo"
import PublicPricingSection from "@/components/pricing/PublicPricingSection"
import { getPublicPricingPlans } from "@/lib/pricing/service"
import CountryPreferenceSync from "@/components/public/CountryPreferenceSync"
import { isPublicTrialCtaEnabled, isRoadmapPublicEnabled } from "@/lib/launch-scope"

export const dynamic = "force-dynamic"

const features = [
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
    desc: "A personalised learning journey with English, maths and guided practice each day.",
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

const parentPortalFeatures = [
  "Parent dashboard and child progress snapshot",
  "Child profile management and active child picker",
  "Billing and plan management",
  "Tutor and guided learning history",
  "Consent and safeguarding preferences",
  "Child profile and account protection",
  "Downloadable progress reports",
  "Rewards progress and approval visibility",
  "Parent messages and support",
]

const adminPortalFeatures = [
  "School and group learner management",
  "Class and learner progress visibility",
  "Guided practice and assignment support",
  "Parent and student management",
  "Safeguarding-focused access controls",
  "Progress insights and reports",
  "Support and communication workflows",
  "Flexible learning organisation setup",
]

const childLearningFeatures = [
  "Daily lesson journey",
  "Assignment-based learning",
  "English, maths and guided practice",
  "Guided learning support",
  "Weak-area detection",
  "Voice-friendly learning support",
  "Confidence and progress tracking",
  "Rewards and learning motivation",
]

const trustFeatures = [
  "Secure parent, child and student access",
  "Parent consent and control settings",
  "Child profile protection",
  "Safe account access",
  "Role-based access controls",
  "Account recovery and security support",
  "Privacy-aware child safety messaging",
  "Safeguarding-focused school support",
]

const operationsFeatures = [
  "School and group learning support",
  "Simple setup and managed access",
  "Progress insights and learning reports",
  "Curriculum mastery and catch-up planning",
  "Secure subscription management",
  "Safe support and communication workflows",
  "Reliable platform access",
  "Downloadable progress and account records",
]

const subjects = [
  {
    title: "EYFS / Reception",
    text: "Early-years foundations in communication, early reading, phonics, early writing, early maths, wellbeing, creativity, and confidence.",
    icon: "🧒",
    color: "from-blue-600/20 to-blue-600/5",
    border: "border-blue-700/40",
    cta: "Explore EYFS support ->",
    href: "/signup",
  },
  {
    title: "KS1 (Years 1-2)",
    text: "Lower primary support for English, maths, science, phonics, reading confidence, writing, and foundation subjects.",
    icon: "📘",
    color: "from-cyan-600/20 to-cyan-600/5",
    border: "border-cyan-700/40",
    cta: "Explore KS1 support ->",
    href: "/signup",
  },
  {
    title: "KS2 (Years 3-6)",
    text: "Upper primary progression across English, maths, science, computing, humanities, creative subjects, languages, and wider development.",
    icon: "🧭",
    color: "from-indigo-600/20 to-indigo-600/5",
    border: "border-indigo-700/40",
    cta: "Explore KS2 support ->",
    href: "/signup",
  },
  {
    title: "KS3 (Years 7-9)",
    text: "Secondary pathway support across core subjects, science, computing, humanities, languages, creative subjects, and personal development.",
    icon: "🎯",
    color: "from-purple-600/20 to-purple-600/5",
    border: "border-purple-700/40",
    cta: "Explore KS3 support ->",
    href: "/signup",
  },
  {
    title: "KS4 / GCSE (Years 10-11)",
    text: "GCSE pathway support for English, maths, science, exam readiness, revision planning, confidence, and subject-specific practice.",
    icon: "🎓",
    color: "from-emerald-600/20 to-emerald-600/5",
    border: "border-emerald-700/40",
    cta: "View GCSE pathway ->",
    href: "/pricing",
  },
]

const steps = [
  {
    step: "1",
    title: "Create the right profile",
    desc: "Parents create child profiles, choose the active learner and keep each profile protected with parent controls.",
    icon: "👤",
  },
  {
    step: "2",
    title: "Learn with guided support",
    desc: "Children complete daily journeys, assigned tasks and English, maths, reading and writing support with guided learning.",
    icon: "📝",
  },
  {
    step: "3",
    title: "Review, report and improve",
    desc: "Parents, tutors, admins and schools use reports, rewards, messaging and governance tools to support the next step.",
    icon: "📊",
  },
]

const roadmapItems = [
  "🎓 Deeper GCSE pathway support",
  "🏷️ Expanded exam-board aligned reporting",
  "📧 Parent insights and scheduling improvements",
  "🏫 School and governance enhancements",
  "📱 Improved mobile parent experience",
  "📊 Readiness, catch-up and progress insights",
]

export default async function PublicHomePage() {
  const showRoadmap = isRoadmapPublicEnabled();
  const showTrialCta = isPublicTrialCtaEnabled();

  let plans = [] as Awaited<ReturnType<typeof getPublicPricingPlans>>;
  try {
    plans = await getPublicPricingPlans();
  } catch {
    plans = [];
  }

  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <CountryPreferenceSync countryCode="uk" />
      {/* Navigation */}
      <header className="sticky top-0 z-50 border-b border-slate-800/80 bg-[#020617]/90 px-4 sm:px-6 py-3 sm:py-4 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1900px] items-center justify-between">
          <Logo variant="header" size={24} />

          <nav className="hidden items-center gap-5 sm:gap-7 text-xs sm:text-sm text-slate-400 md:flex">
            <Link href="#features" className="transition hover:text-white">Platform</Link>
            <Link href="#subjects" className="transition hover:text-white">Subjects</Link>
            <Link href="#portals" className="transition hover:text-white">Portals</Link>
            <Link href="#trust" className="transition hover:text-white">Trust</Link>
            <Link href="#how-it-works" className="transition hover:text-white">How it works</Link>
            <Link href="#pricing" className="transition hover:text-white">Pricing</Link>
            <Link href="/" className="transition hover:text-white">Change country</Link>
            {showRoadmap ? <Link href="/roadmap" className="transition hover:text-white">Roadmap</Link> : null}
            <Link href="/auth/login" className="transition hover:text-white">Login</Link>
            <Link href="/signup" className="rounded-lg border border-blue-500/50 bg-blue-500/10 px-3 py-1.5 font-semibold text-blue-200 transition hover:bg-blue-500/20 hover:text-blue-100">Create Account</Link>
          </nav>

          <Link
            href={showTrialCta ? "/trial" : "/signup"}
            className="rounded-lg sm:rounded-xl bg-blue-600 px-3 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-bold transition hover:bg-blue-500 whitespace-nowrap"
          >
            {showTrialCta ? "Free Trial" : "Create Account"}
          </Link>
        </div>

        <details className="mx-auto mt-3 max-w-[1900px] md:hidden">
          <summary className="inline-flex list-none cursor-pointer items-center rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-900/70">
            Menu
          </summary>
          <nav className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-300">
            <Link href="#features" className="rounded-lg border border-slate-700 px-3 py-2 text-center transition hover:text-white">Platform</Link>
            <Link href="#subjects" className="rounded-lg border border-slate-700 px-3 py-2 text-center transition hover:text-white">Subjects</Link>
            <Link href="#portals" className="rounded-lg border border-slate-700 px-3 py-2 text-center transition hover:text-white">Portals</Link>
            <Link href="#trust" className="rounded-lg border border-slate-700 px-3 py-2 text-center transition hover:text-white">Trust</Link>
            <Link href="#how-it-works" className="rounded-lg border border-slate-700 px-3 py-2 text-center transition hover:text-white">How it works</Link>
            <Link href="#pricing" className="rounded-lg border border-slate-700 px-3 py-2 text-center transition hover:text-white">Pricing</Link>
            <Link href="/" className="rounded-lg border border-slate-700 px-3 py-2 text-center transition hover:text-white">Change country</Link>
            {showRoadmap ? <Link href="/roadmap" className="rounded-lg border border-slate-700 px-3 py-2 text-center transition hover:text-white">Roadmap</Link> : null}
            <Link href="/auth/login" className="rounded-lg border border-slate-700 px-3 py-2 text-center transition hover:text-white">Login</Link>
            <Link href="/signup" className="rounded-lg border border-blue-500/50 bg-blue-500/10 px-3 py-2 text-center font-semibold text-blue-200 transition hover:bg-blue-500/20">Create Account</Link>
            <Link href={showTrialCta ? "/trial" : "/signup"} className="rounded-lg border border-slate-700 px-3 py-2 text-center transition hover:text-white">{showTrialCta ? "Free Trial" : "Create Account"}</Link>
          </nav>
        </details>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden px-4 sm:px-6 py-12 sm:py-24">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(59,130,246,0.15),transparent)]" />
        <div className="mx-auto grid max-w-[1900px] gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-12">
          <div>
            <Logo variant="full" size={32} className="mb-4 sm:mb-6 sm:size-48" />
            <p className="mb-4 sm:mb-5 inline-flex rounded-full border border-blue-500/30 bg-blue-500/10 px-3 sm:px-4 py-1 sm:py-1.5 text-xs sm:text-sm font-semibold text-blue-300">
              Parent, student and school-ready learning platform
            </p>

            <h1 className="text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-black leading-[1.2] tracking-tight">
              More than a learning game:{" "}
              <span className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
                a full education platform.
              </span>
            </h1>

            <p className="mt-4 sm:mt-6 max-w-xl text-sm sm:text-base lg:text-lg leading-6 sm:leading-8 text-slate-300">
              StarLiz Academy helps children learn with adaptive lessons, smart catch-up, guided practice, parent visibility, and curriculum-aware progress tracking from EYFS and primary stages through KS3 and GCSE pathways.
            </p>

            <div className="mt-6 sm:mt-9 flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4">
              <Link
                href={showTrialCta ? "/trial" : "/signup"}
                className="rounded-lg sm:rounded-xl bg-blue-600 px-5 sm:px-7 py-3 sm:py-4 text-sm sm:text-base font-bold shadow-lg shadow-blue-600/20 transition hover:bg-blue-500 text-center"
              >
                {showTrialCta ? "Start your child&apos;s learning journey" : "Create your child account"}
              </Link>
              <Link
                href="/pricing"
                className="rounded-lg sm:rounded-xl border border-slate-700 px-5 sm:px-7 py-3 sm:py-4 text-sm sm:text-base font-bold transition hover:bg-slate-900 text-center"
              >
                Choose a plan
              </Link>
            </div>

            <p className="mt-3 sm:mt-4 text-xs sm:text-sm text-slate-500">
              No credit card required &middot; Parent-friendly controls &middot; Built for trust
            </p>
          </div>

          <div className="rounded-2xl sm:rounded-3xl border border-slate-800 bg-slate-900/60 p-4 sm:p-6 shadow-2xl backdrop-blur-sm">
            <div className="rounded-2xl bg-slate-950 p-5">
              <p className="text-sm font-semibold text-blue-300">Today&apos;s Platform Snapshot</p>
              <div className="mt-5 space-y-4">
                <div className="flex items-center gap-4 rounded-2xl bg-slate-900 p-4">
                  <span className="text-3xl">🧒</span>
                  <div>
                    <p className="font-semibold">Daily lesson journey ready</p>
                    <p className="text-sm text-slate-400">Guided practice with clear explanations, examples, visuals, practice tasks and review activities.</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 rounded-2xl bg-slate-900 p-4">
                  <span className="text-3xl">⭐</span>
                  <div>
                    <p className="font-semibold">Rewards progress updated</p>
                    <p className="text-sm text-slate-400">Achievements and rewards progress stay visible to parents.</p>
                  </div>
                </div>
                <div className="rounded-2xl border border-emerald-700/40 bg-emerald-500/10 p-4">
                  <p className="font-bold text-emerald-300">Safe account access</p>
                  <p className="mt-1 text-sm text-slate-300">
                    Parent controls help keep each child profile protected.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="border-y border-slate-800/60 bg-slate-900/30 px-4 sm:px-6 py-4 sm:py-6">
        <div className="mx-auto flex max-w-[1900px] flex-wrap items-center justify-center gap-3 sm:gap-6 text-xs sm:text-sm font-medium text-slate-400">
          <span className="w-full sm:w-auto text-center sm:text-left">&#10003; Parent and child protected access</span>
          <span className="hidden sm:inline text-slate-700">|</span>
          <span className="w-full sm:w-auto text-center sm:text-left">&#10003; Consent and safeguarding support</span>
          <span className="hidden sm:inline text-slate-700">|</span>
          <span className="w-full sm:w-auto text-center sm:text-left">&#10003; Parent, student and school-ready access</span>
          <span className="hidden sm:inline text-slate-700">|</span>
          <span className="w-full sm:w-auto text-center sm:text-left">&#10003; Reports, rewards and billing</span>
          <span className="hidden sm:inline text-slate-700">|</span>
          <span className="w-full sm:w-auto text-center sm:text-left">&#10003; Smart learning support and Smart Coach guidance</span>
        </div>
      </section>

      {/* Learning Areas */}
      <section id="subjects" className="mx-auto max-w-[1900px] px-4 sm:px-6 lg:px-10 2xl:px-16 py-10 sm:py-16">
        <div className="text-center">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black">Learning Pathways</h2>
          <p className="mt-2 sm:mt-4 text-sm sm:text-base text-slate-400">Age-aware support from EYFS and Key Stage 1 through to GCSE.</p>
        </div>

        <div className="mt-8 sm:mt-12 grid gap-4 sm:gap-6 md:grid-cols-2 xl:grid-cols-3">
          {subjects.map((subject) => (
            <div
              key={subject.title}
              className={`rounded-2xl sm:rounded-3xl border ${subject.border} bg-gradient-to-b ${subject.color} p-6 sm:p-8`}
            >
              <p className="text-4xl sm:text-5xl">{subject.icon}</p>
              <h3 className="mt-4 sm:mt-5 text-lg sm:text-xl font-bold">{subject.title}</h3>
              <p className="mt-2 sm:mt-3 text-sm sm:text-base leading-6 sm:leading-7 text-slate-400">{subject.text}</p>
              <Link href={subject.href} className="mt-4 sm:mt-6 inline-block text-xs sm:text-sm font-semibold text-blue-400 hover:text-blue-300">
                {subject.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="bg-slate-900/40 px-4 sm:px-6 lg:px-10 2xl:px-16 py-10 sm:py-16">
        <div className="mx-auto max-w-[1900px]">
          <div className="text-center">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black">Core learning features for families</h2>
            <p className="mx-auto mt-2 sm:mt-4 max-w-3xl text-sm sm:text-base text-slate-400">
              Designed for daily progress, guided practice and clear parent visibility.
            </p>
          </div>

          <div className="mt-8 sm:mt-12 grid gap-4 sm:gap-6 sm:grid-cols-2 xl:grid-cols-4">
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

      {/* Portal depth */}
      <section id="portals" className="mx-auto max-w-[1900px] px-4 sm:px-6 lg:px-10 2xl:px-16 py-10 sm:py-16">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl sm:rounded-3xl border border-slate-800 bg-slate-900 p-6 sm:p-8">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-300">Parent Portal</p>
            <h2 className="mt-3 text-2xl sm:text-3xl font-black">Clear visibility for every family</h2>
            <p className="mt-3 text-sm sm:text-base leading-7 text-slate-400">
              Parents can manage children, protect access, follow learning progress, handle billing,
              message support and keep consent decisions transparent.
            </p>
            <ul className="mt-6 grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
              {parentPortalFeatures.map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <span className="mt-0.5 text-blue-400">&#10003;</span>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl sm:rounded-3xl border border-slate-800 bg-slate-900 p-6 sm:p-8">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-indigo-300">ORGANISATION SUPPORT</p>
            <h2 className="mt-3 text-2xl sm:text-3xl font-black">Support for schools and learning organisations</h2>
            <p className="mt-3 text-sm sm:text-base leading-7 text-slate-400">
              StarLiz can support schools, tutors and learning organisations with learner management,
              progress visibility, safeguarding-focused access and clear reporting.
            </p>
            <ul className="mt-6 grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
              {adminPortalFeatures.map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <span className="mt-0.5 text-indigo-400">&#10003;</span>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Child learning */}
      <section className="bg-slate-900/40 px-4 sm:px-6 lg:px-10 2xl:px-16 py-10 sm:py-16">
        <div className="mx-auto max-w-[1900px]">
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-300">Child Learning</p>
              <h2 className="mt-3 text-2xl sm:text-3xl lg:text-4xl font-black">Structured practice that still feels motivating</h2>
              <p className="mt-4 text-sm sm:text-base leading-7 text-slate-400">
                Children follow a personalised learning journey with adaptive lessons, guided practice,
                Smart Coach Support and Progress Insights that parents can clearly track.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {childLearningFeatures.map((feature) => (
                <div key={feature} className="rounded-2xl border border-slate-800 bg-slate-950 p-4 text-sm font-semibold text-slate-200">
                  {feature}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="mx-auto max-w-[1900px] px-4 sm:px-6 lg:px-10 2xl:px-16 py-10 sm:py-16">
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

      {/* Platform operations */}
      <section className="bg-gradient-to-b from-slate-900/60 to-transparent px-4 sm:px-6 lg:px-10 2xl:px-16 py-10 sm:py-16">
        <div className="mx-auto max-w-[1900px] text-center">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black">Built for families, schools and learning organisations</h2>
          <p className="mx-auto mt-2 sm:mt-4 max-w-2xl text-xs sm:text-sm lg:text-base text-slate-400">
            StarLiz supports the practical learning journey with learner profiles, group support, progress visibility,
            safeguarding-focused access, subscriptions and clear reporting.
          </p>

          <div className="mt-8 sm:mt-12 grid gap-3 sm:gap-4 rounded-2xl sm:rounded-3xl border border-slate-800 bg-slate-900 p-4 sm:p-6 sm:grid-cols-2 lg:grid-cols-4">
            {operationsFeatures.map((feature) => (
              <div key={feature} className="rounded-lg sm:rounded-2xl bg-slate-950 p-4 sm:p-5 text-sm font-semibold text-slate-200">
                {feature}
              </div>
            ))}
          </div>

          <Link href="/trial" className="mt-6 sm:mt-8 inline-flex rounded-lg sm:rounded-xl bg-blue-600 px-5 sm:px-7 py-3 sm:py-4 text-sm sm:text-base font-bold shadow-lg shadow-blue-600/20 transition hover:bg-blue-500">
            Explore platform features
          </Link>
        </div>
      </section>

      {/* Trust */}
      <section id="trust" className="mx-auto max-w-[1900px] px-4 sm:px-6 lg:px-10 2xl:px-16 py-10 sm:py-16">
        <div className="rounded-2xl sm:rounded-3xl border border-slate-800 bg-slate-900 p-6 sm:p-8 lg:p-10">
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-cyan-300">Safety, Privacy and Trust</p>
              <h2 className="mt-3 text-2xl sm:text-3xl lg:text-4xl font-black">Designed for child safety and parent control</h2>
              <p className="mt-4 text-sm sm:text-base leading-7 text-slate-400">
                StarLiz is designed with parent consent, child profile protection, safeguarding awareness,
                role-based access and privacy-aware learning records.
              </p>
            </div>
            <ul className="grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
              {trustFeatures.map((feature) => (
                <li key={feature} className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Audience */}
      <section className="mx-auto max-w-[1900px] px-4 sm:px-6 lg:px-10 2xl:px-16 py-10 sm:py-16">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="text-4xl font-black">Who StarLiz is for</h2>
            <p className="mt-4 leading-8 text-slate-400">
              StarLiz Academy is built for households, tutors and organisations supporting learners across England pathways.
            </p>
            <ul className="mt-6 space-y-3 text-slate-300">
              <li className="flex items-center gap-3"><span className="text-yellow-400">👨‍👩‍👧</span> Parents of EYFS, KS1 and KS2 children</li>
              <li className="flex items-center gap-3"><span className="text-orange-400">🧑‍🎓</span> Parents of KS3 students</li>
              <li className="flex items-center gap-3"><span className="text-purple-400">🎓</span> Parents of GCSE students</li>
              <li className="flex items-center gap-3"><span className="text-blue-400">🧑‍🏫</span> Tutors and intervention providers</li>
              <li className="flex items-center gap-3"><span className="text-blue-400">🏫</span> Schools and learning organisations</li>
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
      <section className="mx-auto max-w-[1900px] px-4 sm:px-6 lg:px-10 2xl:px-16 py-10 sm:py-16">
        <div className="text-center">
          <h2 className="text-4xl font-black">What&apos;s coming next</h2>
          <p className="mt-4 text-slate-400">
            We&apos;re constantly improving StarLiz.{" "}
            <Link href="/roadmap" className="text-blue-400 hover:text-blue-300">See the full roadmap &#8594;</Link>
          </p>
        </div>
        <div className="mt-10 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
            Explore Reception to GCSE support with pathway aligned learning, exam-board aligned revision guidance and parent progress visibility.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link href="/trial" className="rounded-xl bg-white px-8 py-4 font-bold text-blue-700 shadow-lg transition hover:bg-blue-50">
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
      <footer className="border-t border-slate-200 bg-white px-3 py-1 text-slate-600 sm:px-4">
        <div className="mx-auto flex max-w-[1900px] flex-col items-center justify-between gap-1 text-center text-[9px] font-medium leading-none sm:flex-row sm:text-left">
          <p>&#169; 2026 StarLiz Academy. All rights reserved.</p>
          <p>StarLiz Academy - Learn, Grow, Shine</p>
          <p className="text-slate-500">Best viewed on the latest version of Google Chrome.</p>
        </div>
      </footer>
    </main>
  )
}
