import { normalizeYearGroup } from "@/lib/curriculum";

export type HomeworkWorkloadCap = {
  minMinutes: number;
  maxMinutes: number;
};

export function workloadCapForYearGroup(yearGroup: string | null | undefined): HomeworkWorkloadCap {
  const normalized = normalizeYearGroup(yearGroup);
  if (!normalized) return { minMinutes: 10, maxMinutes: 20 };
  if (normalized === "Reception") return { minMinutes: 0, maxMinutes: 0 };

  if (normalized === "Year 1" || normalized === "Year 2") return { minMinutes: 5, maxMinutes: 10 };
  if (normalized === "Year 3" || normalized === "Year 4") return { minMinutes: 10, maxMinutes: 15 };
  if (normalized === "Year 5" || normalized === "Year 6") return { minMinutes: 15, maxMinutes: 20 };
  if (normalized === "Year 7" || normalized === "Year 8" || normalized === "Year 9") return { minMinutes: 20, maxMinutes: 30 };
  return { minMinutes: 30, maxMinutes: 45 };
}
