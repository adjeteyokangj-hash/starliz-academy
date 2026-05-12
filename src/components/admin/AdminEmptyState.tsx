import Link from "next/link";

type AdminEmptyStateProps = {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  href?: string;
};

export default function AdminEmptyState({ title, description, actionLabel, onAction, href }: AdminEmptyStateProps) {
  const action = actionLabel ? (
    href ? (
      <Link href={href} className="inline-flex rounded-xl bg-indigo-500 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-400">
        {actionLabel}
      </Link>
    ) : (
      <button type="button" onClick={onAction} className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-400">
        {actionLabel}
      </button>
    )
  ) : null;

  return (
    <div className="rounded-2xl border border-dashed border-slate-600 bg-slate-950/35 px-6 py-8 text-center">
      <p className="text-base font-extrabold text-white">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

