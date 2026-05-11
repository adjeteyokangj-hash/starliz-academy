import Link from "next/link"

export default function Terms() {
  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <header className="border-b border-slate-800/80 px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Link href="/" className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-xl font-black text-transparent tracking-tight">
            StarLiz Academy
          </Link>
          <Link href="/signup" className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold hover:bg-blue-500">
            Start Free Trial
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-20">
        <h1 className="text-4xl font-black mb-6">Terms of Use</h1>
        <p className="text-sm text-slate-500 mb-10">Last updated: May 2026</p>

        <div className="space-y-8 text-slate-400 leading-8">
          <div>
            <h2 className="text-xl font-bold text-white mb-3">Accounts</h2>
            <p>Parents are responsible for managing accounts and keeping login credentials secure. You must be 18 or over to create an account.</p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-white mb-3">Subscriptions</h2>
            <p>Subscriptions renew automatically at the end of each billing period unless cancelled. You may cancel at any time via your account settings.</p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-white mb-3">Acceptable Use</h2>
            <p>StarLiz Academy is intended for educational use by children aged 5&ndash;10 under parental supervision. You must not misuse, copy or redistribute any content from the platform.</p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-white mb-3">Content</h2>
            <p>All educational content on StarLiz Academy is owned by or licensed to us. Unauthorised reproduction is not permitted.</p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-white mb-3">Limitation of Liability</h2>
            <p>StarLiz Academy provides educational support tools. We do not guarantee specific learning outcomes. The platform is provided on a best-effort basis.</p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-white mb-3">Contact</h2>
            <p>
              For questions about these terms, email{" "}
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
