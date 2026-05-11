type BarPoint = {
  label: string;
  value: number;
  color?: string;
};

type Props = {
  title: string;
  points: BarPoint[];
  maxValue?: number;
};

export default function BarChart({ title, points, maxValue }: Props) {
  const safeMax = maxValue ?? Math.max(1, ...points.map((p) => p.value));

  return (
    <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
      <p className="mb-3 text-sm font-bold text-slate-800">{title}</p>
      <div className="space-y-3">
        {points.length ? points.map((point) => (
          <div key={point.label} className="grid grid-cols-[56px_1fr_40px] items-center gap-3">
            <span className="text-xs font-semibold text-slate-500">{point.label}</span>
            <div className="h-3 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(6, (point.value / safeMax) * 100)}%`,
                  background: point.color ?? "#6C5CE7",
                }}
              />
            </div>
            <span className="text-right text-xs font-bold text-slate-700">{point.value}</span>
          </div>
        )) : <p className="text-sm text-slate-500">No data yet.</p>}
      </div>
    </div>
  );
}
