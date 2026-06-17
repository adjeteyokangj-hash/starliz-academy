import type { CoachWordHelpResponse } from "@/lib/coachDictionary";
import CoachWordCard from "@/components/coach/CoachWordCard";
import VoiceHelpControls from "@/components/learning/VoiceHelpControls";

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

export default function CoachWordHelp({ help, voiceHelpEnabled = false, onClose, onSpeakWord, onSpeakDefinition, onSpeakExample, onRepeatExplanation, onNextTry }: Props) {
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

        <VoiceHelpControls
          voiceHelpEnabled={voiceHelpEnabled}
          showToggle={false}
          actions={[
            { id: "understand", label: "Help me understand", onClick: onSpeakDefinition, variant: "primary" },
            { id: "say-again", label: "Say it again", onClick: onSpeakWord, variant: "secondary" },
            { id: "sound-it-out", label: "Sound it out", onClick: onRepeatExplanation, variant: "secondary" },
            { id: "hint", label: "Give me a hint", onClick: onSpeakDefinition, variant: "secondary" },
            { id: "example", label: "Show an example", onClick: onSpeakExample, variant: "secondary" },
            { id: "try-again", label: "I'm ready to try", onClick: onNextTry, variant: "primary" },
          ]}
        />
      </div>
    </section>
  );
}
