import Link from "next/link";

type AdminStatCardProps = {
  title: string;
  value: string | number;
  detail?: string;
  icon: string;
  tone?: "purple" | "blue" | "green" | "amber" | "rose" | "slate";
  href?: string;
};

const toneClass = {
  purple: "from-violet-600/35 to-indigo-500/15 text-violet-100",
  blue: "from-blue-600/35 to-cyan-500/15 text-blue-100",
  green: "from-emerald-600/30 to-teal-500/15 text-emerald-100",
  amber: "from-amber-500/30 to-yellow-400/15 text-amber-100",
  rose: "from-rose-600/30 to-pink-500/15 text-rose-100",
  slate: "from-slate-700/80 to-slate-800/60 text-slate-100",
};

export default function AdminStatCard({ title, value, detail, icon, tone = "purple", href }: AdminStatCardProps) {
  const inner = (
    <article className={`rounded-2xl border border-white/10 bg-gradient-to-br ${toneClass[tone]} p-5 shadow-xl shadow-slate-950/20 ${href ? "transition hover:brightness-110 hover:scale-[1.02] cursor-pointer" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase text-white/58">{title}</p>
          <p className="mt-3 text-3xl font-black text-white">{value}</p>
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-sm font-black text-white">
          {icon}
        </span>
      </div>
      {detail ? <p className="mt-3 text-sm text-white/66">{detail}</p> : null}
    </article>
  );

  return href ? <Link href={href} className="block">{inner}</Link> : inner;
}

