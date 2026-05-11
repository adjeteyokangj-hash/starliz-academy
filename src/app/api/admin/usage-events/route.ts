import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api_guard"
import { resolveParentScope } from "@/lib/parent_scope"

export async function POST(request: Request) {
  const { session, response } = await requireSession()
  if (!session) return response

  const body = await request.json().catch(() => null)
  const parentScope = await resolveParentScope(session)

  console.log("[StarLiz usage event]", {
    ...body,
    userId: session.userId,
    email: session.email,
    parentId: parentScope?.parentId ?? null,
    createdAt: new Date().toISOString(),
  })

  return NextResponse.json({ ok: true })
}