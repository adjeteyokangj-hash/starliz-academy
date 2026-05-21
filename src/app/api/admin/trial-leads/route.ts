import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAdmin } from "@/lib/api_guard"

export async function GET() {
  const { session, response } = await requireAdmin()
  if (!session) return response!

  try {
    const leads = await prisma.trialAccount.findMany({
      select: {
        id: true,
        email: true,
        activitiesRemaining: true,
        trialStartedAt: true,
        trialExpiresAt: true,
        lastActiveAt: true,
        convertedToAccount: true,
        emailConsent: true,
      },
      orderBy: [{ lastActiveAt: "desc" }, { createdAt: "desc" }],
    })

    return NextResponse.json({ leads }, { status: 200 })
  } catch {
    return NextResponse.json({ error: "Unable to load trial leads." }, { status: 500 })
  }
}
