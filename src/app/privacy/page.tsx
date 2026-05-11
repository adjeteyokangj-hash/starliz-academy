import Link from "next/link"

export default function Privacy() {
  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <header className="border-b border-slate-800/80 px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Link href="/" className="bg-linear-to-r from-blue-400 to-indigo-400 bg-clip-text text-xl font-black text-transparent tracking-tight">
            StarLiz Academy
          </Link>
          <Link href="/signup" className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold hover:bg-blue-500">
            Start Free Trial
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-20">
        <h1 className="text-4xl font-black mb-6">Privacy Policy</h1>
        <p className="text-sm text-slate-500 mb-10">Last updated: 7 May 2026</p>

        <p className="mb-8 text-slate-400 leading-8">
          StarLiz Academy is committed to protecting your privacy and your child&apos;s data.
          We take data protection seriously and only collect what is necessary to deliver the service.
        </p>

        <div className="space-y-8">
          <div>
            <h2 className="text-xl font-bold mb-3">What parent data is collected</h2>
            <ul className="space-y-2 text-slate-400 list-disc list-inside">
              <li>Parent account details, including name and email address</li>
              <li>Parent contact details such as phone number where provided</li>
              <li>Consent records and consent history</li>
              <li>Billing and subscription records required to manage paid plans</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-bold mb-3">What child data is collected</h2>
            <ul className="space-y-2 text-slate-400 list-disc list-inside">
              <li>Child profile details such as nickname and age range</li>
              <li>Learning progress data (accuracy, attempts, rewards, mastery)</li>
              <li>Session activity and performance history</li>
              <li>Optional voice interaction data used to power lesson features, when enabled</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-bold mb-3">What StarLiz does not collect</h2>
            <ul className="space-y-2 text-slate-400 list-disc list-inside">
              <li>Location, photos, private messages, or personal contact details from children</li>
              <li>No sale of parent or child personal data</li>
              <li>No child social networking profile requirements</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-bold mb-3">How learning data is used</h2>
            <ul className="space-y-2 text-slate-400 list-disc list-inside">
              <li>To personalise lesson flow, difficulty, and guidance</li>
              <li>To generate progress dashboards and reports for parents</li>
              <li>To identify strengths, weak areas, and recommended next steps</li>
              <li>To improve educational quality and platform reliability</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-bold mb-3">Voice and speech use</h2>
            <ul className="space-y-2 text-slate-400 list-disc list-inside">
              <li>Some lessons may use microphone input to support speaking activities</li>
              <li>Voice features are used for learning interactions and accuracy feedback</li>
              <li>Parents remain responsible for device permissions and supervision</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-bold mb-3">Payments and Stripe</h2>
            <ul className="space-y-2 text-slate-400 list-disc list-inside">
              <li>Payments are processed by Stripe using secure payment infrastructure</li>
              <li>StarLiz Academy does not store full card numbers or card security codes</li>
              <li>Billing records are retained for account, legal, and tax requirements</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-bold mb-3">Parent control and deletion rights</h2>
            <ul className="space-y-2 text-slate-400 list-disc list-inside">
              <li>Parents can review child learning data via parent and admin views</li>
              <li>Parents can request account and child profile deletion</li>
              <li>Parents can withdraw consent and stop future processing where applicable</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-bold mb-3">Data security</h2>
            <ul className="space-y-2 text-slate-400 list-disc list-inside">
              <li>Data is stored in secured systems with access controls</li>
              <li>Administrative access is permission-restricted and logged</li>
              <li>Security updates and monitoring are applied to protect user data</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-bold mb-3">Contact details</h2>
            <p className="text-slate-400">
              For privacy enquiries, contact us at{" "}
              <a href="mailto:support@starlizacademy.com" className="text-blue-400 hover:text-blue-300">
                support@starlizacademy.com
              </a>
            </p>
          </div>
        </div>
      </div>

      <footer className="border-t border-slate-800/80 px-6 py-8 text-center text-sm text-slate-500">
        <p>&#169; 2026 StarLiz Academy. All rights reserved.</p>
      </footer>
    </main>
  )
}
