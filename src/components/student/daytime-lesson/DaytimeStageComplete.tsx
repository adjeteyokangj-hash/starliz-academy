"use client";

type Props = {
  completedStageName: string;
  nextStageName: string | null;
  onContinue: () => void;
  continuing?: boolean;
  periodComplete?: boolean;
};

export default function DaytimeStageComplete({
  completedStageName,
  nextStageName,
  onContinue,
  continuing,
  periodComplete,
}: Props) {
  const heading = periodComplete || !nextStageName
    ? `${completedStageName} complete`
    : `${completedStageName} complete`;

  return (
    <div
      data-testid="daytime-stage-complete"
      className="rounded-3xl border border-indigo-200 bg-linear-to-br from-white via-indigo-50/80 to-violet-50 p-6 shadow-[0_18px_50px_rgba(79,70,229,0.12)] sm:p-8"
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-indigo-600">Stage complete</p>
      <h2 className="mt-2 text-2xl font-black text-slate-950">{heading}</h2>
      {nextStageName ? (
        <p className="mt-2 text-sm text-slate-600">
          Next: <span className="font-semibold text-slate-900">{nextStageName}</span>
        </p>
      ) : (
        <p className="mt-2 text-sm text-slate-600">
          {periodComplete
            ? "This period is finished. Head back to Today when you are ready."
            : "All planned stages are done. Extra practice may be available while the period is open."}
        </p>
      )}
      <button
        type="button"
        disabled={continuing}
        onClick={onContinue}
        className="mt-6 inline-flex rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-indigo-500 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
      >
        {continuing ? "Continuing…" : nextStageName ? "Continue lesson" : "Back to Today"}
      </button>
    </div>
  );
}
