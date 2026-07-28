import type { Metadata } from "next"
import Link from "next/link"
import PublicShell from "@/components/layout/PublicShell"
import { SHORT_LEARNING_PROMISE } from "@/lib/schools/short-learning-bookings"

export const metadata: Metadata = {
  title: "Learning Features | StarLiz Academy",
  description:
    "Explore adaptive lessons, AI Tutor guidance, Short Learning, parent progress visibility and safeguarding-focused controls.",
}

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
  {
    icon: "🌙",
    title: "Short Learning (AI-led)",
    desc: "Parent-booked after-hours sessions (90/120 min). AI teaching is guaranteed; human tutors join only when on shift and available.",
  },
]

export default function Features() {
  return (
    <PublicShell>
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
          <p className="mx-auto mb-6 max-w-2xl text-sm text-violet-300/90">{SHORT_LEARNING_PROMISE}</p>
          <Link href="/short-learning" className="mr-4 inline-flex rounded-xl border border-violet-700 px-6 py-3 font-bold text-violet-200 hover:bg-violet-950">
            Short Learning explainer
          </Link>
          <Link href="/pricing" className="inline-flex rounded-xl bg-blue-600 px-8 py-4 font-bold shadow-lg shadow-blue-600/20 hover:bg-blue-500">
            View pricing and platform options
          </Link>
        </div>
      </div>

      <p className="pb-10 text-center text-xs text-slate-500">Best viewed on the latest version of Google Chrome.</p>
    </PublicShell>
  )
}
