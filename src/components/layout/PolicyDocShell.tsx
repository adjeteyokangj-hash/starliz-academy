import Link from "next/link"
import type { ReactNode } from "react"

const LOGIN_HREF = "/auth/login"

type PolicyDocShellProps = {
  children: ReactNode
}

export default function PolicyDocShell({ children }: PolicyDocShellProps) {
  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <header className="border-b border-slate-800/80 px-6 py-4">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <Link
            href="/"
            className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-xl font-black tracking-tight text-transparent"
          >
            StarLiz Academy
          </Link>

          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-400">
            <Link href="/policies" className="hover:text-white">
              Policies
            </Link>
            <Link href="/faq" className="hover:text-white">
              FAQ
            </Link>
            <Link href="/knowledge-centre" className="hover:text-white">
              Knowledge Centre
            </Link>
            <Link href={LOGIN_HREF} className="font-semibold text-blue-400 hover:text-blue-300">
              Login
            </Link>
          </nav>
        </div>
      </header>

      {children}

      <footer className="border-t border-slate-800/80 px-6 py-8 text-center text-sm text-slate-500">
        <nav className="mb-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-slate-400">
          <Link href="/policies" className="hover:text-white">
            Policies
          </Link>
          <Link href="/faq" className="hover:text-white">
            FAQ
          </Link>
          <Link href="/knowledge-centre" className="hover:text-white">
            Knowledge Centre
          </Link>
          <Link href="/privacy" className="hover:text-white">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-white">
            Terms
          </Link>
        </nav>
        <p>&copy; 2026 StarLiz Academy. All rights reserved.</p>
      </footer>
    </main>
  )
}
