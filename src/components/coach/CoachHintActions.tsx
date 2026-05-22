type Props = {
  onUnderstand: () => void;
  onSayAgain: () => void;
  onSoundItOut: () => void;
  onHint: () => void;
  onExample: () => void;
  onTryAgain: () => void;
};

function ActionButton({ label, onClick, accent = false }: { label: string; onClick: () => void; accent?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-12 rounded-2xl px-4 py-3 text-sm font-black transition ${
        accent
          ? "bg-cyan-500 text-white hover:bg-cyan-400"
          : "border border-slate-700 bg-white text-slate-900 hover:bg-slate-50"
      }`}
    >
      {label}
    </button>
  );
}

export default function CoachHintActions({ onUnderstand, onSayAgain, onSoundItOut, onHint, onExample, onTryAgain }: Props) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <ActionButton label="Help me understand" onClick={onUnderstand} accent />
      <ActionButton label="Say it again" onClick={onSayAgain} />
      <ActionButton label="Sound it out" onClick={onSoundItOut} />
      <ActionButton label="Give me a hint" onClick={onHint} />
      <ActionButton label="Show an example" onClick={onExample} />
      <ActionButton label="I’m ready to try" onClick={onTryAgain} accent />
    </div>
  );
}
