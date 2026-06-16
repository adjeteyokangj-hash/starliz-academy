import type { GaBulkImportDuplicateStrategy } from "@/lib/ga-word-bank";

type GaBulkImportResultSummary = {
  totalRows: number;
  importedRows: number;
  skippedDuplicateRows: number;
  updatedDuplicateRows: number;
  failedRows: number;
  pendingReviewRows: number;
  sourceName: string | null;
};

type GaBulkImportResultCardProps = {
  summary: GaBulkImportResultSummary;
  duplicateStrategy: GaBulkImportDuplicateStrategy;
};

export default function GaBulkImportResultCard({ summary, duplicateStrategy }: GaBulkImportResultCardProps) {
  return (
    <div className="mt-4 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4">
      <h3 className="text-sm font-black uppercase tracking-wide text-emerald-100">Import complete</h3>
      <div className="mt-3 grid gap-2 text-xs md:grid-cols-4">
        <p className="rounded-lg border border-emerald-600/40 bg-slate-950/50 px-3 py-2 text-slate-200">
          Total rows processed: <span className="font-black text-white">{summary.totalRows}</span>
        </p>
        <p className="rounded-lg border border-emerald-600/40 bg-slate-950/50 px-3 py-2 text-slate-200">
          Imported rows: <span className="font-black text-emerald-300">{summary.importedRows}</span>
        </p>
        <p className="rounded-lg border border-emerald-600/40 bg-slate-950/50 px-3 py-2 text-slate-200">
          Skipped duplicates: <span className="font-black text-amber-300">{summary.skippedDuplicateRows}</span>
        </p>
        {duplicateStrategy === "update" ? (
          <p className="rounded-lg border border-emerald-600/40 bg-slate-950/50 px-3 py-2 text-slate-200">
            Updated duplicates: <span className="font-black text-cyan-300">{summary.updatedDuplicateRows}</span>
          </p>
        ) : null}
        <p className="rounded-lg border border-emerald-600/40 bg-slate-950/50 px-3 py-2 text-slate-200">
          Failed rows: <span className="font-black text-rose-300">{summary.failedRows}</span>
        </p>
        <p className="rounded-lg border border-emerald-600/40 bg-slate-950/50 px-3 py-2 text-slate-200">
          Pending/Review rows: <span className="font-black text-white">{summary.pendingReviewRows}</span>
        </p>
        {summary.sourceName ? (
          <p className="rounded-lg border border-emerald-600/40 bg-slate-950/50 px-3 py-2 text-slate-200 md:col-span-2">
            Source: <span className="font-black text-white">{summary.sourceName}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
