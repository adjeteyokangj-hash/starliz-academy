import Link from "next/link"
import Logo from "@/components/Logo"
import { getPublicCountryProfile } from "@/lib/public-country-profiles"
import CountryPreferenceSync from "@/components/public/CountryPreferenceSync"

export default function NigeriaPage() {
  const country = getPublicCountryProfile("nigeria")

  return (
    <main className="min-h-screen bg-[#062218] text-white">
      <CountryPreferenceSync countryCode="nigeria" />
      <section className="relative overflow-hidden px-6 py-16 sm:py-24">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(16,185,129,0.28),transparent_40%),radial-gradient(circle_at_88%_14%,rgba(34,197,94,0.22),transparent_45%),radial-gradient(circle_at_72%_80%,rgba(15,23,42,0.35),transparent_50%)]" />
        <div className="relative mx-auto max-w-4xl rounded-3xl border border-white/20 bg-black/25 p-8 shadow-2xl backdrop-blur-md sm:p-12">
          <Logo variant="full" size={26} className="mb-6" />
          <p className="inline-flex rounded-full border border-emerald-200/40 bg-emerald-200/10 px-4 py-1 text-xs font-bold uppercase tracking-[0.16em] text-emerald-100">
            Nigeria Preview
          </p>
          <h1 className="mt-5 text-3xl font-black leading-tight sm:text-5xl">{country.comingSoonTitle}</h1>
          <p className="mt-4 max-w-3xl text-base leading-8 text-slate-200">{country.comingSoonMessage}</p>
          <p className="mt-4 rounded-2xl border border-emerald-300/30 bg-emerald-200/10 p-4 text-sm font-semibold text-emerald-100">
            {country.comingSoonPaymentMessage}
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/" className="rounded-xl bg-white px-5 py-3 text-sm font-black text-slate-900 transition hover:bg-slate-100">
              Back to country selection
            </Link>
            <Link href="/contact" className="rounded-xl border border-white/40 px-5 py-3 text-sm font-black text-white transition hover:bg-white/10">
              Contact us
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
