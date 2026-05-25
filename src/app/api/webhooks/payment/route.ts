import { processPaymentWebhookRequest } from "@/lib/subscriptions/webhook-entry";

export async function POST(request: Request) {
  return processPaymentWebhookRequest(request, { allowFallbackSignature: true });
}
