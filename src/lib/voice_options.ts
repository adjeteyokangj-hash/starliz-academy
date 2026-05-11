export const VOICE_STYLE_OPTIONS = [
  { value: "friendly_coach", label: "Friendly Coach" },
  { value: "cheerful_kid", label: "Cheerful Kid" },
  { value: "calm_reader", label: "Calm Reader" },
  { value: "fun_robot", label: "Fun Robot" },
  { value: "storyteller", label: "Storyteller" },
  { value: "little_helper", label: "Little Helper" },
  { value: "superhero_coach", label: "Superhero Coach" },
  { value: "soft_encourager", label: "Soft Encourager" },
  { value: "accent_american", label: "American Accent" },
  { value: "accent_british", label: "British Accent" },
  { value: "accent_irish", label: "Irish Accent" },
  { value: "accent_south_african", label: "South African Accent" },
  { value: "accent_australian", label: "Australian Accent" },
  { value: "accent_canadian", label: "Canadian Accent" },
  { value: "accent_indian", label: "Indian English Accent" },
  { value: "accent_new_zealand", label: "New Zealand Accent" },
] as const;

export type VoiceStyle = (typeof VOICE_STYLE_OPTIONS)[number]["value"];

export function getVoiceStyleLabel(value: string): string {
  return VOICE_STYLE_OPTIONS.find((item) => item.value === value)?.label ?? "Friendly Coach";
}
