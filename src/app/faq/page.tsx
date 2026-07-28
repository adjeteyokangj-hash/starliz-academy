import type { Metadata } from "next";
import Link from "next/link";
import PublicShell from "@/components/layout/PublicShell";
import {
  SHORT_LEARNING_ALLOWED_DURATIONS,
  SHORT_LEARNING_PROMISE,
} from "@/lib/schools/short-learning-bookings";

export const metadata: Metadata = {
  title: "Frequently Asked Questions | StarLiz Academy",
  description:
    "Answers for parents about AI-led Short Learning, 90- and 120-minute bookings, subscriptions, cancellations, human support and safeguarding.",
};

const faqItems = [
  {
    question: "What is the difference between Day School and Short Learning?",
    answer:
      "Day School follows your child's school timetable with scheduled classroom periods and attendance tracking during the school day. Parents do not book Day School periods. Short Learning is parent-booked, after-hours, and AI-led: extra focused learning outside normal school hours in 90- or 120-minute sessions.",
  },
  {
    question: "Is AI teaching guaranteed?",
    answer: SHORT_LEARNING_PROMISE,
  },
  {
    question: "What is the human tutor safety net?",
    answer:
      "Human tutors on published support shifts may join through the Short Learning Support desk when available if a child needs extra help after AI support is exhausted. This is separate from the Day School Live Classroom and is not a private 1:1 tutor booking. AI coaching continues regardless, and children are never left waiting for an offline tutor.",
  },
  {
    question: "Are there cancellation fees on Short Learning bookings?",
    answer:
      "No. There is no cancellation fee, no late-cancellation charge, and no per-booking fee. Your monthly subscription covers booking access; cancelling a session does not trigger payment changes.",
  },
  {
    question: "When can parents book Short Learning sessions?",
    answer:
      "Weekday sessions can be booked in the 16:00–20:00 window, opening up to 7 days ahead with a same-day deadline at 12:00. Weekend sessions use a 09:00–18:00 window, opening up to 14 days ahead with a Thursday 18:00 deadline. Late bookings succeed only when capacity already exists.",
  },
  {
    question: "How long are Short Learning sessions?",
    answer: `Sessions are ${SHORT_LEARNING_ALLOWED_DURATIONS.join(" or ")} minutes on 30-minute start boundaries — choose the length that fits your child's focus window.`,
  },
  {
    question: "Does cancelling a booking cancel my subscription?",
    answer:
      "No. Cancel booking is not cancel subscription. Booking cancellation has no fee and does not change billing. Subscription cancellation is separate and is done in the Parent Portal — access continues until the end of the current billing period, then renewals stop.",
  },
  {
    question: "How do I cancel my subscription?",
    answer:
      "Cancel inside the Parent Portal (self-service). Support can help if needed, but there is no phone-only or hidden process. Cancellation takes effect at the end of the current billing period — not immediately.",
  },
  {
    question: "Do I get a refund if I cancel mid-month?",
    answer:
      "No automatic pro-rata refund. Your subscription stays active until the end of the current billing period and access continues until then. In rare exceptional cases (for example a duplicate payment), StarLiz may consider a goodwill refund at Platform Admin discretion — see the Refund Policy.",
  },
  {
    question: "Do I get a refund if a human tutor was not available?",
    answer:
      "No. AI teaching is guaranteed; human support is a safety net when available. Human tutor unavailability is not a refund event where the AI learning service worked as described.",
  },
  {
    question: "Do unused Short Learning sessions get refunded?",
    answer:
      "No. The subscription purchases access for the billing period, not guaranteed attendance at every booked session.",
  },
  {
    question: "Is there a cooling-off period?",
    answer:
      "For new consumer subscriptions purchased online, StarLiz applies a 14-day cooling-off period with immediate service start where you choose digital access now. Exact refund wording if you have already used the service is confirmed during legal review.",
  },
  {
    question: "What happens if my payment fails?",
    answer:
      "There is a 7-day grace period with email notice and retries. Access and bookings continue during grace. After day 7, Short Learning entitlement suspends until payment succeeds; learning history remains intact and access restores immediately after successful payment.",
  },
  {
    question: "Does a subscription guarantee a named human tutor?",
    answer:
      "No. A subscription gives access to book Short Learning time for your child. AI teaching is guaranteed; human support depends on tutor shift coverage and live availability.",
  },
  {
    question: "What happens if no tutor is available?",
    answer:
      "Your child continues learning with the AI Tutor. We do not park children waiting for an offline tutor. Human support is not guaranteed.",
  },
  {
    question: "Can tutors go available just by logging in?",
    answer:
      "No. Login does not mean available. Tutors can only become available when on a published shift, with a fresh heartbeat and active access.",
  },
  {
    question: "What do no-shows mean for my account?",
    answer:
      "Repeated no-shows may lead to reduced booking limits, shorter advance-booking windows, extra confirmations, or temporary booking restrictions. These are operational controls — not financial penalties.",
  },
  {
    question: "Who is responsible for my child's Day School data — the school or StarLiz?",
    answer:
      "When a school provides StarLiz, the school or academy trust is normally the data controller for pupil, timetable, attendance and school-directed learning records, and StarLiz processes that information on the school's documented instructions. When you buy Short Learning directly from StarLiz, StarLiz is normally the controller for that subscription and booking service. See the Privacy Policy and Data Protection Policy.",
  },
  {
    question: "How long does StarLiz keep my child's learning data?",
    answer:
      "Ordinary learning progress and Short Learning booking records are typically retained for up to 3 years after activity or the session. Detailed AI Tutor conversations are typically retained for 12 months. Closed profiles are typically retained for 24 months after closure. Financial records are kept for 6 years from the end of the relevant financial year. Safeguarding records follow a separate schedule. Full details are in the Data Retention Policy (commercial schedule pending solicitor and DPO review).",
  },
  {
    question: "Is StarLiz WCAG accessible?",
    answer:
      "StarLiz is designed with the objective of conforming to WCAG 2.2 Level AA. We continually improve accessibility and investigate reported barriers. Until independently audited, we do not claim full WCAG 2.2 AA compliance or certification. Report issues to support@starlizacademy.com with the page URL.",
  },
  {
    question: "How do I make a complaint, and how quickly will you respond?",
    answer:
      "Email support@starlizacademy.com with your account email and issue details. We aim to acknowledge ordinary complaints within 2 working days and give a substantive response within 10 working days. Complex matters may take up to 20 working days (with an interim update by day 10 if still open). Urgent account-access or payment-blocking issues are acknowledged within 1 working day. Child welfare concerns go to safeguarding@starlizacademy.com immediately and are outside ordinary complaint timelines. See the Complaints Procedure.",
  },
  {
    question: "Where can I read the full policies?",
    answer:
      "Open the Policies hub for public legal and learning policy drafts, or browse plain-language articles in the Knowledge Centre. Staff handbooks and operational runbooks are authenticated-only for school and platform operators.",
  },
];

export default function FaqPage() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-300">Help centre</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight md:text-5xl">Frequently asked questions</h1>
        <p className="mt-4 text-lg text-slate-300">
          Answers about Day School, Short Learning, booking windows, and how AI-led sessions work at StarLiz Academy.
        </p>

        <div className="mt-10 space-y-4">
          {faqItems.map((item) => (
            <details
              key={item.question}
              className="group rounded-2xl border border-slate-800 bg-slate-900/50 p-5 open:border-violet-500/40"
            >
              <summary className="cursor-pointer list-none text-base font-bold text-white marker:content-none">
                {item.question}
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">{item.answer}</p>
            </details>
          ))}
        </div>

        <div className="mt-12 rounded-2xl border border-violet-500/30 bg-violet-500/10 p-6">
          <p className="text-sm font-semibold text-violet-200">Still have questions?</p>
          <p className="mt-2 text-sm text-slate-300">
            Browse the{" "}
            <Link href="/knowledge-centre" className="font-semibold text-violet-200 underline hover:text-white">
              Knowledge Centre
            </Link>
            , read{" "}
            <Link href="/policies" className="font-semibold text-violet-200 underline hover:text-white">
              Policies
            </Link>
            , or{" "}
            <Link href="/contact" className="font-semibold text-violet-200 underline hover:text-white">
              contact us
            </Link>
            .
          </p>
        </div>
      </section>
    </PublicShell>
  );
}
