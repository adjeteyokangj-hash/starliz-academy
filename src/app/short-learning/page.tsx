import type { Metadata } from "next";
import Link from "next/link";
import PublicShell from "@/components/layout/PublicShell";
import {
  SHORT_LEARNING_CHECKBOX,
  SHORT_LEARNING_PROMISE,
} from "@/lib/schools/short-learning-bookings";

export const metadata: Metadata = {
  title: "Short Learning | AI-Led 90 and 120 Minute Sessions",
  description:
    "Parent-booked, AI-led 90- or 120-minute Maths and English sessions with progress tracking and availability-based human support through the Support desk.",
  openGraph: {
    title: "StarLiz Short Learning | AI-Led Sessions",
    description:
      "Understand the AI-first model, booking windows, 90/120-minute journeys and availability-based human support.",
    images: ["/brand/starliz-logo.png"],
  },
};

const highlights = [
  "AI-led sessions — human tutors are a safety net when on shift, not a private booking.",
  "Monthly subscription covers access with no cancellation fees.",
  "Book 90- or 120-minute sessions in weekday (16:00–20:00) or weekend (09:00–18:00) windows.",
  "Late bookings succeed only when capacity already exists.",
  "Repeated no-shows may lead to booking limits — never financial penalties.",
];

const faq = [
  {
    q: "Does my subscription guarantee a human tutor?",
    a: "No. AI teaching is guaranteed. Human support depends on tutor shift coverage and availability.",
  },
  {
    q: "Am I booking a named tutor?",
    a: "No. You reserve Short Learning time for your child. Tutors on published shifts may join as a safety net.",
  },
  {
    q: "Is there a cancellation fee?",
    a: "No. Cancel freely — we track timing operationally only. Your monthly subscription is unchanged.",
  },
  {
    q: "How is this different from Day School?",
    a: "Day School follows your school timetable and Live Classroom periods. Short Learning is parent-booked, after-hours, and AI-led. If AI help is exhausted, availability-based human support uses the separate Support desk rather than the Day School Live Classroom.",
  },
];

export default function ShortLearningPublicPage() {
  return (
    <PublicShell>
      <section className="relative overflow-hidden px-6 pb-10 pt-24 text-center">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-25%,rgba(139,92,246,0.18),transparent)]" />
        <div className="relative mx-auto max-w-4xl">
          <p className="inline-flex rounded-full border border-violet-500/35 bg-violet-500/10 px-4 py-1.5 text-sm font-semibold text-violet-300">
            After-hours · AI-led · Parent-booked
          </p>
          <h1 className="mt-6 text-5xl font-black leading-tight tracking-tight md:text-6xl">
            Short Learning
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-300">
            Extra focused learning outside the school day — led by AI coaching with optional human
            support when tutors are on shift.
          </p>
          <p className="mx-auto mt-4 max-w-2xl text-base font-medium text-violet-200">
            {SHORT_LEARNING_PROMISE}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link
              href="/signup"
              className="rounded-xl bg-violet-600 px-7 py-3 font-bold transition hover:bg-violet-500"
            >
              Start with a subscription
            </Link>
            <Link
              href="/pricing"
              className="rounded-xl border border-slate-700 px-7 py-3 font-bold text-slate-200 transition hover:bg-slate-900"
            >
              View pricing
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 pb-12">
        <div className="grid gap-3 sm:grid-cols-2">
          {highlights.map((item) => (
            <div
              key={item}
              className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-left text-sm text-slate-300"
            >
              <span className="mr-2 text-violet-400">✓</span>
              {item}
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-2xl border border-violet-900/50 bg-violet-950/40 p-6 text-left">
          <p className="text-xs font-bold uppercase tracking-widest text-violet-400">Before you book</p>
          <p className="mt-2 text-sm text-violet-100">{SHORT_LEARNING_CHECKBOX}</p>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 pb-20">
        <h2 className="text-2xl font-black text-white">FAQ</h2>
        <div className="mt-6 space-y-4">
          {faq.map((item) => (
            <div key={item.q} className="rounded-2xl border border-slate-800 bg-slate-900 p-5 text-left">
              <h3 className="font-semibold text-white">{item.q}</h3>
              <p className="mt-2 text-sm leading-7 text-slate-400">{item.a}</p>
            </div>
          ))}
        </div>
      </section>
    </PublicShell>
  );
}
