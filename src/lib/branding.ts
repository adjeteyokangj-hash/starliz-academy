export type BrandingSettingsPayload = {
  siteName: string
  tagline: string
  logoUrl: string
  iconUrl: string
  faviconUrl: string
}

export const CANONICAL_LOGO_URL = "/brand/starliz-logo.png"
export const CANONICAL_FAVICON_URL = "/favicon.png"

const DISALLOWED_BRAND_SVGS = new Set([
  "/logo-full.svg",
  "/logo-icon.svg",
  "/logo-transparent.svg",
  "/favicon.svg",
])

export const defaultBranding: BrandingSettingsPayload = {
  siteName: "StarLiz Academy",
  tagline: "Learn • Grow • Shine",
  logoUrl: CANONICAL_LOGO_URL,
  iconUrl: CANONICAL_LOGO_URL,
  faviconUrl: CANONICAL_FAVICON_URL,
}

export function normalizeBranding(branding?: Partial<BrandingSettingsPayload> | null): BrandingSettingsPayload {
  const siteName = branding?.siteName?.trim() || defaultBranding.siteName
  const tagline = branding?.tagline?.trim() || defaultBranding.tagline

  const requestedLogo = branding?.logoUrl?.trim() || ""
  const requestedIcon = branding?.iconUrl?.trim() || ""
  const requestedFavicon = branding?.faviconUrl?.trim() || ""

  const logoUrl = requestedLogo && !DISALLOWED_BRAND_SVGS.has(requestedLogo)
    ? requestedLogo
    : CANONICAL_LOGO_URL

  const iconUrl = requestedIcon && !DISALLOWED_BRAND_SVGS.has(requestedIcon)
    ? requestedIcon
    : CANONICAL_LOGO_URL

  const faviconUrl = requestedFavicon && !DISALLOWED_BRAND_SVGS.has(requestedFavicon)
    ? requestedFavicon
    : CANONICAL_FAVICON_URL

  return {
    siteName,
    tagline,
    logoUrl,
    iconUrl,
    faviconUrl,
  }
}

export function isBrandAssetUrl(value: string): boolean {
  return value.startsWith("/") || value.startsWith("data:image/")
}
