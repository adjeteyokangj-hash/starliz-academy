import Link from "next/link"
import Logo from "@/components/Logo"

type PublicShellProps = {
  children: React.ReactNode
}

export default function PublicShell({ children }: PublicShellProps) {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-slate-800">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-8">
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
            className="hidden rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold hover:bg-blue-500 sm:inline-flex"
          >
            Start Free Trial
          </Link>

          <details className="relative sm:hidden">
            <summary className="cursor-pointer rounded-xl border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200">
              Menu
            </summary>
            <div className="absolute right-0 z-20 mt-2 w-52 rounded-xl border border-slate-700 bg-slate-900/95 p-2 shadow-2xl">
              <Link href="/about" className="block rounded-lg px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">About</Link>
              <Link href="/pricing" className="block rounded-lg px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">Pricing</Link>
              <Link href="/contact" className="block rounded-lg px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">Contact</Link>
              <Link href="/login" className="block rounded-lg px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">Login</Link>
              <Link href="/signup" className="mt-1 block rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500">Start Free Trial</Link>
            </div>
          </details>
        </div>
      </header>

      {children}

      <footer className="border-t border-slate-800/80 px-4 py-8 text-center text-sm text-slate-500 sm:px-6 lg:px-8">
        <Logo variant="full" size={28} className="justify-center" />
        <p className="mt-4">© 2026 StarLiz Academy. All rights reserved.</p>
      </footer>
    </main>
  )
}
