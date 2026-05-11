export type PricingInterval = "month" | "year" | "custom"

export type PricingAudience = "individual" | "family" | "school" | "organisation"

export type PricingPlanView = {
  id: string
  name: string
  description: string
  price: number
  currency: string
  interval: PricingInterval
  audience: PricingAudience
  features: string[]
  priceNote: string | null
  badge: string | null
  ctaLabel: string
  ctaHref: string
  stripePriceId: string | null
  isActive: boolean
  isPopular: boolean
  sortOrder: number
}

export const FALLBACK_PRICING_PLANS: PricingPlanView[] = [
  {
    id: "fallback-starter",
    name: "Starter",
    description: "Perfect for getting started with personalised daily practice.",
    price: 7.99,
    currency: "GBP",
    interval: "month",
    audience: "individual",
    features: [
      "AI adapts to your child daily",
      "Personalised learning path",
      "Voice-friendly spelling practice",
      "Parent progress insights",
    ],
    priceNote: null,
    badge: null,
    ctaLabel: "Start Free Trial",
    ctaHref: "/signup",
    stripePriceId: null,
    isActive: true,
    isPopular: false,
    sortOrder: 10,
  },
  {
    id: "fallback-pro",
    name: "Pro",
    description: "Our most popular plan for consistent home learning progress.",
    price: 9.99,
    currency: "GBP",
    interval: "month",
    audience: "family",
    features: [
      "AI adapts to your child daily",
      "Personalised learning path",
      "Unlimited sessions",
      "Parent progress insights",
    ],
    priceNote: null,
    badge: "Most Popular",
    ctaLabel: "Start Free Trial",
    ctaHref: "/signup",
    stripePriceId: null,
    isActive: true,
    isPopular: true,
    sortOrder: 20,
  },
  {
    id: "fallback-annual-family",
    name: "Annual Family",
    description: "Best value plan for families committed to long-term progress.",
    price: 79,
    currency: "GBP",
    interval: "year",
    audience: "family",
    features: [
      "Everything in Pro",
      "Family-friendly yearly savings",
      "Priority access to new learning features",
      "Best value for families",
    ],
    priceNote: "Less than £0.25 per day",
    badge: "Best Value",
    ctaLabel: "Start Free Trial",
    ctaHref: "/signup",
    stripePriceId: null,
    isActive: true,
    isPopular: false,
    sortOrder: 30,
  },
  {
    id: "fallback-school-custom",
    name: "Schools & Organisations",
    description: "Bring StarLiz Academy to your school, tutoring centre or learning organisation.",
    price: 0,
    currency: "GBP",
    interval: "custom",
    audience: "school",
    features: [
      "Multi-student management",
      "Teacher/admin dashboard",
      "Class progress tracking",
      "AI learning insights",
      "Safeguarding-focused access controls",
      "Custom onboarding support",
    ],
    priceNote: null,
    badge: "Custom Pricing",
    ctaLabel: "Contact Us for School Pricing",
    ctaHref: "/contact",
    stripePriceId: null,
    isActive: true,
    isPopular: false,
    sortOrder: 40,
  },
]
