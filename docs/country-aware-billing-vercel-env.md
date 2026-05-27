# Country-Aware Billing Environment Setup

This project now supports country-aware billing routing with provider defaults:

- UK: Revolut (default)
- Ghana: Paystack (default)
- Nigeria: prepared for Paystack later (coming soon)
- Stripe: available in code, inactive by default
- Manual: enabled for fallback/admin review

## Required Server Environment Variables

Set these in Vercel for `Production`, `Preview`, and `Development` as needed.

```env
BILLING_DEFAULT_PROVIDER=revolut
BILLING_ENABLE_REVOLUT=true
BILLING_ENABLE_PAYSTACK=true
BILLING_ENABLE_STRIPE=false
BILLING_ENABLE_MANUAL=true

REVOLUT_MERCHANT_API_KEY=
REVOLUT_WEBHOOK_SECRET=
REVOLUT_API_BASE_URL=https://merchant.revolut.com/api
REVOLUT_ENVIRONMENT=sandbox

PAYSTACK_SECRET_KEY=
PAYSTACK_PUBLIC_KEY=
PAYSTACK_WEBHOOK_SECRET=
PAYSTACK_ENVIRONMENT=live

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PUBLISHABLE_KEY=
```

## Deployment Notes

- Keep all secret keys in server-side environment variables only.
- Do not expose provider secret keys in client bundles or public API payloads.
- UK billing routes to Revolut by default.
- Ghana billing routes to Paystack by default.
- Nigeria is prepared but still coming soon for public checkout.
- Stripe remains disabled by default unless intentionally enabled.
- Configure webhook endpoints only after your deployment URL is live.
- Ghana Mobile Money recurring may require one-off renewal fallback where recurring is unsupported.
