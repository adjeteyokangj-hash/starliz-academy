import Stripe from "stripe";
import { getPaymentApiKey } from "@/lib/api-key-config";

const STRIPE_API_VERSION = "2026-04-22.dahlia" as const;

let cachedSecret: string | null = null;
let cachedClient: Stripe | null = null;

export async function getStripeClient(): Promise<Stripe | null> {
  const secret = await getPaymentApiKey();
  if (!secret) {
    return null;
  }

  if (cachedClient && cachedSecret === secret) {
    return cachedClient;
  }

  cachedSecret = secret;
  cachedClient = new Stripe(secret, { apiVersion: STRIPE_API_VERSION });
  return cachedClient;
}
