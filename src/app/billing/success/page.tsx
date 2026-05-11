import Link from "next/link"
import PublicShell from "@/components/layout/PublicShell"

export default function BillingSuccessPage() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-2xl px-6 py-20">
        <div className="rounded-[2rem] border border-emerald-700/40 bg-emerald-500/10 p-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
            Billing
          </p>
          <h1 className="mt-3 text-4xl font-black">Payment successful</h1>
          <p className="mt-4 leading-7 text-slate-300">
            Thank you. Stripe has confirmed checkout, and your subscription will unlock after the webhook updates your account.
          </p>
          <Link
            href="/profiles"
            className="mt-8 inline-flex rounded-2xl bg-blue-600 px-6 py-4 font-bold hover:bg-blue-500"
          >
            Continue
          </Link>
        </div>
      </section>
    </PublicShell>
  )
}
