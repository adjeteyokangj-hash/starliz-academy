import type { CoachWordHelpResponse } from "@/lib/coachDictionary";

type Props = {
  help: CoachWordHelpResponse;
};

export default function WordHelpInline({ help }: Props) {
  if (!help.word) return null;

  return (
    <div className="rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-950">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-700">Coach Word Help</p>
      <p className="mt-1 font-bold">{help.word}</p>
      <p className="mt-1">{help.definitionChild}</p>
    </div>
  );
}
