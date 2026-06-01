import { percentageWidthClass } from "@/lib/progress-class";

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

function barColorClass(color?: string): string {
  if (color === "#00CEC9") return "bg-cyan-500";
  if (color === "#10b981") return "bg-emerald-500";
  if (color === "#ef4444") return "bg-red-500";
  if (color === "#f59e0b") return "bg-amber-500";
  return "bg-violet-500";
}

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
                className={`h-full rounded-full ${barColorClass(point.color)} ${percentageWidthClass(
                  Math.max(6, (point.value / safeMax) * 100),
                )}`}
              />
            </div>
            <span className="text-right text-xs font-bold text-slate-700">{point.value}</span>
          </div>
        )) : <p className="text-sm text-slate-500">No data yet.</p>}
      </div>
    </div>
  );
}
