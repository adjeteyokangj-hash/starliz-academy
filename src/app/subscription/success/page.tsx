import Link from "next/link";
import Navbar from "@/components/layout/Navbar";

export default function SubscriptionSuccessPage() {
  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="mx-auto max-w-2xl px-4 py-10">
        <section className="rounded-3xl border border-emerald-200 bg-white p-8 shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Billing</p>
          <h1 className="mt-2 text-3xl font-black text-slate-900">Payment Successful</h1>
          <p className="mt-3 text-slate-700">
            Your subscription has been updated with Stripe for the UK launch.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/subscription" className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-black text-white hover:bg-teal-500">
              Back to Subscription
            </Link>
            <Link href="/parent" className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50">
              Go to Parent Area
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}