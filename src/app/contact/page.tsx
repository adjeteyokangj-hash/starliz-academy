import Link from "next/link"
import PublicShell from "@/components/layout/PublicShell"

export default function Contact() {
  return (
    <PublicShell>
      <div className="mx-auto max-w-4xl px-6 py-20 text-center">
        <h1 className="text-4xl font-black mb-6">Contact</h1>
        <p className="text-slate-400 mb-4 text-lg">
          We&apos;d love to hear from you.
        </p>

        <div className="mt-10 inline-block rounded-3xl border border-slate-800 bg-slate-900 px-12 py-10">
          <p className="text-slate-400 mb-2">For support or enquiries, email us at:</p>
          <a
            href="mailto:support@starlizacademy.com"
            className="text-xl font-semibold text-blue-400 hover:text-blue-300"
          >
            support@starlizacademy.com
          </a>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 text-left">
            <div className="rounded-xl border border-slate-700 bg-slate-950 p-4">
              <p className="font-semibold text-sm mb-1">Account support</p>
              <p className="text-sm text-slate-400">Login issues, billing, cancellations</p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-950 p-4">
              <p className="font-semibold text-sm mb-1">Feedback</p>
              <p className="text-sm text-slate-400">Suggestions and feature requests</p>
            </div>
          </div>
        </div>

        <p className="mt-10 text-sm text-slate-500">
          We aim to respond within 1 business day.
        </p>
      </div>

    </PublicShell>
  )
}
