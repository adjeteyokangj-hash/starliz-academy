import { keyStageForYearGroup, normalizeYearGroup } from "@/lib/curriculum";
import type { DaytimeSubjectMode } from "@/lib/schools/daytime-subject-mode";
import {
  SHORT_LEARNING_MANUAL_SUBJECT_KEYS,
  SHORT_LEARNING_SUBJECT_OPTIONS,
  isManualShortLearningSubject,
  normalizeShortLearningSubjectInput,
  shortLearningSubjectLabel,
  type ShortLearningSubjectKey,
} from "@/lib/schools/short-learning-subjects";

export { SHORT_LEARNING_MANUAL_SUBJECT_KEYS, shortLearningSubjectLabel };
export type { ShortLearningSubjectKey };

const YEAR_SKILLS: Record<ShortLearningSubjectKey, Record<"ks1" | "lks2" | "uks2" | "ks3" | "ks4", string[]>> = {
  english: {
    ks1: ["Phonics and blending", "Captions and simple sentences", "Story retrieval", "Handwriting and letter formation"],
    lks2: ["Reading comprehension", "Fronted adverbials", "Paragraphs", "Inference from clues"],
    uks2: ["Reading inference", "Relative clauses", "Formal and informal language", "Summarising a text"],
    ks3: ["Analysing a text", "Creative writing", "Grammar for clarity", "Comparing viewpoints"],
    ks4: ["Language analysis", "Literature themes", "Transactional writing", "Exam technique"],
  },
  maths: {
    ks1: ["Number bonds and addition", "Counting and place value", "Simple subtraction", "2, 5 and 10 times tables"],
    lks2: ["Multiplication and division facts", "Multiplication using arrays", "Fractions of shapes", "Written addition"],
    uks2: ["Fractions, decimals and written methods", "Percentages", "Multi-step problems", "Ratio and proportion"],
    ks3: ["Number, algebra and proportional reasoning", "Directed numbers", "Percentages", "Simple equations"],
    ks4: ["Algebra", "Ratio and proportion", "Geometry", "Exam technique"],
  },
  science: {
    ks1: ["Animals and their needs", "Everyday materials", "Seasonal changes", "Plants"],
    lks2: ["Rocks and soils", "Light and shadows", "Forces and magnets", "States of matter", "Electricity", "Sound"],
    uks2: ["Earth and space", "Properties of materials", "Living things and habitats", "Evolution and inheritance", "Circulation"],
    ks3: ["Cells", "Particles", "Forces", "Energy transfers"],
    ks4: ["Biology", "Chemistry", "Physics", "Required practicals"],
  },
  computing: {
    ks1: ["Giving instructions", "Using a keyboard", "Staying safe online", "Patterns and sequences"],
    lks2: ["Algorithms", "Debugging", "Using search", "Digital content"],
    uks2: ["Selection in programs", "Variables", "Computer networks", "Online safety"],
    ks3: ["Programming constructs", "Data representation", "Networks", "Cyber security"],
    ks4: ["Algorithms", "Programming", "Computer systems", "Exam technique"],
  },
  history: {
    ks1: ["Toys then and now", "Homes in the past", "Significant people", "Then and now"],
    lks2: ["Stone Age to Iron Age", "Ancient Egypt", "The Romans in Britain", "Local history"],
    uks2: ["Anglo-Saxons and Vikings", "Ancient Greece", "The Maya", "World War II"],
    ks3: ["Medieval life", "Tudors", "Industrial Revolution", "20th century conflict"],
    ks4: ["Historic environment", "Thematic study", "Interpretations", "Exam technique"],
  },
  geography: {
    ks1: ["The UK countries", "Weather", "Hot and cold places", "Maps and globes"],
    lks2: ["Settlements", "Rivers", "Volcanoes and earthquakes", "Europe"],
    uks2: ["Biomes", "Trade", "Climate", "OS maps and grid references"],
    ks3: ["Tectonics", "Development", "Weather and climate", "Urbanisation"],
    ks4: ["Physical geography", "Human geography", "Fieldwork", "Exam technique"],
  },
  "religious-education": {
    ks1: ["Belonging", "Special books", "Festivals", "Caring for others"],
    lks2: ["Christianity", "Judaism", "Hinduism", "Places of worship"],
    uks2: ["Islam", "Sikhism", "Buddhism", "Beliefs and values"],
    ks3: ["Philosophy of religion", "Ethics", "Worldviews", "Sacred texts"],
    ks4: ["Beliefs and teachings", "Practices", "Themes", "Exam technique"],
  },
  "modern-foreign-languages": {
    ks1: ["Greetings", "Colours", "Numbers to 10", "Classroom words"],
    lks2: ["Greetings and introductions", "Family", "Food", "Numbers to 20"],
    uks2: ["School subjects", "Hobbies", "Days and months", "Simple sentences"],
    ks3: ["Present tense", "Opinions", "Translation", "Listening for gist"],
    ks4: ["Vocabulary", "Grammar", "Role play", "Exam technique"],
  },
  "art-and-design": {
    ks1: ["Colour mixing", "Drawing from observation", "Texture", "Famous paintings"],
    lks2: ["Tone and shading", "Sculpture", "Printing", "Artists and craftspeople"],
    uks2: ["Perspective", "Mixed media", "Design for a purpose", "Art movements"],
    ks3: ["Formal elements", "Artist study", "Annotation", "Final piece planning"],
    ks4: ["Portfolio", "Artist research", "Experimentation", "Exam technique"],
  },
  "design-and-technology": {
    ks1: ["Joining materials", "Healthy food", "Wheels and axles", "Design and make"],
    lks2: ["Levers and linkages", "Healthy sandwiches", "Shell structures", "Evaluating products"],
    uks2: ["Electrical systems", "Food seasonality", "Frame structures", "User-centred design"],
    ks3: ["Iterative design", "Materials", "Electronics", "Nutrition"],
    ks4: ["Design process", "Materials", "Manufacturing", "Exam technique"],
  },
  music: {
    ks1: ["Pulse and rhythm", "Singing", "Loud and quiet", "Classroom instruments"],
    lks2: ["Pitch", "Ostinato", "Notation symbols", "Composing a pattern"],
    uks2: ["Melody", "Harmony", "Structure", "Listening to genres"],
    ks3: ["Keyboard skills", "Ensemble", "Music technology", "Appraising"],
    ks4: ["Performance", "Composition", "Set works", "Exam technique"],
  },
  "physical-education": {
    ks1: ["Moving with control", "Simple games", "Healthy bodies", "Teamwork"],
    lks2: ["Invasion games", "Gymnastics sequences", "Athletics", "Fair play"],
    uks2: ["Tactics", "Striking and fielding", "Fitness", "Leadership"],
    ks3: ["Sports science basics", "Training", "Officiating", "Healthy active lifestyle"],
    ks4: ["Anatomy", "Training methods", "Socio-cultural issues", "Exam technique"],
  },
  citizenship: {
    ks1: ["Rules and fairness", "Helping others", "My community", "Feelings"],
    lks2: ["Rights and responsibilities", "Democracy in school", "Money basics", "Respecting difference"],
    uks2: ["Parliament", "Laws", "Media and information", "Community action"],
    ks3: ["Politics", "Justice", "Identity", "Active citizenship"],
    ks4: ["Life in modern Britain", "Rights and responsibilities", "Politics and participation", "Exam technique"],
  },
};

function yearBand(yearGroup: string | null | undefined): "ks1" | "lks2" | "uks2" | "ks3" | "ks4" {
  const year = Number(/(\d{1,2})/.exec(yearGroup ?? "")?.[1] ?? 4);
  if (year <= 2) return "ks1";
  if (year <= 4) return "lks2";
  if (year <= 6) return "uks2";
  if (year <= 9) return "ks3";
  return "ks4";
}

export function canonicalShortLearningSubjectKey(
  raw: string | null | undefined,
): ShortLearningSubjectKey | null {
  const normalized = normalizeShortLearningSubjectInput(raw);
  if (!normalized || !isManualShortLearningSubject(normalized)) return null;
  return normalized;
}

export function shortLearningSubjectMatchValues(raw: string | null | undefined): string[] {
  const key = canonicalShortLearningSubjectKey(raw);
  const label = key ? shortLearningSubjectLabel(key) : null;
  const extras = key === "english" ? ["english", "reading", "spelling", "English"] : [];
  return Array.from(
    new Set(
      [raw?.trim(), key, label, ...(extras)].filter((value): value is string => Boolean(value)),
    ),
  );
}

export function shortLearningYearMatchValues(yearGroup: string | null | undefined): string[] {
  const normalized = normalizeYearGroup(yearGroup);
  const num = /(\d{1,2})/.exec(yearGroup ?? "")?.[1];
  return Array.from(
    new Set(
      [yearGroup?.trim(), normalized, num ? `Year ${num}` : null, num ? `Y${num}` : null].filter(
        (value): value is string => Boolean(value),
      ),
    ),
  );
}

export function shortLearningSkillsForYear(
  subject: string | null | undefined,
  yearGroup: string | null | undefined,
): string[] {
  const key = canonicalShortLearningSubjectKey(subject);
  if (!key) return [];
  return YEAR_SKILLS[key][yearBand(yearGroup)];
}

function skillIndexForYear(yearGroup: string | null | undefined, count: number): number {
  if (count <= 1) return 0;
  const year = Number(/(\d{1,2})/.exec(yearGroup ?? "")?.[1] ?? 4);
  if (year <= 2) return Math.min(count - 1, Math.max(0, year - 1));
  if (year <= 4) return Math.min(count - 1, Math.max(0, year - 3));
  if (year <= 6) return Math.min(count - 1, Math.max(0, year - 5));
  if (year <= 9) return Math.min(count - 1, Math.max(0, year - 7));
  return Math.min(count - 1, Math.max(0, year - 10));
}

export function defaultShortLearningSkillFocus(subject: string, yearGroup: string): string {
  const skills = shortLearningSkillsForYear(subject, yearGroup);
  if (skills.length) return skills[skillIndexForYear(yearGroup, skills.length)] ?? skills[0]!;
  const key = canonicalShortLearningSubjectKey(subject);
  return key ? shortLearningSubjectLabel(key) : subject.trim() || "Core learning";
}

/** Parent notes such as "UAT weekend" are not a curriculum skill and must not drive generation. */
export function isGenericShortLearningSkillFocus(skillFocus: string, subject: string): boolean {
  const skill = skillFocus.trim().toLowerCase();
  const subj = subject.trim().toLowerCase();
  if (!skill) return true;
  if (skill === subj) return true;
  if (["math", "maths", "english", "reading", "spelling", "science", "lesson"].includes(skill)) return true;
  if (/\buat\b/.test(skill)) return true;
  if (/^(weekend|weekday|session|homework|catch[- ]?up|test|focus)s?$/.test(skill)) return true;
  if (/^(uat|test)[\s-]/i.test(skillFocus.trim())) return true;
  return false;
}

export function resolveShortLearningSkillFocus(input: {
  learningFocus?: string | null;
  subject: string;
  yearGroup: string;
}): string {
  const raw = input.learningFocus?.trim() ?? "";
  if (raw && !isGenericShortLearningSkillFocus(raw, input.subject)) return raw;
  return defaultShortLearningSkillFocus(input.subject, input.yearGroup);
}

export type EnglishSkillIntent = "grammar" | "comprehension" | "writing";

const ENGLISH_COMPREHENSION_SKILL =
  /\b(inference|infer|comprehension|retrieval|summaris|viewpoint|theme|analys|author craft|prediction|gist|evidence|literature)\b/;
const ENGLISH_WRITING_SKILL =
  /\b(writing|handwrit|caption|transactional|creative writing|paragraphs|composition)\b/;
const ENGLISH_GRAMMAR_SKILL =
  /\b(clause|clauses|grammar|adverbial|adverbials|punctuation|sentence|sentences|tense|noun|verb|adjective|pronoun|conjunction|apostrophe|comma|speech|formal|informal|modal|passive|active voice|determiner|preposition|syntax|subordinate)\b/;

/**
 * Classify an English skill so generation can keep practice on that skill.
 * Grammar/language skills must not silently become generic reading comprehension.
 */
export function classifyEnglishSkillIntent(skillFocus: string | null | undefined): EnglishSkillIntent {
  const skill = (skillFocus ?? "").trim().toLowerCase();
  if (!skill) return "comprehension";
  if (ENGLISH_COMPREHENSION_SKILL.test(skill)) return "comprehension";
  if (ENGLISH_WRITING_SKILL.test(skill)) return "writing";
  if (ENGLISH_GRAMMAR_SKILL.test(skill)) return "grammar";
  return "comprehension";
}

/** Grammar/writing skills use the shared passage as context for practising that feature. */
export function englishSkillUsesPassageAsLanguageContext(skillFocus: string | null | undefined): boolean {
  const intent = classifyEnglishSkillIntent(skillFocus);
  return intent === "grammar" || intent === "writing";
}

export function shortLearningSubjectMode(subject: string, skillFocus?: string | null): DaytimeSubjectMode {
  const key = canonicalShortLearningSubjectKey(subject);
  const skill = `${skillFocus ?? ""}`.toLowerCase();
  if (key === "maths") return "maths";
  if (key === "english") {
    if (skill.includes("spell") || skill.includes("phonic")) return "spelling";
    return "guided-reading";
  }
  if (key === "science") return "science";
  if (key === "computing") return "computing";
  if (key === "physical-education") return "practical-pe";
  if (key === "art-and-design" || key === "design-and-technology") return "practical-arts";
  if (key === "music") return "practical-music";
  if (
    key === "history"
    || key === "geography"
    || key === "religious-education"
    || key === "citizenship"
  ) {
    return "humanities";
  }
  if (key === "modern-foreign-languages") return "generic-lesson";
  return "generic-lesson";
}

export function adminShortLearningSubjectOptions(): Array<{ key: ShortLearningSubjectKey; label: string }> {
  return SHORT_LEARNING_SUBJECT_OPTIONS.filter(
    (option): option is { key: ShortLearningSubjectKey; label: string } => option.key !== "starliz_choose",
  );
}

export function shortLearningKeyStage(yearGroup: string): string {
  return keyStageForYearGroup(yearGroup);
}
