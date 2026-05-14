/**
 * Resolves a student's age-aware dashboard tier from available profile data.
 * Priority: yearGroup → age → dateOfBirth → safe fallback (primary)
 */

export type DashboardTier = "early" | "primary" | "secondary";

function yearGroupIndex(yearGroup: string): number | null {
  const lower = yearGroup.toLowerCase().trim();
  if (lower === "reception" || lower === "nursery" || lower === "eyfs") return 0;
  const match = lower.match(/year\s*(\d+)/);
  if (match) return parseInt(match[1], 10);
  return null;
}

function ageToTier(age: number): DashboardTier {
  if (age <= 7) return "early";
  if (age <= 11) return "primary";
  return "secondary";
}

function yearIndexToTier(idx: number): DashboardTier {
  if (idx <= 2) return "early";
  if (idx <= 6) return "primary";
  return "secondary";
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
  if (tier === "early") return "Early Years";
  if (tier === "secondary") return "Secondary";
  return "Primary";
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
