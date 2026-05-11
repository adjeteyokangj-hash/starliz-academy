import { NextResponse } from "next/server"
import { defaultBranding } from "@/lib/branding"
import { prisma } from "@/lib/db"

type BrandingSettingsDelegate = {
  findFirst: (args: {
    orderBy: { updatedAt: "desc" }
    select: {
      siteName: true
      tagline: true
      logoUrl: true
      iconUrl: true
      faviconUrl: true
    }
  }) => Promise<{
    siteName: string
    tagline: string
    logoUrl: string
    iconUrl: string
    faviconUrl: string
  } | null>
}

export async function GET() {
  const brandingSettings = (prisma as unknown as { brandingSettings?: BrandingSettingsDelegate }).brandingSettings
  if (!brandingSettings) {
    return NextResponse.json({ branding: defaultBranding })
  }

  const branding = await brandingSettings.findFirst({
    orderBy: { updatedAt: "desc" },
    select: {
      siteName: true,
      tagline: true,
      logoUrl: true,
      iconUrl: true,
      faviconUrl: true,
    },
  })

  return NextResponse.json({ branding: branding ?? defaultBranding })
}
