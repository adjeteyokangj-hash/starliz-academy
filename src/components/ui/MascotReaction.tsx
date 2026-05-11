type Props = {
  mood: "happy" | "support" | "celebrate";
  message: string;
};

export default function MascotReaction({ mood, message }: Props) {
  const emoji = mood === "celebrate" ? "🦄" : mood === "support" ? "🦊" : "🐬";
  const anim = mood === "support" ? "animate-[wiggle_0.45s_ease-in-out_2]" : "animate-[popin_0.35s_ease-out]";

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-slate-200 bg-white/90 p-3 text-slate-700 shadow-sm ${anim}`}>
      {mood === "celebrate" ? (
        <div className="pointer-events-none absolute inset-0">
          {Array.from({ length: 10 }).map((_, idx) => (
            <span
              key={idx}
              className="absolute h-2 w-2 animate-[confetti_0.8s_ease-out_forwards] rounded-full"
              style={{
                left: `${10 + idx * 8}%`,
                top: "6%",
                background: idx % 2 === 0 ? "#8b5cf6" : "#22d3ee",
                animationDelay: `${idx * 40}ms`,
              }}
            />
          ))}
        </div>
      ) : null}
      <p className="text-sm font-black">{emoji} {message}</p>
    </div>
  );
}
