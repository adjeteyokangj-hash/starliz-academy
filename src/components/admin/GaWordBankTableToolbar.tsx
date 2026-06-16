import type { GaWordAdminSort, GaWordAdminTableFilters } from "@/lib/ga-word-bank-admin-filters";

type SourceOption = {
  id: string;
  sourceName: string;
};

type GaWordBankTableToolbarProps = {
  filters: GaWordAdminTableFilters;
  wordsCount: number;
  sourceOptions: SourceOption[];
  categoryOptions: string[];
  levelOptions: string[];
  reviewStatusOptions: string[];
  audioStatusOptions: string[];
  wordTypeOptions: string[];
  sourceFilterLabel: string;
  sortLabel: string;
  onFilterChange: (next: GaWordAdminTableFilters) => void;
  onApplyFilters: () => void;
  onResetFilters: () => void;
  onClearFilters: () => void;
};

export default function GaWordBankTableToolbar({
  filters,
  wordsCount,
  sourceOptions,
  categoryOptions,
  levelOptions,
  reviewStatusOptions,
  audioStatusOptions,
  wordTypeOptions,
  sourceFilterLabel,
  sortLabel,
  onFilterChange,
  onApplyFilters,
  onResetFilters,
  onClearFilters,
}: GaWordBankTableToolbarProps) {
  return (
    <>
      <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        <label className="block text-xs font-bold uppercase text-slate-400">
          Search
          <input
            value={filters.q}
            onChange={(event) => onFilterChange({ ...filters, q: event.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600"
            placeholder="English, Ga or notes"
          />
        </label>

        <label className="block text-xs font-bold uppercase text-slate-400">
          Source
          <select
            value={filters.sourceId}
            onChange={(event) => onFilterChange({ ...filters, sourceId: event.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          >
            <option value="">All sources</option>
            {sourceOptions.map((source) => (
              <option key={source.id} value={source.id}>{source.sourceName}</option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-bold uppercase text-slate-400">
          Sort
          <select
            value={filters.sort}
            onChange={(event) => onFilterChange({ ...filters, sort: event.target.value as GaWordAdminSort })}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="english_asc">English A-Z</option>
            <option value="ga_asc">Ga A-Z</option>
          </select>
        </label>

        <label className="block text-xs font-bold uppercase text-slate-400">
          Quick filter
          <select
            value={filters.quickFilter}
            onChange={(event) => onFilterChange({
              ...filters,
              quickFilter: event.target.value as "all" | "recent",
              sort: event.target.value === "recent" ? "newest" : filters.sort,
            })}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          >
            <option value="all">All rows</option>
            <option value="recent">Recently added</option>
          </select>
        </label>

        <label className="block text-xs font-bold uppercase text-slate-400">
          Category
          <select
            value={filters.category}
            onChange={(event) => onFilterChange({ ...filters, category: event.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          >
            <option value="">All</option>
            {categoryOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-bold uppercase text-slate-400">
          Level
          <select
            value={filters.level}
            onChange={(event) => onFilterChange({ ...filters, level: event.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          >
            <option value="">All</option>
            {levelOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-bold uppercase text-slate-400">
          Review status
          <select
            value={filters.reviewStatus}
            onChange={(event) => onFilterChange({ ...filters, reviewStatus: event.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          >
            <option value="">All</option>
            {reviewStatusOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-bold uppercase text-slate-400">
          Audio status
          <select
            value={filters.audioStatus}
            onChange={(event) => onFilterChange({ ...filters, audioStatus: event.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          >
            <option value="">All</option>
            {audioStatusOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-bold uppercase text-slate-400">
          Word type
          <select
            value={filters.wordType}
            onChange={(event) => onFilterChange({ ...filters, wordType: event.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          >
            <option value="">All</option>
            {wordTypeOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <button type="button" onClick={onApplyFilters} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-black text-white">Apply filters</button>
        <button type="button" onClick={onResetFilters} className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-black text-slate-200">Reset</button>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-300">
        <p>Showing <span className="font-black text-white">{wordsCount}</span> words</p>
        <p>Filtered by: <span className="font-black text-white">Source {sourceFilterLabel}, {sortLabel}{filters.quickFilter === "recent" ? ", Recently added" : ""}</span></p>
        <button type="button" onClick={onClearFilters} className="rounded-lg border border-slate-700 px-3 py-1 font-bold text-slate-200">Clear filters</button>
      </div>
    </>
  );
}
