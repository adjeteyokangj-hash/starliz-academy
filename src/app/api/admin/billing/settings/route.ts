import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/api_guard"
import {
  isProviderAvailableForCountry,
  resolveCurrencyForCountry,
  resolvePaymentProvider,
} from "@/lib/billing/payment-routing"
import { PUBLIC_COUNTRY_PROFILES } from "@/lib/public-country-profiles"

export async function GET() {
  const { session, response } = await requireAdmin()
  if (!session) return response

  const countries = [PUBLIC_COUNTRY_PROFILES.uk, PUBLIC_COUNTRY_PROFILES.ghana, PUBLIC_COUNTRY_PROFILES.nigeria].map((profile) => {
    const defaultProvider = resolvePaymentProvider(profile.countryCode)
    return {
      country: profile.countryName,
      countryCode: profile.countryCode,
      route: profile.route,
      status: profile.status,
      currency: resolveCurrencyForCountry(profile.countryCode),
      defaultProvider,
      activeProvider: defaultProvider,
      providerStatus: {
        revolut: isProviderAvailableForCountry("revolut", profile.countryCode),
        paystack: isProviderAvailableForCountry("paystack", profile.countryCode),
        stripe: isProviderAvailableForCountry("stripe", profile.countryCode),
        manual: isProviderAvailableForCountry("manual", profile.countryCode),
      },
      paymentStatus: profile.paymentStatus,
      testMode: process.env.NODE_ENV !== "production",
      webhookStatus: {
        revolut: Boolean(process.env.REVOLUT_WEBHOOK_SECRET),
        paystack: Boolean(process.env.PAYSTACK_WEBHOOK_SECRET),
        stripe: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      },
    }
  })

  return NextResponse.json({
    billingDefaultProvider: process.env.BILLING_DEFAULT_PROVIDER ?? "revolut",
    billingFlags: {
      revolut: process.env.BILLING_ENABLE_REVOLUT ?? "true",
      paystack: process.env.BILLING_ENABLE_PAYSTACK ?? "true",
      stripe: process.env.BILLING_ENABLE_STRIPE ?? "false",
      manual: process.env.BILLING_ENABLE_MANUAL ?? "true",
    },
    countries,
    notes: {
      stripe: "Stripe remains available in code and inactive by default.",
      uk: "Revolut is active default for UK.",
      ghana: "Paystack is active default for Ghana.",
      nigeria: "Nigeria is prepared for Paystack and remains coming soon.",
    },
  })
}
