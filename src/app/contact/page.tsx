import type { Metadata } from "next"
import PublicShell from "@/components/layout/PublicShell"
import CompanyIdentity from "@/components/public/CompanyIdentity"

export const metadata: Metadata = {
  title: "Contact StarLiz Academy",
  description:
    "Contact StarLiz Academy for account support, billing enquiries, complaints, accessibility feedback or safeguarding concerns.",
}

export default function Contact() {
  return (
    <PublicShell>
      <div className="mx-auto max-w-4xl px-6 py-20 text-center">
        <h1 className="text-4xl font-black mb-6">Contact</h1>
        <p className="text-slate-400 mb-4 text-lg">
          We&apos;d love to hear from you.
        </p>

        <div className="mt-10 inline-block rounded-3xl border border-slate-800 bg-slate-900 px-6 py-10 sm:px-12">
          <p className="text-slate-400 mb-2">For support or enquiries, email us at:</p>
          <a
            href="mailto:support@starlizacademy.com"
            className="text-xl font-semibold text-blue-400 hover:text-blue-300"
          >
            support@starlizacademy.com
          </a>

          <div className="mt-8 grid gap-4 text-left sm:grid-cols-2">
            <div className="rounded-xl border border-slate-700 bg-slate-950 p-4">
              <p className="font-semibold text-sm mb-1">Account support</p>
              <p className="text-sm text-slate-400">Login issues, billing, cancellations</p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-950 p-4">
              <p className="font-semibold text-sm mb-1">Feedback</p>
              <p className="text-sm text-slate-400">Accessibility issues, suggestions and complaints</p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-950 p-4 sm:col-span-2">
              <p className="font-semibold text-sm mb-1">Safeguarding</p>
              <p className="text-sm text-slate-400">
                Child welfare concerns should be sent immediately to{" "}
                <a href="mailto:safeguarding@starlizacademy.com" className="font-semibold text-blue-400 underline hover:text-blue-300">
                  safeguarding@starlizacademy.com
                </a>
                . Contact emergency services if a child is in immediate danger.
              </p>
            </div>
          </div>
        </div>

        <div className="mx-auto mt-10 max-w-2xl text-sm leading-6 text-slate-500">
          <p>
            Urgent account-access or payment-blocking issues are acknowledged within 1 working day.
            Ordinary complaints are acknowledged within 2 working days, with a substantive response
            targeted within 10 working days. See the Complaints Procedure for complex cases.
          </p>
          <div className="mt-6 border-t border-slate-800 pt-6">
            <CompanyIdentity />
          </div>
        </div>
      </div>

    </PublicShell>
  )
}
