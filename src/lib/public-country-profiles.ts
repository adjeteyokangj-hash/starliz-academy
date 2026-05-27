export type PublicCountryStatus = "live" | "coming_soon"

export type PublicCountryCode = "uk" | "ghana" | "nigeria"

export type PublicCountryProfile = {
  countryCode: PublicCountryCode
  countryName: string
  route: "/uk" | "/ghana" | "/nigeria"
  status: PublicCountryStatus
  currency: "GBP" | "GHS" | "NGN"
  paymentProvider: "existing" | "revolut" | "paystack" | "manual"
  paymentStatus: "live" | "coming_soon"
  pricingEnabled: boolean
  registrationEnabled: boolean
  checkoutEnabled: boolean
  curriculumLabel: string
  examPathways: string
  yearGroups: string[]
  homepageHeroTitle: string
  homepageHeroSubtitle: string
  comingSoonTitle: string
  comingSoonMessage: string
  comingSoonPaymentMessage: string
}

const GHANA_YEAR_GROUPS = [
  "Class 1",
  "Class 2",
  "Class 3",
  "Class 4",
  "Class 5",
  "Class 6",
  "JHS 1",
  "JHS 2",
  "JHS 3",
  "SHS 1 / SS1",
  "SHS 2 / SS2",
  "SHS 3 / SS3",
]

export const PUBLIC_COUNTRY_PROFILES: Record<PublicCountryCode, PublicCountryProfile> = {
  uk: {
    countryCode: "uk",
    countryName: "United Kingdom",
    route: "/uk",
    status: "live",
    currency: "GBP",
    paymentProvider: "existing",
    paymentStatus: "live",
    pricingEnabled: true,
    registrationEnabled: true,
    checkoutEnabled: true,
    curriculumLabel: "UK National Curriculum",
    examPathways: "KS1, KS2, KS3, GCSE",
    yearGroups: ["Reception", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5", "Year 6", "Year 7", "Year 8", "Year 9", "Year 10", "Year 11"],
    homepageHeroTitle: "AI-supported learning for children across UK pathways",
    homepageHeroSubtitle: "Reception to GCSE pathway aligned support with parent visibility and secure oversight.",
    comingSoonTitle: "UK site is live",
    comingSoonMessage: "StarLiz Academy United Kingdom is available now.",
    comingSoonPaymentMessage: "UK payments are available now.",
  },
  ghana: {
    countryCode: "ghana",
    countryName: "Ghana",
    route: "/ghana",
    status: "coming_soon",
    currency: "GHS",
    paymentProvider: "paystack",
    paymentStatus: "coming_soon",
    pricingEnabled: false,
    registrationEnabled: false,
    checkoutEnabled: false,
    curriculumLabel: "Ghana curriculum-aligned learning",
    examPathways: "BECE and SHS pathway support coming soon",
    yearGroups: GHANA_YEAR_GROUPS,
    homepageHeroTitle: "StarLiz Academy Ghana is coming soon",
    homepageHeroSubtitle: "Preparing Ghana curriculum-aligned learning from Class 1 to SHS 3.",
    comingSoonTitle: "StarLiz Academy Ghana is coming soon",
    comingSoonMessage: "StarLiz Academy Ghana is coming soon. We are preparing Ghana curriculum-aligned learning for learners from Class 1 to SHS 3, including BECE and SHS pathway support.",
    comingSoonPaymentMessage: "StarLiz Academy Ghana is not yet accepting payments. Ghana plans will launch soon.",
  },
  nigeria: {
    countryCode: "nigeria",
    countryName: "Nigeria",
    route: "/nigeria",
    status: "coming_soon",
    currency: "NGN",
    paymentProvider: "paystack",
    paymentStatus: "coming_soon",
    pricingEnabled: false,
    registrationEnabled: false,
    checkoutEnabled: false,
    curriculumLabel: "Nigerian curriculum-aligned learning",
    examPathways: "WAEC, NECO, and JAMB pathway support coming soon",
    yearGroups: ["Primary", "Junior Secondary", "Senior Secondary"],
    homepageHeroTitle: "StarLiz Academy Nigeria is coming soon",
    homepageHeroSubtitle: "Preparing Nigerian curriculum-aligned learning for major exam pathways.",
    comingSoonTitle: "StarLiz Academy Nigeria is coming soon",
    comingSoonMessage: "StarLiz Academy Nigeria is coming soon. We are preparing Nigerian curriculum-aligned learning, including WAEC, NECO, and JAMB pathway support.",
    comingSoonPaymentMessage: "StarLiz Academy Nigeria is not yet accepting payments. Nigeria plans will launch soon.",
  },
}

const COUNTRY_ALIASES: Record<string, PublicCountryCode> = {
  uk: "uk",
  gb: "uk",
  "united kingdom": "uk",
  britain: "uk",
  england: "uk",
  gh: "ghana",
  gha: "ghana",
  ghana: "ghana",
  ng: "nigeria",
  nga: "nigeria",
  nigeria: "nigeria",
}

export function normalizePublicCountryCode(input: string | null | undefined): PublicCountryCode | null {
  if (!input) return null
  const normalized = input.trim().toLowerCase()
  if (!normalized) return null
  return COUNTRY_ALIASES[normalized] ?? null
}

export function getPublicCountryProfile(input: string | null | undefined): PublicCountryProfile {
  const code = normalizePublicCountryCode(input) ?? "uk"
  return PUBLIC_COUNTRY_PROFILES[code]
}

export function getCountryFromPathname(pathname: string): PublicCountryCode | null {
  if (pathname.startsWith("/uk")) return "uk"
  if (pathname.startsWith("/ghana")) return "ghana"
  if (pathname.startsWith("/nigeria")) return "nigeria"
  return null
}

export function isCountryLive(input: string | null | undefined): boolean {
  return getPublicCountryProfile(input).status === "live"
}
