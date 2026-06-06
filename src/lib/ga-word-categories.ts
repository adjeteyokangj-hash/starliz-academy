export const GA_APPROVED_CATEGORIES = [
  "Greetings",
  "Time",
  "Days",
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

const CATEGORY_ALIASES: Record<string, (typeof GA_APPROVED_CATEGORIES)[number]> = {
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

  const direct = GA_APPROVED_CATEGORIES.find((category) => category.toLowerCase() === value.toLowerCase());
  if (direct) return direct;

  const normalizedKey = value
    .toLowerCase()
    .replace(/[\/_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return CATEGORY_ALIASES[normalizedKey] ?? value;
}
