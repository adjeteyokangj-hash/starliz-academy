/** Standard daytime school year classes: Year 1 … Year 11. */
export const SCHOOL_YEAR_CLASS_GROUPS = [
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

export type SchoolYearClassGroup = (typeof SCHOOL_YEAR_CLASS_GROUPS)[number];
