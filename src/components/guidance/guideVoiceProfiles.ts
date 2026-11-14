import type { Character } from "./guide";

type Profile = { style: string; names: readonly string[]; pitch: number; pace: number };
export const voiceProfiles: Record<Character, Profile> = {
  "StarLiz Guide": { style: "Warm feminine guide", names: ["Hazel", "Susan", "Kate"], pitch: 1.03, pace: 1 },
  Nova: { style: "Bright masculine explorer", names: ["Oliver", "George", "Daniel"], pitch: 1.08, pace: 1.02 },
  Byte: { style: "Character-style robot", names: ["Trinoids", "Zarvox", "Bells"], pitch: .94, pace: .99 },
  Pip: { style: "Playful character", names: ["Bubbles", "Junior", "Susan"], pitch: 1.16, pace: 1.04 },
  Astro: { style: "Calm masculine navigator", names: ["George", "Daniel", "Arthur"], pitch: .96, pace: .94 },
  Spark: { style: "Energetic character", names: ["Boing", "Junior", "Kate"], pitch: 1.09, pace: 1.09 },
  Pixel: { style: "Crisp digital character", names: ["Zarvox", "Trinoids", "Oliver"], pitch: 1.06, pace: .94 },
  Lumi: { style: "Gentle feminine companion", names: ["Susan", "Kate", "Hazel"], pitch: 1.12, pace: .92 },
  Gear: { style: "Confident feminine inventor", names: ["Kate", "Serena", "Susan"], pitch: .98, pace: 1.01 },
  Orbit: { style: "Relaxed character", names: ["Fred", "Daniel", "George"], pitch: .9, pace: .91 },
  Finn: { style: "Friendly masculine explorer", names: ["Daniel", "Arthur", "George"], pitch: 1.01, pace: 1.06 },
};

export function resolveGuideVoice(voices: readonly SpeechSynthesisVoice[], character: Character, voiceId?: string, accent?: string) {
  const local = voices.filter(voice => voice.localService && /^en(?:-|$)/i.test(voice.lang));
  const manual = voiceId ? local.find(voice => voice.voiceURI === voiceId) : undefined;
  if (manual) return { voice: manual, fallback: undefined };

  const accentMatches = accent ? local.filter(voice => voice.lang === accent) : [];
  const choices = accentMatches.length ? accentMatches : local;
  const british = choices.filter(voice => voice.lang.toLowerCase() === "en-gb");
  const preferred = voiceProfiles[character].names;
  const find = (pool: readonly SpeechSynthesisVoice[]) => preferred
    .map(name => pool.find(voice => voice.name.split(/[^a-z]+/i).some(word => word.toLowerCase() === name.toLowerCase())))
    .find(Boolean);
  const ideal = find(british) ?? find(choices);
  const voice = ideal ?? british.find(item => item.default) ?? british[0] ?? choices.find(item => item.default) ?? choices[0];

  const fallback = [
    voiceId && "Your saved voice is unavailable.",
    accent && !accentMatches.length && "Your selected accent is unavailable.",
    !ideal && voice && "The preferred character voice is unavailable. Using another installed voice.",
  ].filter(Boolean).join(" ");
  return { voice, fallback };
}
