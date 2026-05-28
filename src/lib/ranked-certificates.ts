export const RANKED_CERTIFICATE_TYPES = [
  "COMPETITION_PARTICIPANT",
  "COMPETITION_FINALIST",
  "COMPETITION_WINNER",
  "COMPETITION_FIRST_PLACE",
  "COMPETITION_SECOND_PLACE",
  "COMPETITION_THIRD_PLACE",
  "YEAR_GROUP_WINNER",
  "SUBJECT_WINNER",
  "CLASS_LEVEL_WINNER",
  "SUBJECT_TEST_FIRST_PLACE",
  "SUBJECT_TEST_SECOND_PLACE",
  "SUBJECT_TEST_THIRD_PLACE",
  "QUIZ_FIRST_PLACE",
  "QUIZ_SECOND_PLACE",
  "QUIZ_THIRD_PLACE",
  "CHALLENGE_FIRST_PLACE",
  "CHALLENGE_SECOND_PLACE",
  "CHALLENGE_THIRD_PLACE",
  "BEST_OVERALL_COMPETITION_STUDENT",
  "STARLIZ_STUDENT_OF_TERM",
  "STARLIZ_STUDENT_OF_YEAR",
] as const;

export type RankedCertificateType = typeof RANKED_CERTIFICATE_TYPES[number];
export type RankingMethod = "standard" | "dense" | "competition" | "admin_adjusted";

export function isRankedCertificateType(value: string): value is RankedCertificateType {
  return RANKED_CERTIFICATE_TYPES.includes(value as RankedCertificateType);
}

function titleCase(value: string): string {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .toLowerCase()
    .split(/\s+/g)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function rankedCertificateTypeLabel(type: RankedCertificateType): string {
  if (type === "COMPETITION_PARTICIPANT") return "Competition Participant";
  if (type === "COMPETITION_FINALIST") return "Competition Finalist";
  if (type === "COMPETITION_WINNER") return "Competition Winner";
  if (type === "COMPETITION_FIRST_PLACE") return "Competition 1st Place";
  if (type === "COMPETITION_SECOND_PLACE") return "Competition 2nd Place";
  if (type === "COMPETITION_THIRD_PLACE") return "Competition 3rd Place";
  if (type === "YEAR_GROUP_WINNER") return "Year Group Winner";
  if (type === "SUBJECT_WINNER") return "Subject Winner";
  if (type === "CLASS_LEVEL_WINNER") return "Class / Level Winner";
  if (type === "SUBJECT_TEST_FIRST_PLACE") return "Subject Test 1st Place";
  if (type === "SUBJECT_TEST_SECOND_PLACE") return "Subject Test 2nd Place";
  if (type === "SUBJECT_TEST_THIRD_PLACE") return "Subject Test 3rd Place";
  if (type === "QUIZ_FIRST_PLACE") return "Quiz 1st Place";
  if (type === "QUIZ_SECOND_PLACE") return "Quiz 2nd Place";
  if (type === "QUIZ_THIRD_PLACE") return "Quiz 3rd Place";
  if (type === "CHALLENGE_FIRST_PLACE") return "Challenge 1st Place";
  if (type === "CHALLENGE_SECOND_PLACE") return "Challenge 2nd Place";
  if (type === "CHALLENGE_THIRD_PLACE") return "Challenge 3rd Place";
  if (type === "BEST_OVERALL_COMPETITION_STUDENT") return "Best Overall Competition Student";
  if (type === "STARLIZ_STUDENT_OF_TERM") return "StarLiz Student of the Term";
  if (type === "STARLIZ_STUDENT_OF_YEAR") return "StarLiz Student of the Year";
  return titleCase(type);
}

export function rankedCertificateTypeCode(type: RankedCertificateType): string {
  if (type.includes("FIRST_PLACE")) return "R1";
  if (type.includes("SECOND_PLACE")) return "R2";
  if (type.includes("THIRD_PLACE")) return "R3";
  if (type.includes("FINALIST")) return "FIN";
  if (type.includes("PARTICIPANT")) return "PAR";
  if (type.includes("SUBJECT_TEST")) return "ST";
  if (type.includes("QUIZ")) return "QZ";
  if (type.includes("CHALLENGE")) return "CH";
  if (type.includes("WINNER")) return "WIN";
  if (type.includes("STUDENT_OF_TERM")) return "SOT";
  if (type.includes("STUDENT_OF_YEAR")) return "SOY";
  return "RWD";
}

export function rankLabelForCertificate(input: {
  certificateType: RankedCertificateType;
  rank?: number | null;
  rankLabel?: string | null;
}): string {
  const provided = String(input.rankLabel ?? "").trim();
  if (provided) return provided;

  if (input.certificateType.includes("FIRST_PLACE")) return "1st Place";
  if (input.certificateType.includes("SECOND_PLACE")) return "2nd Place";
  if (input.certificateType.includes("THIRD_PLACE")) return "3rd Place";
  if (input.certificateType.includes("FINALIST")) return "Finalist";
  if (input.certificateType.includes("PARTICIPANT")) return "Participant";
  if (input.certificateType.includes("WINNER") || input.certificateType === "SUBJECT_WINNER") return "Winner";
  if (input.rank === 1) return "1st Place";
  if (input.rank === 2) return "2nd Place";
  if (input.rank === 3) return "3rd Place";
  return rankedCertificateTypeLabel(input.certificateType);
}

export function rankNumberForCertificate(input: {
  certificateType: RankedCertificateType;
  rank?: number | null;
}): number | null {
  if (input.certificateType.includes("FIRST_PLACE")) return 1;
  if (input.certificateType.includes("SECOND_PLACE")) return 2;
  if (input.certificateType.includes("THIRD_PLACE")) return 3;
  if (input.certificateType.includes("FINALIST")) return null;
  if (input.certificateType.includes("PARTICIPANT")) return null;
  if (input.rank === 1 || input.rank === 2 || input.rank === 3) return input.rank;
  return typeof input.rank === "number" ? input.rank : null;
}

export function rankedAwardSourceType(type: RankedCertificateType): string {
  if (type.startsWith("SUBJECT_TEST")) return "subject_test";
  if (type.startsWith("QUIZ")) return "quiz";
  if (type.startsWith("CHALLENGE")) return "challenge";
  if (type.includes("COMPETITION") || type.includes("WINNER")) return "competition";
  return "ranked_award";
}

export function rankedCertificateTitle(input: {
  certificateType: RankedCertificateType;
  rankLabel?: string | null;
  competitionName?: string | null;
  testName?: string | null;
}): string {
  const label = rankLabelForCertificate({ certificateType: input.certificateType, rankLabel: input.rankLabel });
  const eventName = String(input.competitionName ?? input.testName ?? "").trim();
  const base = rankedCertificateTypeLabel(input.certificateType);
  return eventName ? `${eventName} - ${label}` : `${base} Certificate`;
}
