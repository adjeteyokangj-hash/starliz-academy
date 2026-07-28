import Link from "next/link"

type PublicMiniFooterProps = {
  tone?: "dark" | "light"
  className?: string
}

const legalLinks = [
  { href: "/privacy", label: "Privacy notice" },
  { href: "/terms", label: "Terms of service" },
  { href: "/cookies", label: "Cookie policy" },
  { href: "/contact", label: "Contact us" },
]

export default function PublicMiniFooter({ tone = "dark", className = "" }: PublicMiniFooterProps) {
  const textClass = tone === "dark" ? "text-slate-400" : "text-slate-600"
  const hoverClass = tone === "dark" ? "hover:text-white" : "hover:text-slate-900"

  return (
    <footer className={`px-4 py-6 text-center text-xs ${textClass} ${className}`}>
      <nav aria-label="Legal" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        {legalLinks.map((link) => (
          <Link key={link.href} href={link.href} className={hoverClass}>
            {link.label}
          </Link>
        ))}
      </nav>
      <p className="mt-3">© 2026 StarLiz Academy. All rights reserved.</p>
    </footer>
  )
}
