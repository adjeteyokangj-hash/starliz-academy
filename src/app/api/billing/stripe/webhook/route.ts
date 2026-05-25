import { NextResponse } from "next/server"
import { getStripeClient } from "@/lib/stripe"
import { processPaymentWebhookRequest } from "@/lib/subscriptions/webhook-entry"

export async function POST(request: Request) {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Stripe webhook is not configured" }, { status: 503 })
  }

  try {
    const stripe = await getStripeClient()
    if (!stripe) {
      return NextResponse.json({ error: "Stripe is not configured" }, { status: 503 })
    }
    void stripe
    return await processPaymentWebhookRequest(request, { allowFallbackSignature: false })
  } catch {
    return NextResponse.json({ error: "Invalid Stripe webhook" }, { status: 400 })
  }
}
