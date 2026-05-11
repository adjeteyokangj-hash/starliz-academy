"use client";

export default function GameSuccessBurst() {
  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center">
      <div className="animate-ping rounded-full bg-yellow-300 p-16 opacity-40" />
      <div className="absolute animate-bounce text-5xl">⭐</div>
    </div>
  );
}