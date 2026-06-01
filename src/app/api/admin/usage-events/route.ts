import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/api_guard"

export async function POST(request: Request) {
  const { session, response } = await requireAdmin()
  if (!session) return response

  const body = await request.json().catch(() => null)

  console.log("[StarLiz usage event]", {
    ...body,
    userId: session.userId,
    email: session.email,
    createdAt: new Date().toISOString(),
  })

  return NextResponse.json({ ok: true })
}