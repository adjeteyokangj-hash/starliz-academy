"use client";

import { speakTutorFeedback } from "@/lib/tutor-voice";
import VoiceHelpControls from "@/components/learning/VoiceHelpControls";

export default function AITutorFeedback({ text, enabled = false }: { text: string; enabled?: boolean }) {
  if (!enabled) return null;

  return (
    <VoiceHelpControls
      voiceHelpEnabled={enabled}
      showToggle={false}
      actions={[
        {
          id: "hear-tutor-feedback",
          label: "Hear tutor feedback",
          onClick: () => speakTutorFeedback(text),
          variant: "secondary",
        },
      ]}
    />
  );
}
