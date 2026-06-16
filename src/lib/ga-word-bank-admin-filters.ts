export type GaWordAdminSort = "newest" | "oldest" | "english_asc" | "ga_asc";
export type GaWordAdminQuickFilter = "all" | "recent";

export type GaWordAdminTableFilters = {
  q: string;
  reviewStatus: string;
  category: string;
  level: string;
  wordType: string;
  sourceId: string;
  sourcePage: string;
  audioStatus: string;
  quizReady: string;
  storyReady: string;
  sort: GaWordAdminSort;
  quickFilter: GaWordAdminQuickFilter;
};

export const DEFAULT_GA_WORD_ADMIN_TABLE_FILTERS: GaWordAdminTableFilters = {
  q: "",
  reviewStatus: "",
  category: "",
  level: "",
  wordType: "",
  sourceId: "",
  sourcePage: "",
  audioStatus: "",
  quizReady: "",
  storyReady: "",
  sort: "newest",
  quickFilter: "all",
};

export function clearGaWordAdminTableFilters(): GaWordAdminTableFilters {
  return { ...DEFAULT_GA_WORD_ADMIN_TABLE_FILTERS };
}
