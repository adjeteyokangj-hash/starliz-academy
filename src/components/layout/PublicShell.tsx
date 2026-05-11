import Link from "next/link"
import Logo from "@/components/Logo"

type PublicShellProps = {
  children: React.ReactNode
}

export default function PublicShell({ children }: PublicShellProps) {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-slate-800 px-6 py-5">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <Logo variant="wordmark" size={32} />

          <nav className="hidden items-center gap-6 text-sm text-slate-300 md:flex">
            <Link href="/about" className="hover:text-white">
              About
            </Link>
            <Link href="/pricing" className="hover:text-white">
              Pricing
            </Link>
            <Link href="/contact" className="hover:text-white">
              Contact
            </Link>
            <Link href="/login" className="hover:text-white">
              Login
            </Link>
          </nav>

          <Link
            href="/signup"
            className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold hover:bg-blue-500"
          >
            Start Free Trial
          </Link>
        </div>
      </header>

      {children}

      <footer className="border-t border-slate-800/80 px-6 py-8 text-center text-sm text-slate-500">
        <Logo variant="full" size={28} className="justify-center" />
        <p className="mt-4">© 2026 StarLiz Academy. All rights reserved.</p>
      </footer>
    </main>
  )
}
