type SyncQueueCardProps = {
  title: string;
  value: number | string;
  tone?: "default" | "warning" | "danger" | "success";
  detail?: string;
};

function toneClass(tone: SyncQueueCardProps["tone"]) {
  if (tone === "warning") return "border-amber-500/30 bg-amber-500/10 text-amber-100";
  if (tone === "danger") return "border-rose-500/30 bg-rose-500/10 text-rose-100";
  if (tone === "success") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-100";
  return "border-slate-700 bg-slate-900/70 text-slate-100";
}

export default function SyncQueueCard({ title, value, tone = "default", detail }: SyncQueueCardProps) {
  return (
    <div className={`rounded-2xl border p-4 ${toneClass(tone)}`}>
      <p className="text-xs font-black uppercase tracking-[0.16em] opacity-80">{title}</p>
      <p className="mt-2 text-2xl font-black">{value}</p>
      {detail ? <p className="mt-1 text-xs opacity-80">{detail}</p> : null}
    </div>
  );
}
