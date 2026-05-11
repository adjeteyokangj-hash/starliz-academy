import { NextResponse } from "next/server"
import { z } from "zod"
import { requireAdmin } from "@/lib/api_guard"
import { writeAuditLog } from "@/lib/audit"
import { defaultBranding, isBrandAssetUrl } from "@/lib/branding"
import { prisma } from "@/lib/db"

type BrandingSettingsRecord = {
  id: string
  siteName: string
  tagline: string
  logoUrl: string
  iconUrl: string
  faviconUrl: string
}

type BrandingSettingsDelegate = {
  findFirst: (args?: { orderBy?: { updatedAt: "desc" }; select?: { id: true } }) => Promise<BrandingSettingsRecord | { id: string } | null>
  update: (args: { where: { id: string }; data: Omit<BrandingSettingsRecord, "id"> }) => Promise<BrandingSettingsRecord>
  create: (args: { data: Omit<BrandingSettingsRecord, "id"> }) => Promise<BrandingSettingsRecord>
}

const brandingSchema = z.object({
  siteName: z.string().trim().min(1).max(80),
  tagline: z.string().trim().min(1).max(140),
  logoUrl: z.string().trim().min(1).refine(isBrandAssetUrl, "Use a local path or image data URL."),
  iconUrl: z.string().trim().min(1).refine(isBrandAssetUrl, "Use a local path or image data URL."),
  faviconUrl: z.string().trim().min(1).refine(isBrandAssetUrl, "Use a local path or image data URL."),
})

export async function GET() {
  const { session, response } = await requireAdmin()
  if (!session) return response

  const brandingSettings = (prisma as unknown as { brandingSettings?: BrandingSettingsDelegate }).brandingSettings
  if (!brandingSettings) {
    return NextResponse.json({ branding: defaultBranding })
  }

  const branding = await brandingSettings.findFirst({
    orderBy: { updatedAt: "desc" },
  })

  return NextResponse.json({ branding: branding ?? defaultBranding })
}

export async function PUT(request: Request) {
  const { session, response } = await requireAdmin()
  if (!session) return response

  const brandingSettings = (prisma as unknown as { brandingSettings?: BrandingSettingsDelegate }).brandingSettings
  if (!brandingSettings) {
    return NextResponse.json({ error: "Branding storage is unavailable in this environment." }, { status: 503 })
  }

  try {
    const body = brandingSchema.parse(await request.json())
    const existing = await brandingSettings.findFirst({ select: { id: true } }) as { id: string } | null
    const branding = existing
      ? await brandingSettings.update({ where: { id: existing.id }, data: body })
      : await brandingSettings.create({ data: body })

    await writeAuditLog({
      actorUserId: session.userId,
      action: "branding.updated",
      entityType: "BrandingSettings",
      entityId: branding.id,
      metadata: { siteName: branding.siteName },
    })

    return NextResponse.json({ branding })
  } catch {
    return NextResponse.json({ error: "Invalid branding settings." }, { status: 400 })
  }
}
