import type { LearningTwinProfile } from "@/lib/academic-intelligence/types";

type LearningTwinInsightProps = {
  profile?: LearningTwinProfile | null;
};

export default function LearningTwinInsight({ profile }: LearningTwinInsightProps) {
  const safeProfile = profile ?? {
    title: "LEARNING TWIN",
    subtitle: "How I Learn Best",
    hasEnoughData: false,
  };

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6">
      <p className="text-xs font-bold uppercase tracking-[0.3em] text-slate-400">{safeProfile.title}</p>
      <h2 className="mt-1 text-lg font-black text-slate-900">{safeProfile.subtitle}</h2>

      {!profile || !profile.hasEnoughData ? (
        <div className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <p className="font-semibold">StarLiz is still learning how to support you best.</p>
          <p>Complete more lessons so your Learning Twin can personalise your learning support.</p>
        </div>
      ) : (
        <div className="mt-4 grid gap-2">
          {profile.insights.slice(0, 4).map((item) => (
            <div key={item.key} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">{item.label}</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">{item.text}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
