import Link from "next/link";

type Props = {
  label: string;
  value: string | number;
  icon?: string;
  helperText?: string;
  href?: string;
};

export default function StarCard({ label, value, icon = "⭐", helperText, href }: Props) {
  const content = (
    <article className="rounded-[28px] p-4 shadow-[0_20px_44px_rgba(15,23,42,0.08)] ring-1 backdrop-blur transition hover:-translate-y-0.5 hover:shadow-[0_24px_48px_rgba(15,23,42,0.14)]" style={{ backgroundImage: "var(--stat-bg)", borderColor: "var(--stat-ring)" }}>
      <p className="text-3xl" aria-hidden>
        {icon}
      </p>
      <p className="mt-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-black text-slate-900">{value}</p>
      {helperText ? <p className="mt-1 text-sm text-slate-600">{helperText}</p> : null}
    </article>
  );

  if (!href) {
    return content;
  }

  return (
    <Link href={href} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-[28px]">
      {content}
    </Link>
  );
}
