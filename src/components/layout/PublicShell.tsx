import Link from "next/link"
import Logo from "@/components/Logo"
import CompanyIdentity from "@/components/public/CompanyIdentity"
import OkangGroupMark from "@/components/public/OkangGroupMark"
import { isPublicTrialCtaEnabled, isRoadmapPublicEnabled } from "@/lib/launch-scope"

type PublicShellProps = {
  children: React.ReactNode
}

const LOGIN_HREF = "/auth/login"

export default function PublicShell({ children }: PublicShellProps) {
  const showTrialCta = isPublicTrialCtaEnabled()
  const showRoadmap = isRoadmapPublicEnabled()

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-slate-800">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-8">
          <Logo variant="header" size={24} />

          <nav className="hidden items-center gap-6 text-sm text-slate-300 md:flex">
            <Link href="/features" className="hover:text-white">
              Features
            </Link>
            <Link href="/short-learning" className="hover:text-white">
              Short Learning
            </Link>
            <Link href="/about" className="hover:text-white">
              About
            </Link>
            <Link href="/pricing" className="hover:text-white">
              Pricing
            </Link>
            <Link href="/contact" className="hover:text-white">
              Contact
            </Link>
            <Link href="/" className="hover:text-white">
              Change country
            </Link>
            {showRoadmap ? (
              <Link href="/roadmap" className="hover:text-white">
                Roadmap
              </Link>
            ) : null}
            <Link href={LOGIN_HREF} className="hover:text-white">
              Login
            </Link>
          </nav>

          {showTrialCta ? (
            <Link
              href="/trial"
              className="hidden rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold hover:bg-blue-500 sm:inline-flex"
            >
              Start your child&apos;s learning journey
            </Link>
          ) : (
            <Link
              href="/signup"
              className="hidden rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold hover:bg-blue-500 sm:inline-flex"
            >
              Create account
            </Link>
          )}

          <details className="relative sm:hidden">
            <summary className="cursor-pointer rounded-xl border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200">
              Menu
            </summary>
            <div className="absolute right-0 z-20 mt-2 w-52 rounded-xl border border-slate-700 bg-slate-900/95 p-2 shadow-2xl">
              <Link href="/features" className="block rounded-lg px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">Features</Link>
              <Link href="/short-learning" className="block rounded-lg px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">Short Learning</Link>
              <Link href="/about" className="block rounded-lg px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">About</Link>
              <Link href="/pricing" className="block rounded-lg px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">Pricing</Link>
              <Link href="/contact" className="block rounded-lg px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">Contact</Link>
              <Link href="/" className="block rounded-lg px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">Change country</Link>
              {showRoadmap ? <Link href="/roadmap" className="block rounded-lg px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">Roadmap</Link> : null}
              <Link href={LOGIN_HREF} className="block rounded-lg px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">Login</Link>
              {showTrialCta ? (
                <Link href="/trial" className="mt-1 block rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500">Start your child&apos;s learning journey</Link>
              ) : (
                <Link href="/signup" className="mt-1 block rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500">Create account</Link>
              )}
            </div>
          </details>
        </div>
      </header>

      {children}

      <footer className="border-t border-slate-800/80 px-4 py-10 text-sm text-slate-500 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <Logo variant="footer" size={44} />
            <p className="mt-3 text-sm font-semibold text-slate-300">StarLiz Academy — Learn • Grow • Shine</p>
            <OkangGroupMark className="mt-4" />
          </div>

          <nav aria-labelledby="shell-footer-legal">
            <h2 id="shell-footer-legal" className="text-xs font-bold uppercase tracking-[0.14em] text-slate-300">Legal</h2>
            <ul className="mt-3 space-y-2 text-slate-400">
              <li><Link href="/privacy" className="hover:text-white">Privacy notice</Link></li>
              <li><Link href="/terms" className="hover:text-white">Terms of service</Link></li>
              <li><Link href="/cookies" className="hover:text-white">Cookie policy</Link></li>
              <li><Link href="/ai-use" className="hover:text-white">AI use</Link></li>
            </ul>
          </nav>

          <nav aria-labelledby="shell-footer-trust">
            <h2 id="shell-footer-trust" className="text-xs font-bold uppercase tracking-[0.14em] text-slate-300">Trust and safety</h2>
            <ul className="mt-3 space-y-2 text-slate-400">
              <li><Link href="/safeguarding-policy" className="hover:text-white">Safeguarding</Link></li>
              <li><Link href="/policies" className="hover:text-white">Policy centre</Link></li>
            </ul>
          </nav>

          <nav aria-labelledby="shell-footer-help">
            <h2 id="shell-footer-help" className="text-xs font-bold uppercase tracking-[0.14em] text-slate-300">Help</h2>
            <ul className="mt-3 space-y-2 text-slate-400">
              <li><Link href="/faq" className="hover:text-white">FAQ</Link></li>
              <li><Link href="/knowledge-centre" className="hover:text-white">Knowledge Centre</Link></li>
              <li><Link href="/contact" className="hover:text-white">Contact us</Link></li>
            </ul>
          </nav>
        </div>

        <div className="mx-auto mt-8 max-w-6xl border-t border-slate-800/80 pt-5">
          <CompanyIdentity compact />
          <p className="mt-3 text-xs text-slate-500">© 2026 StarLiz Academy. All rights reserved.</p>
        </div>
      </footer>
    </main>
  )
}
