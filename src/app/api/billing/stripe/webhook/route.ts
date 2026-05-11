import { NextResponse } from "next/server"
import { handlePaymentWebhook } from "@/lib/subscriptions/webhook-handler"
import { getStripeClient } from "@/lib/stripe"

export async function POST(request: Request) {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Stripe webhook is not configured" }, { status: 503 })
  }

  const signature = request.headers.get("stripe-signature")

  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature" }, { status: 400 })
  }

  const rawBody = await request.text()

  try {
    const stripe = await getStripeClient()
    if (!stripe) {
      return NextResponse.json({ error: "Stripe is not configured" }, { status: 503 })
    }

    const event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET,
    )

    const result = await handlePaymentWebhook(event as unknown as Parameters<typeof handlePaymentWebhook>[0])
    return NextResponse.json({ received: true, result })
  } catch {
    return NextResponse.json({ error: "Invalid Stripe webhook" }, { status: 400 })
  }
}
