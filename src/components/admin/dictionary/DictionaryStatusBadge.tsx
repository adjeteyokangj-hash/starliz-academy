export default function DictionaryStatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.14em] ${
        active
          ? "border border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
          : "border border-slate-700 bg-slate-800 text-slate-300"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}
