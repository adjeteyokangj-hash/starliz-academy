import { getPublicCountryProfile, normalizePublicCountryCode } from "@/lib/public-country-profiles"

export type BillingProvider = "revolut" | "paystack" | "stripe" | "manual"

type BillingRegion = {
  countryCode: "UK" | "GH" | "NG" | "UNSUPPORTED"
  countryKey: "uk" | "ghana" | "nigeria" | "unsupported"
  countryName: string
  status: "live" | "coming_soon" | "unsupported"
}

function envFlag(name: string, defaultValue: boolean): boolean {
  const raw = (process.env[name] ?? "").trim().toLowerCase()
  if (!raw) return defaultValue
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on"
}

const PROVIDER_FLAGS: Record<BillingProvider, boolean> = {
  revolut: envFlag("BILLING_ENABLE_REVOLUT", true),
  paystack: envFlag("BILLING_ENABLE_PAYSTACK", true),
  stripe: envFlag("BILLING_ENABLE_STRIPE", false),
  manual: envFlag("BILLING_ENABLE_MANUAL", true),
}

export function resolveBillingRegion(countryCodeOrName: string | null | undefined): BillingRegion {
  const normalized = normalizePublicCountryCode(countryCodeOrName)
  if (!normalized) {
    return {
      countryCode: "UNSUPPORTED",
      countryKey: "unsupported",
      countryName: "Unsupported region",
      status: "unsupported",
    }
  }

  const profile = getPublicCountryProfile(normalized)
  if (profile.countryCode === "uk") {
    return { countryCode: "UK", countryKey: "uk", countryName: profile.countryName, status: profile.status }
  }
  if (profile.countryCode === "ghana") {
    return { countryCode: "GH", countryKey: "ghana", countryName: profile.countryName, status: profile.status }
  }
  return { countryCode: "NG", countryKey: "nigeria", countryName: profile.countryName, status: profile.status }
}

export function resolveCurrencyForCountry(countryCodeOrName: string | null | undefined): "GBP" | "GHS" | "NGN" {
  const region = resolveBillingRegion(countryCodeOrName)
  if (region.countryCode === "GH") return "GHS"
  if (region.countryCode === "NG") return "NGN"
  return "GBP"
}

export function resolvePaymentProvider(countryCodeOrName: string | null | undefined): BillingProvider {
  const region = resolveBillingRegion(countryCodeOrName)

  if (region.countryCode === "UK") return "revolut"
  if (region.countryCode === "GH") return "paystack"
  if (region.countryCode === "NG") return "paystack"
  return "manual"
}

export function isProviderAvailableForCountry(provider: BillingProvider, countryCodeOrName: string | null | undefined): boolean {
  if (!PROVIDER_FLAGS[provider]) return false

  const region = resolveBillingRegion(countryCodeOrName)
  if (region.status === "unsupported") {
    return provider === "manual"
  }

  if (region.status === "coming_soon") {
    return provider === "manual"
  }

  if (region.countryCode === "UK") {
    return provider === "revolut" || provider === "stripe" || provider === "manual"
  }

  if (region.countryCode === "GH") {
    return provider === "paystack" || provider === "manual"
  }

  if (region.countryCode === "NG") {
    return provider === "paystack" || provider === "manual"
  }

  return provider === "manual"
}

export function getPaymentAvailabilityMessage(countryCodeOrName: string | null | undefined): string {
  const region = resolveBillingRegion(countryCodeOrName)
  if (region.status !== "live") {
    return "StarLiz Academy is not yet accepting payments in this country. Please check back soon."
  }
  return "Payments are available for this country."
}

export function resolvePreferredProviderWithFallback(countryCodeOrName: string | null | undefined): BillingProvider {
  const preferred = resolvePaymentProvider(countryCodeOrName)
  if (isProviderAvailableForCountry(preferred, countryCodeOrName)) return preferred

  const fallbackOrder: BillingProvider[] = ["manual", "stripe", "revolut", "paystack"]
  for (const provider of fallbackOrder) {
    if (isProviderAvailableForCountry(provider, countryCodeOrName)) {
      return provider
    }
  }
  return "manual"
}
