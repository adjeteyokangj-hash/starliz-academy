import Link from "next/link"
import PublicShell from "@/components/layout/PublicShell"

export default function BillingCancelPage() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-2xl px-6 py-20">
        <div className="rounded-[2rem] border border-slate-800 bg-slate-900 p-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-300">
            Billing
          </p>
          <h1 className="mt-3 text-4xl font-black">Checkout cancelled</h1>
          <p className="mt-4 leading-7 text-slate-300">
            No payment was taken. You can choose a plan again when you are ready.
          </p>
          <Link
            href="/pricing"
            className="mt-8 inline-flex rounded-2xl bg-blue-600 px-6 py-4 font-bold hover:bg-blue-500"
          >
            Back to pricing
          </Link>
        </div>
      </section>
    </PublicShell>
  )
}
