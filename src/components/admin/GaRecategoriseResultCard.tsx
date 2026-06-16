type GaRecategoriseResult = {
  inspected: number;
  targetCount: number;
  updated: number;
  message?: string;
};

type GaRecategoriseResultCardProps = {
  result: GaRecategoriseResult;
};

export default function GaRecategoriseResultCard({ result }: GaRecategoriseResultCardProps) {
  const alreadyCorrect = Math.max(result.targetCount - result.updated, 0);

  return (
    <div className="mt-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-100">
      <p className="font-black uppercase tracking-wide">Recategorisation complete</p>
      {result.message ? <p className="mt-1 text-emerald-50">{result.message}</p> : null}
      <div className="mt-2 grid gap-2 md:grid-cols-3">
        <p className="rounded-lg border border-emerald-500/40 bg-slate-950/50 px-3 py-2">Rows checked: <span className="font-black text-white">{result.inspected}</span></p>
        <p className="rounded-lg border border-emerald-500/40 bg-slate-950/50 px-3 py-2">Rows updated: <span className="font-black text-white">{result.updated}</span></p>
        <p className="rounded-lg border border-emerald-500/40 bg-slate-950/50 px-3 py-2">Already correct: <span className="font-black text-white">{alreadyCorrect}</span></p>
      </div>
    </div>
  );
}
