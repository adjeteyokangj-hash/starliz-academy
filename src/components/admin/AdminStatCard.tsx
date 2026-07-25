import Link from "next/link";

type AdminStatCardProps = {
  title: string;
  value: string | number;
  detail?: string;
  icon?: string;
  tone?: "purple" | "blue" | "green" | "amber" | "rose" | "slate" | "neutral";
  href?: string;
};

const toneAccent: Record<NonNullable<AdminStatCardProps["tone"]>, string> = {
  purple: "border-l-[var(--admin-primary)]",
  blue: "border-l-sky-400",
  green: "border-l-emerald-400",
  amber: "border-l-amber-400",
  rose: "border-l-rose-400",
  slate: "border-l-slate-400",
  neutral: "border-l-[var(--admin-border-strong)]",
};

export default function AdminStatCard({ title, value, detail, icon, tone = "neutral", href }: AdminStatCardProps) {
  const inner = (
    <article
      className={`rounded-[var(--admin-radius-lg)] border border-[var(--admin-border)] border-l-4 p-5 ${toneAccent[tone]} ${
        href ? "cursor-pointer transition hover:border-[var(--admin-border-strong)]" : ""
      }`}
      style={{ background: "var(--admin-surface)", boxShadow: "var(--admin-shadow-sm)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="admin-meta">{title}</p>
          <p className="mt-3 text-3xl font-bold tracking-tight text-[var(--admin-text)]">{value}</p>
        </div>
        {icon ? (
          <span
            className="flex h-9 w-9 items-center justify-center rounded-[var(--admin-radius)] border border-[var(--admin-border)] text-xs font-semibold text-[var(--admin-muted)]"
            style={{ background: "var(--admin-rail)" }}
          >
            {icon}
          </span>
        ) : null}
      </div>
      {detail ? <p className="admin-body mt-3">{detail}</p> : null}
    </article>
  );

  return href ? <Link href={href} className="block">{inner}</Link> : inner;
}
