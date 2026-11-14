import { isMasteredCodingPracticeLabel } from "./codingSignals";

export type ParentReportCatchUp = {
  subject: string;
  topic?: string | null;
  skill?: string | null;
  title?: string | null;
  status: string;
};

export function filterMasteredCodingCatchUps<T extends ParentReportCatchUp>(
  recommendations: readonly T[],
  masteredTitles: readonly string[],
): T[] {
  return recommendations.filter((item) => {
    if (item.subject.trim().toLowerCase() !== "coding") return true;

    const description = [
      item.topic,
      item.skill,
      item.title,
    ].filter(Boolean).join(" ");

    return !isMasteredCodingPracticeLabel(description, masteredTitles);
  });
}

export function filterMasteredCodingReportText(
  values: readonly string[],
  masteredTitles: readonly string[],
): string[] {
  return values.filter(
    (value) => !isMasteredCodingPracticeLabel(value, masteredTitles),
  );
}
