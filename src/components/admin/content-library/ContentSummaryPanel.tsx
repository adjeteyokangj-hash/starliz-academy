"use client";

type Props = {
  total: number;
  reviewedPublished: number;
  draft: number;
  invalidJson: number;
};

export default function ContentSummaryPanel(props: Props) {
  const cards = [
    { label: "Total content", value: props.total },
    { label: "Reviewed / Published", value: props.reviewedPublished },
    { label: "Draft", value: props.draft },
    { label: "Invalid JSON", value: props.invalidJson },
  ];

  return (
    <aside className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
      <h3 className="text-sm font-black text-white">Summary</h3>
      <div className="mt-3 grid gap-2">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2">
            <p className="text-xs text-slate-400">{card.label}</p>
            <p className="text-lg font-black text-slate-100">{card.value}</p>
          </div>
        ))}
      </div>
    </aside>
  );
}
