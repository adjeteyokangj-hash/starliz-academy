import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requireAdmin } from "@/lib/api_guard"
import { parseSubjectUsage } from "@/lib/trial-server"

const resetSchema = z.object({
  trialId: z.string().min(1),
  email: z.string().email().optional(),
})

function parseActivity(value: string | null) {
  if (!value) return { subject: null as string | null, keyStage: null as string | null }
  const [subject, keyStage] = value.split(":")
  return {
    subject: subject ?? null,
    keyStage: keyStage === "ey" || keyStage === "ks1" || keyStage === "ks2" ? keyStage : null,
  }
}

export async function GET() {
  const { session, response } = await requireAdmin()
  if (!session) return response!

  try {
    const leads = await prisma.trialAccount.findMany({
      select: {
        id: true,
        email: true,
        activitiesRemaining: true,
        activitiesCompleted: true,
        trialStartedAt: true,
        trialExpiresAt: true,
        lastActiveAt: true,
        lastActivity: true,
        subjectUsageJson: true,
        convertedToAccount: true,
        emailConsent: true,
      },
      orderBy: [{ lastActiveAt: "desc" }, { createdAt: "desc" }],
    })

    const enriched = leads.map((lead) => {
      const usage = parseSubjectUsage(lead.subjectUsageJson)
      const activity = parseActivity(lead.lastActivity)
      return {
        id: lead.id,
        email: lead.email,
        activitiesRemaining: lead.activitiesRemaining,
        activitiesCompleted: lead.activitiesCompleted,
        trialStartedAt: lead.trialStartedAt,
        trialExpiresAt: lead.trialExpiresAt,
        lastActiveAt: lead.lastActiveAt,
        lastSubject: activity.subject,
        lastKeyStage: activity.keyStage,
        activityHistory: {
          spelling: usage.spelling,
          reading: usage.reading,
          maths: usage.maths,
        },
        convertedToAccount: lead.convertedToAccount,
        emailConsent: lead.emailConsent,
      }
    })

    return NextResponse.json({ leads: enriched }, { status: 200 })
  } catch {
    return NextResponse.json({ error: "Unable to load trial leads." }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const { session, response } = await requireAdmin()
  if (!session) return response!

  try {
    const parsed = resetSchema.parse(await request.json())

    const existing = await prisma.trialAccount.findUnique({
      where: { id: parsed.trialId },
      select: { id: true, email: true },
    })

    if (!existing) {
      return NextResponse.json({ error: "Trial lead not found." }, { status: 404 })
    }

    if (parsed.email && existing.email.toLowerCase() !== parsed.email.toLowerCase()) {
      return NextResponse.json({ error: "Trial lead email mismatch." }, { status: 409 })
    }

    await prisma.trialAccount.delete({ where: { id: existing.id } })

    return NextResponse.json(
      {
        ok: true,
        message: `Trial reset for ${existing.email}`,
      },
      { status: 200 },
    )
  } catch {
    return NextResponse.json({ error: "Unable to reset trial lead." }, { status: 400 })
  }
}
