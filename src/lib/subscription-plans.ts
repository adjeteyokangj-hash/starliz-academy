export const SUBSCRIPTION_PLANS = {
  starter: {
    name: "Starter",
    price: 499,
    currency: "gbp",
    interval: "month",
    childLimit: 1,
  },
  family: {
    name: "Family",
    price: 999,
    currency: "gbp",
    interval: "month",
    childLimit: 3,
  },
  premium: {
    name: "Premium",
    price: 1499,
    currency: "gbp",
    interval: "month",
    childLimit: 6,
  },
  premium_yearly: {
    name: "Premium Annual",
    price: 4900,
    currency: "gbp",
    interval: "year",
    childLimit: 6,
  },
} as const

export type SubscriptionPlanKey = keyof typeof SUBSCRIPTION_PLANS

export const PAYMENT_PROVIDERS = {
  stripe: {
    name: "Stripe",
    active: true,
    launchMarket: "UK",
  },
  paystack: {
    name: "Paystack",
    active: false,
    launchMarket: "Ghana / Africa",
  },
} as const
