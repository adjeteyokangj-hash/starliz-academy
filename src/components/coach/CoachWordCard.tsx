import type { CoachWordHelpResponse } from "@/lib/coachDictionary";
import type { ReactNode } from "react";

type Props = {
  help: CoachWordHelpResponse;
};

function Pill({ children }: { children: ReactNode }) {
  return <span className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-cyan-800">{children}</span>;
}

export default function CoachWordCard({ help }: Props) {
  return (
    <div className="rounded-3xl border border-cyan-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-700">{help.found ? "Word Bank" : "Coach fallback"}</p>
      <h3 className="mt-2 text-3xl font-black text-cyan-950">{help.word ?? "Word help"}</h3>
      <p className="mt-3 text-sm leading-6 text-cyan-950">{help.coachMessage}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {help.syllables ? <Pill>{help.syllables}</Pill> : null}
        {help.phonicsPattern ? <Pill>{help.phonicsPattern}</Pill> : null}
        {help.pronunciationHint ? <Pill>{help.pronunciationHint}</Pill> : null}
      </div>
      {help.exampleSentence ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Example</p>
          <p className="mt-1 text-sm font-semibold text-slate-800">{help.exampleSentence}</p>
        </div>
      ) : null}
      {help.definitionParent ? (
        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-amber-700">Grown-up meaning</p>
          <p className="mt-1 text-sm text-amber-900">{help.definitionParent}</p>
        </div>
      ) : null}
      {help.relatedWords.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {help.relatedWords.map((word) => (
            <span key={word} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{word}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
