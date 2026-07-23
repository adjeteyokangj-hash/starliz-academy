import Link from "next/link";

type AdminStatCardProps = {
  title: string;
  value: string | number;
  detail?: string;
  icon?: string;
  tone?: "purple" | "blue" | "green" | "amber" | "rose" | "slate" | "neutral";
  href?: string;
};

const toneClass = {
  purple: "border-white/10 bg-gradient-to-br from-violet-600/35 to-indigo-500/15 text-violet-100",
  blue: "border-white/10 bg-gradient-to-br from-blue-600/35 to-cyan-500/15 text-blue-100",
  green: "border-white/10 bg-gradient-to-br from-emerald-600/30 to-teal-500/15 text-emerald-100",
  amber: "border-white/10 bg-gradient-to-br from-amber-500/30 to-yellow-400/15 text-amber-100",
  rose: "border-white/10 bg-gradient-to-br from-rose-600/30 to-pink-500/15 text-rose-100",
  slate: "border-white/10 bg-gradient-to-br from-slate-700/80 to-slate-800/60 text-slate-100",
  neutral: "border-slate-700/70 bg-slate-950/70 text-slate-100",
};

export default function AdminStatCard({ title, value, detail, icon, tone = "neutral", href }: AdminStatCardProps) {
  const inner = (
    <article className={`rounded-2xl border p-5 shadow-xl shadow-slate-950/20 ${toneClass[tone]} ${href ? "transition hover:border-slate-500 hover:bg-slate-900/80 cursor-pointer" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{title}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-white">{value}</p>
        </div>
        {icon ? (
          <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700/80 bg-slate-900/80 text-xs font-semibold text-slate-300">
            {icon}
          </span>
        ) : null}
      </div>
      {detail ? <p className="mt-3 text-sm text-slate-400">{detail}</p> : null}
    </article>
  );

  return href ? <Link href={href} className="block">{inner}</Link> : inner;
}
