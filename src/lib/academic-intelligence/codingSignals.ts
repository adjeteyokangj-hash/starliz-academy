/** Coding achievement rows are not academic scores and not money. */
const REWARD_NAME = /·\s*(mastery|improvement|persistence)(?:\s+catch-up)?\s*$/i;

export type CodingRewardKind = "mastery" | "improvement" | "persistence";

export function codingRewardKind(activityType: string | null | undefined, activityName: string | null | undefined): CodingRewardKind | null {
  if ((activityType ?? "").trim().toLowerCase() !== "coding") return null;
  const match = (activityName ?? "").match(REWARD_NAME);
  if (!match) return null;
  return match[1].toLowerCase() as CodingRewardKind;
}

export function isCodingRewardName(value: string | null | undefined): boolean {
  return REWARD_NAME.test(value ?? "");
}

export function codingLessonTitle(activityName: string | null | undefined): string {
  const title = (activityName ?? "").replace(REWARD_NAME, "").trim();
  return title || "Coding";
}

export function isMasteredCodingSkill(skill: string | null | undefined, status: string | null | undefined): boolean {
  return (skill ?? "").trim().toLowerCase().startsWith("coding_") && (status ?? "").trim().toLowerCase() === "mastered";
}
export function masteredCodingLessonTitles(
  records: Array<{ activityType?: string | null; activityName?: string | null }>,
): string[] {
  const titles: string[] = [];
  for (const record of records) {
    if (codingRewardKind(record.activityType, record.activityName) !== "mastery") continue;
    const title = (record.activityName ?? "").replace(REWARD_NAME, "").trim();
    if (!title) continue;
    if (titles.some((item) => item.toLowerCase() === title.toLowerCase())) continue;
    titles.push(title);
  }
  return titles;
}

/** A mastered coding lesson, or a coding star row, is not an academic practice need. */
export function isMasteredCodingPracticeLabel(value: string | null | undefined, masteredTitles: readonly string[]): boolean {
  if (isCodingRewardName(value)) return true;
  const label = (value ?? "").trim().toLowerCase();
  if (!label) return false;
  return masteredTitles.some((title) => {
    const normalized = title.trim().toLowerCase();
    return normalized.length > 2 && label.includes(normalized);
  });
}
