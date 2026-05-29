import { NextResponse } from "next/server"
import { processRevolutWebhookRequest } from "@/lib/subscriptions/webhook-entry"

export async function POST(request: Request) {
  if (!process.env.REVOLUT_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Revolut webhook is not configured" }, { status: 503 })
  }

  return processRevolutWebhookRequest(request)
}