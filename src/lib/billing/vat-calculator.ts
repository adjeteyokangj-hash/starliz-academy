import { vatInputSchema, type VatInput } from "@/types/financial";

export type VatComputation = {
  grossAmount: number;
  vatAmount: number;
  netAmount: number;
  country: string;
  currency: string;
  provider?: string;
  subscriptionPlan?: string;
  vatRate: number;
  vatEnabled: boolean;
};

const UK_DEFAULT_RATE = 0.2;

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function resolveVatRate(country: string): number {
  const normalized = country.trim().toUpperCase();
  if (normalized === "UK" || normalized === "GB") return UK_DEFAULT_RATE;
  // Ghana and other regions are kept as zero-rated in Phase 1 until local tax rules are configured.
  return 0;
}

export function calculateVat(input: VatInput): VatComputation {
  const parsed = vatInputSchema.parse(input);
  const vatRate = parsed.vatEnabled ? resolveVatRate(parsed.country) : 0;
  const netAmount = roundMoney(parsed.grossAmount / (1 + vatRate));
  const vatAmount = roundMoney(parsed.grossAmount - netAmount);

  return {
    grossAmount: roundMoney(parsed.grossAmount),
    vatAmount,
    netAmount,
    country: parsed.country.toUpperCase(),
    currency: parsed.currency.toUpperCase(),
    provider: parsed.provider,
    subscriptionPlan: parsed.subscriptionPlan,
    vatRate,
    vatEnabled: parsed.vatEnabled,
  };
}
