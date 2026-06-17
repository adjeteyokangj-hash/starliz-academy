import type { CoachWordHelpResponse } from "@/lib/coachDictionary";
import CoachHintActions from "@/components/coach/CoachHintActions";
import CoachWordCard from "@/components/coach/CoachWordCard";

type Props = {
  help: CoachWordHelpResponse;
  voiceHelpEnabled?: boolean;
  onClose: () => void;
  onSpeakWord: () => void;
  onSpeakDefinition: () => void;
  onSpeakExample: () => void;
  onRepeatExplanation: () => void;
  onNextTry: () => void;
};

export default function CoachWordHelp({ help, voiceHelpEnabled = true, onClose, onSpeakWord, onSpeakDefinition, onSpeakExample, onRepeatExplanation, onNextTry }: Props) {
  return (
    <section className="rounded-[1.75rem] border border-cyan-200 bg-cyan-50/90 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-700">Coach Word Help</p>
          <p className="mt-1 text-sm font-semibold text-cyan-950">Let’s look at this together.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close word help" className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-black uppercase tracking-[0.14em] text-slate-600 hover:bg-slate-50">
          Close
        </button>
      </div>

      <div className="mt-4 space-y-4">
        <CoachWordCard help={help} />

        {voiceHelpEnabled ? (
          <CoachHintActions
            onUnderstand={onSpeakDefinition}
            onSayAgain={onSpeakWord}
            onSoundItOut={onRepeatExplanation}
            onHint={onSpeakDefinition}
            onExample={onSpeakExample}
            onTryAgain={onNextTry}
          />
        ) : null}
      </div>
    </section>
  );
}
