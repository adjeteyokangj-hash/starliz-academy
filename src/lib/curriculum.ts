export const YEAR_GROUPS = [
  "Reception",
  "Year 1",
  "Year 2",
  "Year 3",
  "Year 4",
  "Year 5",
  "Year 6",
  "Year 7",
  "Year 8",
  "Year 9",
  "Year 10",
  "Year 11",
] as const;

export const KEY_STAGES = ["EYFS", "KS1", "KS2", "KS3", "KS4"] as const;

export type YearGroup = (typeof YEAR_GROUPS)[number];
export type KeyStage = (typeof KEY_STAGES)[number];

export function normalizeYearGroup(value: string | null | undefined): YearGroup | null {
  if (!value) return null;
  const cleaned = value.trim().toLowerCase();
  if (cleaned === "reception") return "Reception";
  const yearMatch = cleaned.match(/^year\s*(\d{1,2})$/);
  if (!yearMatch) return null;
  const yearNumber = Number(yearMatch[1]);
  if (!Number.isFinite(yearNumber) || yearNumber < 1 || yearNumber > 11) return null;
  return `Year ${yearNumber}` as YearGroup;
}

export function keyStageForYearGroup(yearGroup: string | null | undefined): KeyStage {
  const normalized = normalizeYearGroup(yearGroup);
  if (!normalized) return "KS1";
  if (normalized === "Reception") return "EYFS";
  if (normalized === "Year 1" || normalized === "Year 2") return "KS1";
  if (["Year 3", "Year 4", "Year 5", "Year 6"].includes(normalized)) return "KS2";
  if (["Year 7", "Year 8", "Year 9"].includes(normalized)) return "KS3";
  return "KS4";
}

export function yearGroupsForKeyStage(keyStage: string | null | undefined): YearGroup[] {
  switch (keyStage) {
    case "EYFS":
      return ["Reception"];
    case "KS1":
      return ["Year 1", "Year 2"];
    case "KS2":
      return ["Year 3", "Year 4", "Year 5", "Year 6"];
    case "KS3":
      return ["Year 7", "Year 8", "Year 9"];
    case "KS4":
      return ["Year 10", "Year 11"];
    default:
      return [...YEAR_GROUPS];
  }
}

export const PHONICS_STAGE_SKILL_FOCUS = [
  "Phase 2 phonics",
  "Phase 3 phonics",
  "Phase 4 blends",
  "Phase 5 alternative sounds",
] as const;

export type PhonicsStage = "phase2" | "phase3" | "phase4" | "phase5";

export function phonicsStageFromSkillFocus(skillFocus: string | null | undefined): PhonicsStage | null {
  const focus = (skillFocus ?? "").trim().toLowerCase();
  if (focus.startsWith("phase 2")) return "phase2";
  if (focus.startsWith("phase 3")) return "phase3";
  if (focus.startsWith("phase 4")) return "phase4";
  if (focus.startsWith("phase 5")) return "phase5";
  return null;
}

// Age group mappings by year group
export const AGE_GROUPS = [
  "4–5",
  "5–6",
  "6–7",
  "7–8",
  "8–9",
  "9–10",
  "10–11",
  "11–12",
  "12–13",
  "13–14",
  "14–15",
  "15–16",
] as const;

export type AgeGroup = (typeof AGE_GROUPS)[number];

const YEAR_TO_AGE_MAP: Record<YearGroup, AgeGroup> = {
  "Reception": "4–5",
  "Year 1": "5–6",
  "Year 2": "6–7",
  "Year 3": "7–8",
  "Year 4": "8–9",
  "Year 5": "9–10",
  "Year 6": "10–11",
  "Year 7": "11–12",
  "Year 8": "12–13",
  "Year 9": "13–14",
  "Year 10": "14–15",
  "Year 11": "15–16",
};

export function ageGroupForYearGroup(yearGroup: string | null | undefined): AgeGroup {
  const normalized = normalizeYearGroup(yearGroup);
  if (!normalized) return "5–6";
  return YEAR_TO_AGE_MAP[normalized] ?? "5–6";
}

// Subject types
export type Subject = "phonics" | "spelling" | "reading" | "writing" | "grammar" | "punctuation" | "vocabulary" | "maths" | "times-tables" | "science" | "english-literature" | "english-language" | "sats-practice" | "11-plus-practice" | "gcse-english" | "gcse-maths" | "gcse-science";

// Subject availability by year group
const SUBJECTS_BY_YEAR: Record<YearGroup, readonly Subject[]> = {
  "Reception": ["phonics", "spelling", "reading", "writing", "maths"] as const,
  "Year 1": ["phonics", "spelling", "reading", "writing", "maths"] as const,
  "Year 2": ["phonics", "spelling", "reading", "writing", "maths"] as const,
  "Year 3": ["spelling", "reading", "writing", "grammar", "punctuation", "vocabulary", "maths", "times-tables", "science", "sats-practice", "11-plus-practice"] as const,
  "Year 4": ["spelling", "reading", "writing", "grammar", "punctuation", "vocabulary", "maths", "times-tables", "science", "sats-practice", "11-plus-practice"] as const,
  "Year 5": ["spelling", "reading", "writing", "grammar", "punctuation", "vocabulary", "maths", "times-tables", "science", "sats-practice", "11-plus-practice"] as const,
  "Year 6": ["spelling", "reading", "writing", "grammar", "punctuation", "vocabulary", "maths", "times-tables", "science", "sats-practice", "11-plus-practice"] as const,
  "Year 7": ["reading", "writing", "vocabulary", "grammar", "maths", "science", "english-literature", "english-language"] as const,
  "Year 8": ["reading", "writing", "vocabulary", "grammar", "maths", "science", "english-literature", "english-language"] as const,
  "Year 9": ["reading", "writing", "vocabulary", "grammar", "maths", "science", "english-literature", "english-language"] as const,
  "Year 10": ["gcse-english", "gcse-maths", "gcse-science", "english-literature", "english-language", "maths", "science"] as const,
  "Year 11": ["gcse-english", "gcse-maths", "gcse-science", "english-literature", "english-language", "maths", "science"] as const,
};

export function subjectsForYearGroup(yearGroup: string | null | undefined): readonly Subject[] {
  const normalized = normalizeYearGroup(yearGroup);
  if (!normalized) return SUBJECTS_BY_YEAR["Year 1"];
  return SUBJECTS_BY_YEAR[normalized] ?? SUBJECTS_BY_YEAR["Year 1"];
}

// Skill focus options by subject and year group
type SkillsBySubjectAndYear = Record<Subject, Record<string, readonly string[]>>;

const SKILLS_BY_SUBJECT_AND_YEAR: SkillsBySubjectAndYear = {
  "phonics": {
    "Reception": ["Sound recognition", "Phase 2 phonics", "Phase 3 phonics"],
    "Year 1": ["Phase 3 phonics", "Phase 4 blends", "Phase 5 alternative sounds", "Blending", "Segmenting"],
    "Year 2": ["Phase 5 alternative sounds", "Alternative graphemes", "Digraphs", "Trigraphs", "Polysyllabic words"],
  },
  "spelling": {
    "Reception": ["Initial sounds", "Final sounds", "CVC words"],
    "Year 1": ["CVC words", "CCVC words", "Rhyming words", "Simple tricky words"],
    "Year 2": ["CVCC words", "Tricky words", "Common exception words", "Doubling rules"],
    "Year 3": ["Silent e", "Prefixes", "Suffixes", "Plurals", "Past tense"],
    "Year 4": ["Suffixes", "Prefixes", "Homophones", "Compound words"],
    "Year 5": ["Word families", "Etymology", "Morphology", "Complex prefixes", "Commonly confused words"],
    "Year 6": ["Etymology", "Word families", "Silent letters", "Challenging words"],
  },
  "reading": {
    "Reception": ["Letter recognition", "Sound identification", "Simple sight words"],
    "Year 1": ["CVC decoding", "Sight words", "Simple sentences", "Fluency"],
    "Year 2": ["Decoding", "Comprehension", "Inference", "Prediction"],
    "Year 3": ["Comprehension", "Retrieval", "Inference", "Vocabulary"],
    "Year 4": ["Comprehension", "Inference", "Inference chains", "Character analysis"],
    "Year 5": ["Text analysis", "Inference", "Vocabulary", "Author intent"],
    "Year 6": ["Analysis", "Comparison", "Evidence retrieval", "Literary techniques"],
    "Year 7": ["Literary analysis", "Inference", "Theme", "Symbolism"],
    "Year 8": ["Complex inference", "Literary devices", "Tone and mood", "Author technique"],
    "Year 9": ["Unseen text analysis", "Poetry interpretation", "Comparative analysis"],
    "Year 10": ["GCSE comprehension", "Language analysis", "Structural analysis"],
    "Year 11": ["GCSE analysis", "Extended response", "Critical evaluation"],
  },
  "writing": {
    "Reception": ["Mark making", "Letter formation", "CVC copying"],
    "Year 1": ["Sentence formation", "Simple narratives", "Label and caption"],
    "Year 2": ["Sentence composition", "Simple stories", "Recount"],
    "Year 3": ["Story structure", "Paragraphing", "Description"],
    "Year 4": ["Plot development", "Character description", "Setting description"],
    "Year 5": ["Narrative structure", "Dialogue", "Description depth"],
    "Year 6": ["Story planning", "Dialogue formatting", "Complex narratives"],
    "Year 7": ["Character development", "Dialogue conventions", "Descriptive writing"],
    "Year 8": ["Narrative techniques", "Dialogue", "Varied sentence structures"],
    "Year 9": ["Sophisticated narrative", "Persuasive techniques", "Creative writing"],
    "Year 10": ["Creative response", "Persuasive writing", "Analytical writing"],
    "Year 11": ["Extended writing", "Critical response", "Transactional writing"],
  },
  "grammar": {
    "Year 3": ["Nouns", "Verbs", "Adjectives", "Capital letters", "Full stops"],
    "Year 4": ["Determiners", "Adverbs", "Prepositions", "Tenses"],
    "Year 5": ["Coordinating conjunctions", "Subordinating conjunctions", "Subject and object", "Active voice"],
    "Year 6": ["Tense consistency", "Relative clauses", "Expanded noun phrases"],
    "Year 7": ["Clauses", "Sentence types", "Tense control"],
    "Year 8": ["Complex sentences", "Clause relationships", "Mood and voice"],
    "Year 9": ["Syntax", "Semantic effects", "Register and formality"],
    "Year 10": ["Register variation", "Language analysis", "Lexical choices"],
    "Year 11": ["Grammar for effect", "Stylistic analysis", "Language transformation"],
  },
  "punctuation": {
    "Year 3": ["Full stops", "Capital letters", "Question marks", "Exclamation marks"],
    "Year 4": ["Commas in lists", "Apostrophes for possession", "Inverted commas"],
    "Year 5": ["Commas in clauses", "Apostrophes for contraction", "Parentheses"],
    "Year 6": ["Dash usage", "Colon and semicolon", "Bullet points"],
    "Year 7": ["Complex punctuation", "Semi-colons", "Colons"],
    "Year 8": ["Punctuation for effect", "Ellipsis", "Parenthesis"],
    "Year 9": ["Punctuation analysis", "Stylistic punctuation", "Effect and impact"],
    "Year 10": ["Strategic punctuation", "Language analysis", "Writing conventions"],
    "Year 11": ["Punctuation sophistication", "Semantic awareness", "Register control"],
  },
  "vocabulary": {
    "Year 3": ["High frequency words", "Synonyms", "Opposites"],
    "Year 4": ["Word families", "Morphology", "Context clues"],
    "Year 5": ["Etymology", "Semantic fields", "Connotation and denotation"],
    "Year 6": ["Challenging vocabulary", "Word relationships", "Nuanced meanings"],
    "Year 7": ["Tier 2 vocabulary", "Subject terminology", "Precise word choice"],
    "Year 8": ["Academic vocabulary", "Semantic precision", "Register awareness"],
    "Year 9": ["Advanced vocabulary", "Technical terms", "Figurative language"],
    "Year 10": ["Sophisticated vocabulary", "Subject specific", "Analytical terms"],
    "Year 11": ["Complex vocabulary", "Literary terminology", "Critical vocabulary"],
  },
  "maths": {
    "Reception": ["Number recognition", "Counting", "Subitising", "Number bonds to 5"],
    "Year 1": ["Number bonds to 10", "Adding", "Subtracting", "Place value (to 20)"],
    "Year 2": ["Place value (to 100)", "Addition and subtraction", "Number bonds", "Representing numbers"],
    "Year 3": ["Multiplication and division", "Fractions (1/2 and 1/4)", "Place value", "Money"],
    "Year 4": ["Multiplication facts", "Division", "Fractions (halves and quarters)", "Decimals"],
    "Year 5": ["Fractions", "Decimals", "Percentages", "Multiplication and division"],
    "Year 6": ["Ratio and proportion", "Fractions and decimals", "Percentages", "Algebraic thinking"],
    "Year 7": ["Algebra basics", "Fractions and decimals", "Ratio", "Data handling"],
    "Year 8": ["Algebra", "Equations", "Sequences", "Probability and statistics"],
    "Year 9": ["Algebra", "Geometry", "Trigonometry basics", "Statistical analysis"],
    "Year 10": ["Quadratic equations", "Simultaneous equations", "Trigonometry", "Functions"],
    "Year 11": ["Quadratic equations", "Surds", "Trigonometry", "Calculus introduction"],
  },
  "times-tables": {
    "Year 3": ["2 times table", "5 times table", "10 times table"],
    "Year 4": ["Times table fluency", "Multiplication facts", "Related facts"],
    "Year 5": ["Times table consolidation", "Divisibility", "Factor pairs"],
    "Year 6": ["Rapid recall", "Factor pairs", "Prime numbers"],
  },
  "science": {
    "Year 3": ["Living things", "Animals and habitats", "Plants", "Rocks and soils"],
    "Year 4": ["Living things and habitats", "States of matter", "Sound", "Electrical circuits"],
    "Year 5": ["Life cycles", "Forces", "Earth and space", "Properties of materials"],
    "Year 6": ["Electricity", "Forces", "Light", "Evolution and inheritance"],
    "Year 7": ["Cells", "Organisation", "Particle model", "Forces"],
    "Year 8": ["Photosynthesis", "Respiration", "States of matter", "Atomic structure"],
    "Year 9": ["Genetics", "Energy", "Waves", "Chemical reactions"],
    "Year 10": ["Biology: homeostasis, reproduction", "Chemistry: bonding, reactions", "Physics: energy, forces"],
    "Year 11": ["GCSE Biology", "GCSE Chemistry", "GCSE Physics"],
  },
  "english-literature": {
    "Year 7": ["Poetry", "Prose", "Drama", "Literary devices"],
    "Year 8": ["Poetry analysis", "Novel study", "Playwright techniques"],
    "Year 9": ["Unseen poetry", "Literary comparison", "Themes and context"],
    "Year 10": ["GCSE anthology poetry", "Novel analysis", "Drama texts"],
    "Year 11": ["Comparative poetry", "Extended texts", "Literary analysis"],
  },
  "english-language": {
    "Year 7": ["Registers", "Audience and purpose", "Narrative", "Description"],
    "Year 8": ["Persuasion", "Argument", "Language analysis", "Writing techniques"],
    "Year 9": ["Advanced writing", "Text analysis", "Sustained writing"],
    "Year 10": ["GCSE language analysis", "Transactional writing", "Persuasive techniques"],
    "Year 11": ["Extended analysis", "Complex writing", "Stylistic devices"],
  },
  "sats-practice": {
    "Year 3": ["Reasoning", "Problem solving", "Times tables", "Reading comprehension"],
    "Year 4": ["Multi-step problems", "Reasoning", "Reading fluency"],
    "Year 5": ["Challenging problems", "Reasoning", "Inference"],
    "Year 6": ["Mock SATs", "Reasoning", "Comprehension"],
  },
  "11-plus-practice": {
    "Year 3": ["Verbal reasoning", "Number patterns", "Logic puzzles"],
    "Year 4": ["Analogy", "Pattern completion", "Reasoning"],
    "Year 5": ["Verbal analogies", "Abstract reasoning", "Quantitative reasoning"],
    "Year 6": ["Selective school preparation", "Mock papers", "Timed practice"],
  },
  "gcse-english": {
    "Year 10": ["Literature", "Language analysis", "Writing"],
    "Year 11": ["Paper 1 language", "Paper 2 literature", "Extended writing"],
  },
  "gcse-maths": {
    "Year 10": ["Number", "Algebra", "Geometry", "Statistics"],
    "Year 11": ["Higher tier topics", "Problem solving", "Proof"],
  },
  "gcse-science": {
    "Year 10": ["Biology", "Chemistry", "Physics"],
    "Year 11": ["Synoptic assessment", "Calculation practice", "Practical skills"],
  },
};

export function skillsForSubjectAndYear(subject: Subject, yearGroup: string | null | undefined): readonly string[] {
  const normalized = normalizeYearGroup(yearGroup);
  if (!normalized) return [];
  
  const subjectSkills = SKILLS_BY_SUBJECT_AND_YEAR[subject];
  if (!subjectSkills) return [];
  
  return subjectSkills[normalized] ?? [];
}
