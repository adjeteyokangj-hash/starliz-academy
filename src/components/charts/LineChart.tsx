type LinePoint = {
  label: string;
  value: number;
};

type Props = {
  title: string;
  points: LinePoint[];
  color?: string;
};

export default function LineChart({ title, points, color = "#00CEC9" }: Props) {
  const width = 360;
  const height = 140;
  const padding = 16;
  const max = Math.max(1, ...points.map((point) => point.value));
  const min = Math.min(0, ...points.map((point) => point.value));
  const range = Math.max(1, max - min);

  const coords = points.map((point, index) => {
    const x = padding + (index * (width - padding * 2)) / Math.max(1, points.length - 1);
    const y = height - padding - ((point.value - min) / range) * (height - padding * 2);
    return { ...point, x, y };
  });

  const d = coords.map((c, index) => `${index === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");

  return (
    <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
      <p className="mb-3 text-sm font-bold text-slate-800">{title}</p>
      {points.length ? (
        <>
          <svg viewBox={`0 0 ${width} ${height}`} className="h-40 w-full">
            <path d={d} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            {coords.map((point) => (
              <circle key={point.label} cx={point.x} cy={point.y} r="4" fill={color} />
            ))}
          </svg>
          <div className="mt-2 flex justify-between gap-2 text-[10px] font-semibold text-slate-500">
            {points.map((point) => (
              <span key={point.label}>{point.label}</span>
            ))}
          </div>
        </>
      ) : <p className="text-sm text-slate-500">No data yet.</p>}
    </div>
  );
}
