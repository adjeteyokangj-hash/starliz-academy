"use client";

import { speakTutorFeedback } from "@/lib/tutor-voice";

export default function AITutorFeedback({ text }: { text: string }) {
  return (
    <button
      onClick={() => speakTutorFeedback(text)}
      className="rounded-xl bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700"
    >
      🔊 Hear tutor feedback
    </button>
  );
}