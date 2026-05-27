export type BrandingSettingsPayload = {
  siteName: string
  tagline: string
  logoUrl: string
  iconUrl: string
  faviconUrl: string
}

export const defaultBranding: BrandingSettingsPayload = {
  siteName: "StarLiz Academy",
  tagline: "Learn • Grow • Shine",
  logoUrl: "/logo-full.svg",
  iconUrl: "/logo-icon.svg",
  faviconUrl: "/favicon.svg",
}

export function isBrandAssetUrl(value: string): boolean {
  return value.startsWith("/") || value.startsWith("data:image/")
}
