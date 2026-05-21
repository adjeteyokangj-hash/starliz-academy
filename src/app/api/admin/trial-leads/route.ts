import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAdmin } from "@/lib/api_guard"
import { parseSubjectUsage } from "@/lib/trial-server"

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
