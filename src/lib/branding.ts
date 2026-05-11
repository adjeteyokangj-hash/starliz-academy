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
  logoUrl: "/brand/starliz-logo.png",
  iconUrl: "/brand/starliz-logo.png",
  faviconUrl: "/brand/starliz-logo.png",
}

export function isBrandAssetUrl(value: string): boolean {
  return value.startsWith("/") || value.startsWith("data:image/")
}
