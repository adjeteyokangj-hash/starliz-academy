/**
 * Fallback category list used only when DB-managed admin categories are not
 * available (bootstrap, resilience, and legacy migration paths).
 *
 * Runtime source of truth must be the admin-managed category table in DB.
 */
export const GA_FALLBACK_CATEGORIES = [
  "Greetings",
  "Time",
  "Days",
  "Alphabet",
  "Numbers",
  "Family",
  "People",
  "Body",
  "Health",
  "Animals",
  "Food",
  "Home",
  "Objects",
  "School",
  "Actions",
  "Grammar",
  "Shapes",
  "Transport",
  "Sports",
  "Feelings",
  "Places",
  "Professions",
] as const;

/**
 * Backward-compatible alias used by older imports.
 * Do not treat this as the primary runtime authority.
 */
export const GA_APPROVED_CATEGORIES = GA_FALLBACK_CATEGORIES;

/**
 * Normalization aliases for import/legacy text cleanup.
 * This map does not define runtime category authority.
 */
const CATEGORY_NORMALIZATION_ALIASES: Record<string, (typeof GA_FALLBACK_CATEGORIES)[number]> = {
  object: "Objects",
  objects: "Objects",
  "everyday object": "Objects",
  person: "People",
  people: "People",
  "people/family": "People",
  "people family": "People",
  family: "Family",
  families: "Family",
  profession: "Professions",
  professions: "Professions",
  transport: "Transport",
  transportation: "Transport",
  sport: "Sports",
  sports: "Sports",
  shape: "Shapes",
  shapes: "Shapes",
  place: "Places",
  places: "Places",
  feeling: "Feelings",
  feelings: "Feelings",
  grammar: "Grammar",
  home: "Home",
  school: "School",
  animals: "Animals",
  animal: "Animals",
  body: "Body",
  health: "Health",
  time: "Time",
  day: "Days",
  days: "Days",
  alphabet: "Alphabet",
  letter: "Alphabet",
  letters: "Alphabet",
  number: "Numbers",
  numbers: "Numbers",
  greeting: "Greetings",
  greetings: "Greetings",
  action: "Actions",
  actions: "Actions",
};

export function normalizeGaCategory(rawCategory: string): string {
  const value = String(rawCategory ?? "").trim();
  if (!value) return value;

  const direct = GA_FALLBACK_CATEGORIES.find((category) => category.toLowerCase() === value.toLowerCase());
  if (direct) return direct;

  const normalizedKey = value
    .toLowerCase()
    .replace(/[\/_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return CATEGORY_NORMALIZATION_ALIASES[normalizedKey] ?? value;
}
