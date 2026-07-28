import Link from "next/link"
import Logo from "@/components/Logo"
import PublicMiniFooter from "@/components/public/PublicMiniFooter"
import { PUBLIC_COUNTRY_PROFILES } from "@/lib/public-country-profiles"

const countryCards = [
  {
    code: "uk",
    heading: "United Kingdom",
    status: "Available now",
    cta: "Continue to UK site",
    href: PUBLIC_COUNTRY_PROFILES.uk.route,
    className: "border-blue-300/40 bg-blue-500/10",
  },
  {
    code: "ghana",
    heading: "Ghana",
    status: "Coming soon",
    cta: "View Ghana preview",
    href: PUBLIC_COUNTRY_PROFILES.ghana.route,
    className: "border-emerald-300/40 bg-emerald-500/10",
  },
  {
    code: "nigeria",
    heading: "Nigeria",
    status: "Coming soon",
    cta: "View Nigeria preview",
    href: PUBLIC_COUNTRY_PROFILES.nigeria.route,
    className: "border-lime-300/40 bg-lime-500/10",
  },
] as const

export default function CountrySelectionPage() {
  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <section className="relative overflow-hidden px-6 py-14 sm:py-20">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_10%,rgba(59,130,246,0.2),transparent_40%),radial-gradient(circle_at_90%_20%,rgba(16,185,129,0.17),transparent_45%),radial-gradient(circle_at_55%_90%,rgba(14,165,233,0.16),transparent_50%)]" />
        <div className="relative mx-auto max-w-6xl">
          <div className="mx-auto max-w-3xl text-center">
            <div className="inline-flex justify-center">
              <Logo variant="full" size={30} className="justify-center" />
            </div>
            <h1 className="mt-6 text-3xl font-black tracking-tight sm:text-5xl">Welcome to StarLiz Academy</h1>
            <p className="mx-auto mt-4 max-w-2xl text-base text-slate-300 sm:text-lg">Choose your country to continue.</p>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {countryCards.map((country) => (
              <article key={country.code} className={`rounded-3xl border p-6 ${country.className}`}>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-300">{country.status}</p>
                <h2 className="mt-3 text-2xl font-black">{country.heading}</h2>
                <p className="mt-3 text-sm text-slate-300">
                  {PUBLIC_COUNTRY_PROFILES[country.code].curriculumLabel}
                </p>
                <p className="mt-2 text-sm text-slate-400">{PUBLIC_COUNTRY_PROFILES[country.code].examPathways}</p>
                <Link
                  href={country.href}
                  className="mt-6 inline-flex rounded-xl bg-white px-4 py-2.5 text-sm font-black text-slate-900 transition hover:bg-slate-100"
                >
                  {country.cta}
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <PublicMiniFooter className="border-t border-slate-800/80" />
    </main>
  )
}
