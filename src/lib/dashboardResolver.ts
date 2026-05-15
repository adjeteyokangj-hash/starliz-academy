/**
 * Resolves a student's dashboard pathway from available profile data.
 * Priority: yearGroup → age → dateOfBirth → safe fallback (primary)
 */

export type DashboardTier = "primary" | "ks3" | "gcse";

function yearGroupIndex(yearGroup: string): number | null {
  const lower = yearGroup.toLowerCase().trim();
  if (lower === "reception" || lower === "nursery" || lower === "eyfs") return 0;
  const match = lower.match(/year\s*(\d+)/);
  if (match) return parseInt(match[1], 10);
  return null;
}

function ageToTier(age: number): DashboardTier {
  if (age <= 11) return "primary";
  if (age <= 14) return "ks3";
  return "gcse";
}

function yearIndexToTier(idx: number): DashboardTier {
  if (idx <= 6) return "primary";
  if (idx <= 9) return "ks3";
  return "gcse";
}

export function resolveDashboardTier(input: {
  yearGroup?: string | null;
  age?: number | null;
  ageYears?: number | null;
  dateOfBirth?: string | null;
}): DashboardTier {
  // Priority 1: yearGroup
  if (input.yearGroup) {
    const idx = yearGroupIndex(input.yearGroup);
    if (idx !== null) return yearIndexToTier(idx);
  }

  // Priority 2: age / ageYears
  const age = input.age ?? input.ageYears;
  if (typeof age === "number" && age > 0) {
    return ageToTier(age);
  }

  // Priority 3: dateOfBirth
  if (input.dateOfBirth) {
    const dob = new Date(input.dateOfBirth);
    if (!isNaN(dob.getTime())) {
      const ageCalc = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
      if (ageCalc > 0) return ageToTier(ageCalc);
    }
  }

  // Priority 4: safe fallback
  return "primary";
}

export function dashboardTierLabel(tier: DashboardTier): string {
  if (tier === "ks3") return "KS3 Pathway";
  if (tier === "gcse") return "GCSE Pathway";
  return "Primary Pathway";
}

/** Returns true when the child profile contains enough data to resolve the tier reliably. */
export function isProfileComplete(input: {
  yearGroup?: string | null;
  age?: number | null;
  ageYears?: number | null;
  dateOfBirth?: string | null;
}): boolean {
  return Boolean(input.yearGroup) || Boolean(input.age ?? input.ageYears) || Boolean(input.dateOfBirth);
}
