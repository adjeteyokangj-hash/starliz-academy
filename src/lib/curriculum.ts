export const YEAR_GROUPS = [
  "Reception",
  "Year 1",
  "Year 2",
  "Year 3",
  "Year 4",
  "Year 5",
  "Year 6",
  "Year 7",
  "Year 8",
  "Year 9",
  "Year 10",
  "Year 11",
] as const;

export const KEY_STAGES = ["EYFS", "KS1", "KS2", "KS3", "KS4"] as const;

export type YearGroup = (typeof YEAR_GROUPS)[number];
export type KeyStage = (typeof KEY_STAGES)[number];

export function normalizeYearGroup(value: string | null | undefined): YearGroup | null {
  if (!value) return null;
  const cleaned = value.trim().toLowerCase();
  if (cleaned === "reception") return "Reception";
  const yearMatch = cleaned.match(/^year\s*(\d{1,2})$/);
  if (!yearMatch) return null;
  const yearNumber = Number(yearMatch[1]);
  if (!Number.isFinite(yearNumber) || yearNumber < 1 || yearNumber > 11) return null;
  return `Year ${yearNumber}` as YearGroup;
}

export function keyStageForYearGroup(yearGroup: string | null | undefined): KeyStage {
  const normalized = normalizeYearGroup(yearGroup);
  if (!normalized) return "KS1";
  if (normalized === "Reception") return "EYFS";
  if (normalized === "Year 1" || normalized === "Year 2") return "KS1";
  if (["Year 3", "Year 4", "Year 5", "Year 6"].includes(normalized)) return "KS2";
  if (["Year 7", "Year 8", "Year 9"].includes(normalized)) return "KS3";
  return "KS4";
}

export function yearGroupsForKeyStage(keyStage: string | null | undefined): YearGroup[] {
  switch (keyStage) {
    case "EYFS":
      return ["Reception"];
    case "KS1":
      return ["Year 1", "Year 2"];
    case "KS2":
      return ["Year 3", "Year 4", "Year 5", "Year 6"];
    case "KS3":
      return ["Year 7", "Year 8", "Year 9"];
    case "KS4":
      return ["Year 10", "Year 11"];
    default:
      return [...YEAR_GROUPS];
  }
}

export const PHONICS_STAGE_SKILL_FOCUS = [
  "Phase 2 phonics",
  "Phase 3 phonics",
  "Phase 4 blends",
  "Phase 5 alternative sounds",
] as const;

export type PhonicsStage = "phase2" | "phase3" | "phase4" | "phase5";

export function phonicsStageFromSkillFocus(skillFocus: string | null | undefined): PhonicsStage | null {
  const focus = (skillFocus ?? "").trim().toLowerCase();
  if (focus.startsWith("phase 2")) return "phase2";
  if (focus.startsWith("phase 3")) return "phase3";
  if (focus.startsWith("phase 4")) return "phase4";
  if (focus.startsWith("phase 5")) return "phase5";
  return null;
}
