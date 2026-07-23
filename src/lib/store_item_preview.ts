/** Shared visual previews for store/shop catalog items (student + admin). */

export const THEME_CARD_CLASS_BY_ID: Record<string, string> = {
  "theme-rainbow": "border-pink-200 bg-gradient-to-br from-pink-50 via-purple-50 to-cyan-50",
  "theme-sunshine": "border-amber-200 bg-gradient-to-br from-yellow-50 via-amber-50 to-orange-50",
  "theme-night-sky": "border-indigo-200 bg-gradient-to-br from-indigo-50 via-blue-50 to-slate-100",
  "theme-space": "border-violet-200 bg-gradient-to-br from-violet-50 via-fuchsia-50 to-slate-100",
  "theme-candy": "border-rose-200 bg-gradient-to-br from-rose-50 via-pink-50 to-fuchsia-50",
  "theme-princess": "border-fuchsia-200 bg-gradient-to-br from-fuchsia-50 via-pink-50 to-violet-50",
  "theme-dinosaur": "border-lime-200 bg-gradient-to-br from-lime-50 via-emerald-50 to-teal-50",
  "theme-jungle": "border-green-200 bg-gradient-to-br from-green-50 via-emerald-50 to-lime-50",
  "theme-football": "border-emerald-200 bg-gradient-to-br from-emerald-50 via-green-50 to-teal-50",
  "theme-ocean": "border-cyan-200 bg-gradient-to-br from-cyan-50 via-sky-50 to-blue-50",
  "theme-galaxy-pro": "border-slate-300 bg-gradient-to-br from-slate-100 via-indigo-50 to-purple-50",
};

/** Real palette chips matching `globals.css` theme tokens. */
export const THEME_PALETTE_BY_ID: Record<string, { background: string; foreground: string; swatches: string[]; button: string }> = {
  "theme-rainbow": {
    background: "#fff8fc",
    foreground: "#4c1d95",
    swatches: ["#ec4899", "#8b5cf6", "#06b6d4", "#f59e0b"],
    button: "linear-gradient(135deg, #ec4899 0%, #8b5cf6 55%, #06b6d4 100%)",
  },
  "theme-sunshine": {
    background: "#fffdf4",
    foreground: "#7c2d12",
    swatches: ["#fbbf24", "#f59e0b", "#fb923c", "#fde68a"],
    button: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)",
  },
  "theme-night-sky": {
    background: "#f4f8ff",
    foreground: "#0f172a",
    swatches: ["#1d4ed8", "#6366f1", "#0ea5e9", "#334155"],
    button: "linear-gradient(135deg, #1d4ed8 0%, #6366f1 100%)",
  },
  "theme-space": {
    background: "#f6f0ff",
    foreground: "#251b43",
    swatches: ["#6366f1", "#8b5cf6", "#ec4899", "#f472b6"],
    button: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
  },
  "theme-candy": {
    background: "#fff6fb",
    foreground: "#6b093d",
    swatches: ["#ec4899", "#f472b6", "#d946ef", "#fb7185"],
    button: "linear-gradient(135deg, #ec4899 0%, #f472b6 100%)",
  },
  "theme-princess": {
    background: "#fcf7ff",
    foreground: "#581c87",
    swatches: ["#a855f7", "#c084fc", "#ec4899", "#f9a8d4"],
    button: "linear-gradient(135deg, #a855f7 0%, #c084fc 100%)",
  },
  "theme-dinosaur": {
    background: "#f9fff3",
    foreground: "#365314",
    swatches: ["#65a30d", "#22c55e", "#84cc16", "#10b981"],
    button: "linear-gradient(135deg, #65a30d 0%, #22c55e 100%)",
  },
  "theme-jungle": {
    background: "#f4fff8",
    foreground: "#14532d",
    swatches: ["#16a34a", "#22c55e", "#0ea5e9", "#4ade80"],
    button: "linear-gradient(135deg, #16a34a 0%, #22c55e 100%)",
  },
  "theme-football": {
    background: "#f6fff6",
    foreground: "#14532d",
    swatches: ["#166534", "#22c55e", "#86efac", "#14532d"],
    button: "linear-gradient(135deg, #166534 0%, #22c55e 100%)",
  },
  "theme-ocean": {
    background: "#eefbff",
    foreground: "#15324a",
    swatches: ["#0891b2", "#0ea5e9", "#22c55e", "#67e8f9"],
    button: "linear-gradient(135deg, #0891b2 0%, #0ea5e9 100%)",
  },
  "theme-galaxy-pro": {
    background: "#f8f5ff",
    foreground: "#1e1b4b",
    swatches: ["#4f46e5", "#6366f1", "#a855f7", "#312e81"],
    button: "linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)",
  },
};

export const THEME_EMOJI_BY_ID: Record<string, string> = {
  "theme-rainbow": "🌈",
  "theme-sunshine": "☀️",
  "theme-night-sky": "🌙",
  "theme-space": "🚀",
  "theme-candy": "🍬",
  "theme-princess": "👑",
  "theme-dinosaur": "🦕",
  "theme-jungle": "🌴",
  "theme-football": "⚽",
  "theme-ocean": "🌊",
  "theme-galaxy-pro": "✨",
};

export const AVATAR_SAMPLE_BY_ID: Record<string, string> = {
  "avatar-unicorn": "🦄",
  "avatar-star-student": "🧑‍🎓",
  "avatar-robot": "🤖",
  "avatar-astronaut": "👨‍🚀",
  "outfit-superhero-cape": "🦸",
  "avatar-dragon": "🐉",
  "outfit-crown": "👑",
  "outfit-wizard-hat": "🧙",
  "avatar-book-hero": "📚",
};

export const PET_SAMPLE_BY_ID: Record<string, string> = {
  "pet-food": "🥣",
  "pet-treats": "🦴",
  "pet-ball": "🎾",
  "pet-brush": "🪮",
  "pet-bed": "🛏️",
  "pet-hat": "🎩",
  "pet-sparkle-collar": "✨",
  "pet-house": "🏠",
  "pet-playground": "🎠",
};

export const BOOST_SAMPLE_BY_ID: Record<string, string> = {
  "boost-double-xp-10m": "⚡",
  "boost-streak-shield": "🛡️",
  "boost-hint-token-x3": "💡",
  "boost-bonus-coin-round": "🪙",
  "boost-focus-mode": "🎯",
  "boost-revision-pass": "📝",
  "boost-weekend-bonus": "🎉",
};

export type StorePreviewKind = "theme" | "voice" | "avatar" | "pet" | "boost" | "generic";

export function getStorePreviewKind(category: string, id: string): StorePreviewKind {
  const normalized = category.trim().toLowerCase();
  if (normalized === "themes" || normalized === "theme" || id.startsWith("theme-")) return "theme";
  if (normalized === "voices" || normalized === "voice" || id.startsWith("voice-")) return "voice";
  if (normalized === "avatars" || normalized === "avatar" || id.startsWith("avatar-") || id.startsWith("outfit-")) return "avatar";
  if (normalized === "pet" || normalized === "pets" || id.startsWith("pet-")) return "pet";
  if (normalized === "boosts" || normalized === "boost" || id.startsWith("boost-")) return "boost";
  return "generic";
}

export function getStorePreviewEmoji(category: string, id: string): string | null {
  const kind = getStorePreviewKind(category, id);
  if (kind === "theme") return THEME_EMOJI_BY_ID[id] ?? "🎨";
  if (kind === "avatar") return AVATAR_SAMPLE_BY_ID[id] ?? "🙂";
  if (kind === "pet") return PET_SAMPLE_BY_ID[id] ?? "🐾";
  if (kind === "boost") return BOOST_SAMPLE_BY_ID[id] ?? "⚡";
  if (kind === "voice") return "🎙️";
  return null;
}

export function getThemePreviewClass(id: string): string {
  return THEME_CARD_CLASS_BY_ID[id] ?? "border-slate-200 bg-white";
}

export function getThemePalette(id: string) {
  return THEME_PALETTE_BY_ID[id] ?? {
    background: "#f8f9ff",
    foreground: "#1f2a37",
    swatches: ["#6c5ce7", "#00cec9", "#fdcb6e", "#8b5cf6"],
    button: "linear-gradient(135deg, #6c5ce7 0%, #8b5cf6 100%)",
  };
}

/** Public URL for a catalog store item illustration, or null if none. */
export function getStoreItemImageUrl(category: string, id: string): string | null {
  const kind = getStorePreviewKind(category, id);
  if (kind === "theme" && THEME_EMOJI_BY_ID[id]) return `/store/themes/${id}.png`;
  if (kind === "avatar" && AVATAR_SAMPLE_BY_ID[id]) return `/store/avatars/${id}.png`;
  if (kind === "pet" && PET_SAMPLE_BY_ID[id]) return `/store/pets/${id}.png`;
  if (kind === "boost" && BOOST_SAMPLE_BY_ID[id]) return `/store/boosts/${id}.png`;
  if (kind === "voice") return `/store/voices/voice-pack.png`;
  return null;
}

