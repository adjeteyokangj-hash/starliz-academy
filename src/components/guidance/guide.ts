export const characters = {
  "StarLiz Guide": "star-student",
  Nova: "unicorn",
  Byte: "robot",
  Pip: "dragon",
  Astro: "astronaut",
  Spark: "lightning",
  Pixel: "pixel",
  Lumi: "star",
  Gear: "inventor",
  Orbit: "planet",
  Finn: "finn",
} as const;
export type Character = keyof typeof characters;
export const humanCharacters: readonly Character[] = ["StarLiz Guide", "Nova", "Astro", "Gear"];
export const levels = ["full", "gentle", "minimal"] as const;
export type Level = typeof levels[number];

export type GuidePreferences = {
  enabled: boolean;
  speakInstructions?: boolean;
  voiceId?: string;
  voiceAccent?: string;
  voiceSpeed?: "slow" | "normal" | "fast";
  alternateAppearances?: Partial<Record<Character, boolean>>;
  character: Character;
  level: Level;
  completed: string[];
  progress: Record<string, string>;
  firstProject?: string;
  resting?: { x: number; y: number };
};

export const defaults: GuidePreferences = { enabled: true, character: "StarLiz Guide", level: "full", completed: [], progress: {} };

export function readPreferences(learner: string, established = false): GuidePreferences {
  try {
    const saved = JSON.parse(localStorage.getItem(`starliz-guide:${learner}`) ?? "null");
    if (saved && typeof saved.enabled === "boolean" && Object.hasOwn(characters, saved.character) && levels.includes(saved.level) && Array.isArray(saved.completed) && saved.progress && typeof saved.progress === "object") return { ...saved, resting: Number.isFinite(saved.resting?.x) && Number.isFinite(saved.resting?.y) ? { x: Math.max(0, Math.min(1, saved.resting.x)), y: Math.max(0, Math.min(1, saved.resting.y)) } : undefined };
  } catch { /* Storage can be unavailable in private browsing. */ }
  return established ? { ...defaults, level: "gentle" } : defaults;
}

export function writePreferences(learner: string, value: GuidePreferences) {
  try { localStorage.setItem(`starliz-guide:${learner}`, JSON.stringify(value)); } catch { /* Keep the current session usable. */ }
}

export type Step = { id: string; target: string; title: string; text: string; hint: string; action: string; onFailure?: string };

export function advance(steps: readonly Step[], step: Step, action: string) {
  if (action === "run-needs-work" && step.onFailure) return steps.find(item => item.id === step.onFailure);
  if (action !== step.action && action !== "skip" && !(action === "stage-passed" && step.id === "check")) return step;
  if (step.id === "improve" && action === "edit") return steps.find(item => item.id === "run") ?? step;
  if (step.id === "repair") return steps.find(item => item.id === "run");
  const next = steps[steps.indexOf(step) + 1];
  return next?.id === "repair" ? undefined : next;
}

export function guideEvent(action: string) {
  document.dispatchEvent(new CustomEvent("starliz-guide-action", { detail: action }));
}

export function guideTarget(target: string) {
  return Array.from(document.querySelectorAll<HTMLElement>(`[data-guide-target="${CSS.escape(target)}"]`))
    .find(element => element.getClientRects().length > 0 && !element.closest("[hidden]"));
}
