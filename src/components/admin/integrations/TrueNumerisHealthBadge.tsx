type TrueNumerisHealthBadgeProps = {
  status: string | null | undefined;
};

function resolveTone(status: string | null | undefined) {
  const normalized = String(status ?? "unknown").toLowerCase();
  if (normalized === "ok" || normalized === "connected" || normalized === "synced") {
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  }
  if (normalized === "failed" || normalized === "error") {
    return "border-rose-500/40 bg-rose-500/10 text-rose-200";
  }
  return "border-amber-500/40 bg-amber-500/10 text-amber-200";
}

export default function TrueNumerisHealthBadge({ status }: TrueNumerisHealthBadgeProps) {
  const normalized = String(status ?? "unknown").toLowerCase();
  const label = normalized === "ok" ? "Healthy" : normalized === "failed" ? "Issue" : normalized;

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold uppercase tracking-[0.12em] ${resolveTone(status)}`}>
      {label}
    </span>
  );
}
