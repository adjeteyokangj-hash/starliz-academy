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

export type GenerationType =
  | "phonics"
  | "spelling"
  | "punctuation"
  | "grammar"
  | "writing"
  | "reading"
  | "vocabulary"
  | "maths"
  | "science"
  | "english-language"
  | "english-literature"
  | "exam-practice";

export const GENERATION_CONTENT_TYPE_BY_SUBJECT: Record<Subject, GenerationType> = {
  phonics: "phonics",
  spelling: "spelling",
  reading: "reading",
  writing: "writing",
  grammar: "grammar",
  punctuation: "punctuation",
  vocabulary: "vocabulary",
  maths: "maths",
  "times-tables": "maths",
  science: "science",
  "english-literature": "english-literature",
  "english-language": "english-language",
  "sats-practice": "exam-practice",
  "11-plus-practice": "exam-practice",
  "gcse-english": "english-language",
  "gcse-maths": "maths",
  "gcse-science": "science",
};

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
    "Year 4": [
      "Commas in lists",
      "Apostrophes for possession",
      "Direct speech punctuation",
      "Question marks and exclamation marks",
      "Full stops and capital letters",
      "Fronted adverbials with commas",
    ],
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

// Auto-generate skill-specific topics from skill focus name
function generateTopicsFromSkill(skillFocus: string, subject: Subject): readonly string[] {
  const skill = skillFocus.toLowerCase().trim();
  const generated: string[] = [];
  
  // Generic patterns
  generated.push(`${skillFocus} practice`);
  generated.push(`${skillFocus} drill`);
  generated.push(`${skillFocus} application`);
  generated.push(`${skillFocus} review`);
  generated.push(`Focused ${skillFocus.toLowerCase()} work`);
  
  // Subject and skill-specific patterns
  if (subject === "spelling" || subject === "phonics") {
    if (skill.includes("prefix")) {
      generated.push("Adding prefixes", "Prefix types", "Prefix recognition", "Word families with prefixes");
    }
    if (skill.includes("suffix")) {
      generated.push("Adding suffixes", "Suffix types", "Suffix recognition", "Common suffixes");
    }
    if (skill.includes("silent")) {
      generated.push("Silent letter words", "Magic e patterns", "Hidden letters");
    }
    if (skill.includes("phase")) {
      generated.push("Sound segmentation", "Blending sounds", "Sound discrimination");
    }
    if (skill.includes("homophone")) {
      generated.push("Sound-alike words", "Homophone pairs", "Homophone context");
    }
    if (skill.includes("compound")) {
      generated.push("Compound word formation", "Splitting compound words", "Compound patterns");
    }
  }
  
  if (subject === "punctuation" || subject === "grammar") {
    if (skill.includes("comma")) {
      generated.push("Comma types", "List formatting", "Clause punctuation", "Comma placement");
    }
    if (skill.includes("apostrophe")) {
      generated.push("Possession markers", "Contraction punctuation", "Apostrophe placement");
    }
    if (skill.includes("speech") || skill.includes("dialogue")) {
      generated.push("Quote formatting", "Character dialogue", "Speaking verbs", "Direct speech practice");
    }
    if (skill.includes("adverbial")) {
      generated.push("Sentence starters", "Opening adverbials", "Adverbial placement");
    }
    if (skill.includes("capital") || skill.includes("full stop")) {
      generated.push("Sentence boundaries", "Proper nouns", "Case rules");
    }
    if (skill.includes("question") || skill.includes("exclamation")) {
      generated.push("Sentence intent", "Punctuation choices", "Intonation markers");
    }
    if (skill.includes("dash")) {
      generated.push("Dash usage", "Parenthetical information", "Clause separation");
    }
    if (skill.includes("colon") || skill.includes("semicolon")) {
      generated.push("List introduction", "Clause connection", "Advanced punctuation");
    }
  }
  
  if (subject === "maths" || subject === "times-tables" || subject === "sats-practice" || subject === "11-plus-practice" || subject === "gcse-maths") {
    if (skill.includes("times table") || skill.includes("multiplication facts") || skill.includes("times") || skill.includes("multiplica")) {
      generated.push("Fact fluency", "Timed drills", "Missing factors", "Inverse facts", "Speed practice");
    }
    if (skill.includes("division")) {
      generated.push("Division fluency", "Sharing equally", "Repeated subtraction", "Division facts");
    }
    if (skill.includes("fraction")) {
      generated.push("Fraction understanding", "Equivalent fractions", "Comparing fractions", "Fraction application");
    }
    if (skill.includes("decimal")) {
      generated.push("Decimal notation", "Place value", "Decimal comparison", "Rounding decimals");
    }
    if (skill.includes("percentage")) {
      generated.push("Percentage calculation", "Finding percentages", "Percentage change");
    }
    if (skill.includes("algebra")) {
      generated.push("Equation solving", "Pattern recognition", "Variable substitution");
    }
    if (skill.includes("equation") || skill.includes("quadratic")) {
      generated.push("Solving techniques", "Graphical representation", "Real-world problems");
    }
    if (skill.includes("geometry") || skill.includes("trigonometry")) {
      generated.push("Shape properties", "Angle calculations", "Transformation practice");
    }
    if (skill.includes("ratio") || skill.includes("proportion")) {
      generated.push("Scaling", "Equivalent ratios", "Proportion problems");
    }
    if (skill.includes("number") || skill.includes("place value")) {
      generated.push("Number ordering", "Number comparison", "Number bonds", "Part-whole relationships");
    }
    if (skill.includes("problem solving") || skill.includes("reasoning")) {
      generated.push("Multi-step problems", "Real-world context", "Logic puzzles", "Reasoning chains");
    }
  }
  
  if (subject === "reading" || subject === "english-literature" || subject === "english-language" || subject === "gcse-english") {
    if (skill.includes("comprehension") || skill.includes("retrieval")) {
      generated.push("Text recall", "Direct information", "Literal meaning");
    }
    if (skill.includes("inference") || skill.includes("infer")) {
      generated.push("Reading between the lines", "Implicit meaning", "Evidence-based inference", "Prediction");
    }
    if (skill.includes("vocabulary")) {
      generated.push("Word meaning in context", "Vocabulary building", "Word choice analysis");
    }
    if (skill.includes("analysis") || skill.includes("technique")) {
      generated.push("Writer's methods", "Language effects", "Structural choices", "Stylistic analysis");
    }
    if (skill.includes("character")) {
      generated.push("Character traits", "Character development", "Character motivation");
    }
    if (skill.includes("theme")) {
      generated.push("Theme identification", "Theme exploration", "Symbolic meaning");
    }
    if (skill.includes("poetry")) {
      generated.push("Poetic devices", "Rhythm and meter", "Figurative language", "Poem interpretation");
    }
  }
  
  if (subject === "writing" || skill.includes("writing")) {
    if (skill.includes("narrative")) {
      generated.push("Story plot", "Character development", "Setting description", "Dialogue writing");
    }
    if (skill.includes("description")) {
      generated.push("Sensory details", "Adjective use", "Varied description");
    }
    if (skill.includes("dialogue")) {
      generated.push("Speech punctuation", "Character voices", "Conversation flow");
    }
    if (skill.includes("persuasion") || skill.includes("persuasive")) {
      generated.push("Persuasive techniques", "Argument development", "Audience awareness");
    }
    if (skill.includes("argument")) {
      generated.push("Point development", "Evidence use", "Counterargument");
    }
  }
  
  if (subject === "science" || subject === "gcse-science") {
    if (skill.includes("living") || skill.includes("organism")) {
      generated.push("Organism classification", "Habitat adaptation", "Life process");
    }
    if (skill.includes("force") || skill.includes("motion")) {
      generated.push("Force types", "Newton's laws", "Speed and acceleration", "Friction effects");
    }
    if (skill.includes("energy")) {
      generated.push("Energy types", "Energy transfer", "Renewable energy");
    }
    if (skill.includes("electric")) {
      generated.push("Circuit building", "Current flow", "Conductivity", "Series and parallel circuits");
    }
    if (skill.includes("matter") || skill.includes("state")) {
      generated.push("State changes", "Particle theory", "Density and mass");
    }
    if (skill.includes("light")) {
      generated.push("Light reflection", "Light refraction", "Color and spectrum");
    }
    if (skill.includes("wave")) {
      generated.push("Wave properties", "Sound transmission", "Wave interference");
    }
    if (skill.includes("atom") || skill.includes("chemical")) {
      generated.push("Atomic structure", "Chemical bonding", "Reaction types");
    }
  }
  
  if (subject === "vocabulary") {
    if (skill.includes("morphology")) {
      generated.push("Word parts analysis", "Root words", "Affix study");
    }
    if (skill.includes("synonym")) {
      generated.push("Synonym relationships", "Word replacement");
    }
    if (skill.includes("etymology")) {
      generated.push("Word origin", "Language history", "Etymological patterns");
    }
    if (skill.includes("connotation")) {
      generated.push("Positive/negative associations", "Nuanced meaning");
    }
  }
  
  // Remove duplicates and empty strings
  return Array.from(new Set(generated.filter(t => t && t.trim())));
}

  type TopicSuggestionKey = `${YearGroup}|${Subject}|${string}`;

  const TOPIC_SUGGESTIONS_BY_SKILL: Partial<Record<TopicSuggestionKey, readonly string[]>> = {
    "Year 4|punctuation|Commas in lists": [
      "shopping lists",
      "animal lists",
      "classroom objects",
      "food lists",
      "adventure items",
    ],
    "Year 4|punctuation|Apostrophes for possession": [
      "singular possession",
      "plural possession",
      "classroom belongings",
      "family ownership",
      "story ownership clues",
    ],
    "Year 4|punctuation|Direct speech punctuation": [
      "dialogue in stories",
      "speaking verbs",
      "quoted questions",
      "quoted commands",
      "character conversations",
    ],
    "Year 4|punctuation|Question marks and exclamation marks": [
      "curiosity questions",
      "exciting events",
      "detecting sentence intent",
      "punctuation swaps",
      "adventure reactions",
    ],
    "Year 4|punctuation|Full stops and capital letters": [
      "sentence boundaries",
      "proper nouns",
      "editing paragraphs",
      "capital letter checks",
      "mixed punctuation repair",
    ],
    "Year 4|punctuation|Fronted adverbials with commas": [
      "time openers",
      "place openers",
      "manner openers",
      "story scene setting",
      "instruction starters",
    ],
    "Year 4|vocabulary|Morphology": [
      "Prefixes and suffixes",
      "Root words",
      "Word families",
      "Plural endings",
      "Compound words",
      "Synonyms and antonyms",
      "Meaning from word parts",
    ],
    "Year 11|maths|Quadratic equations": [
      "Expanding and factorising quadratics",
      "Solving by factorisation",
      "Completing the square",
      "Quadratic formula",
      "Graphing quadratic functions",
      "Word problems with quadratics",
    ],
  };

  const TOPIC_SUGGESTIONS_BY_SUBJECT: Partial<Record<Subject, readonly string[]>> = {
    phonics: [
      "sound blending",
      "segmenting practice",
      "grapheme recognition",
      "decodable words",
      "phoneme mapping",
    ],
    writing: [
      "story openings",
      "character description",
      "setting description",
      "sentence expansion",
      "editing and redrafting",
    ],
    grammar: [
      "sentence accuracy",
      "word class practice",
      "tense control",
      "clause building",
      "grammar correction",
    ],
    punctuation: [
      "sentence boundary checks",
      "dialogue punctuation",
      "list punctuation",
      "comma practice",
      "apostrophe practice",
    ],
    maths: [
      "Fluency practice",
      "Mixed problem solving",
      "Reasoning chains",
      "Real-world application",
      "Exam-style questions",
    ],
    "times-tables": [
      "fact fluency drills",
      "inverse division facts",
      "missing number equations",
      "multiplication grids",
      "timed fluency rounds",
    ],
    reading: [
      "Retrieval practice",
      "Inference with evidence",
      "Vocabulary in context",
      "Author intent",
      "Summarising key ideas",
    ],
    "english-language": [
      "language analysis",
      "writer's methods",
      "transactional writing",
      "comparison skills",
      "exam response planning",
    ],
    "english-literature": [
      "theme analysis",
      "character development",
      "quotation analysis",
      "context connections",
      "comparative response",
    ],
    "gcse-english": [
      "Paper 1 style questions",
      "Paper 2 comparison",
      "unseen poetry practice",
      "extended response planning",
      "language and structure",
    ],
    spelling: [
      "Prefix patterns",
      "Suffix patterns",
      "Homophones",
      "Common exception words",
      "Word families",
    ],
    vocabulary: [
      "Context clues",
      "Synonyms and antonyms",
      "Morphology",
      "Academic vocabulary",
      "Nuanced meanings",
    ],
    science: [
      "Concept check",
      "Scientific vocabulary",
      "Practical reasoning",
      "Data interpretation",
      "Misconception repair",
    ],
    "gcse-science": [
      "required practicals",
      "exam command words",
      "calculation practice",
      "application questions",
      "synoptic revision",
    ],
    "gcse-maths": [
      "algebra fluency",
      "problem solving",
      "geometry and measure",
      "statistics interpretation",
      "exam non-calculator practice",
    ],
    "sats-practice": [
      "arithmetic fluency",
      "reasoning papers",
      "reading test style",
      "mixed revision set",
      "timed checkpoint",
    ],
    "11-plus-practice": [
      "verbal reasoning",
      "non-verbal reasoning",
      "math reasoning",
      "code and sequence puzzles",
      "timed mixed practice",
    ],
  };

  export function topicSuggestionsForSelection(input: {
    yearGroup: string | null | undefined;
    subject: Subject;
    skillFocus: string | null | undefined;
  }): readonly string[] {
    const normalizedYear = normalizeYearGroup(input.yearGroup);
    const normalizedSkill = (input.skillFocus ?? "").trim();
    if (!normalizedYear) return [];

    const key = normalizedSkill
      ? (`${normalizedYear}|${input.subject}|${normalizedSkill}` as TopicSuggestionKey)
      : null;

    const bySkill = key ? (TOPIC_SUGGESTIONS_BY_SKILL[key] ?? []) : [];
    const bySubject = TOPIC_SUGGESTIONS_BY_SUBJECT[input.subject] ?? [];
    
    // Auto-generate topics from skill focus if no explicit mapping
    const autoGenerated = bySkill.length === 0 && normalizedSkill 
      ? generateTopicsFromSkill(normalizedSkill, input.subject)
      : [];

    const merged = [...bySkill, ...autoGenerated, ...bySubject];
    return Array.from(new Set(merged));
  }

  export type CurriculumWiringStatus = "fully-wired" | "partially-wired" | "fallback-only" | "missing";

  export type CurriculumPathAudit = {
    yearGroup: YearGroup;
    keyStage: KeyStage;
    ageGroup: AgeGroup;
    subject: Subject;
    skillFocus: string;
    topicThemes: string[];
    status: CurriculumWiringStatus;
    notes: string[];
  };

  export function isValidCurriculumPath(input: {
    yearGroup: string | null | undefined;
    subject: Subject;
    skillFocus: string | null | undefined;
    topic: string | null | undefined;
  }) {
    const year = normalizeYearGroup(input.yearGroup);
    if (!year) return { ok: false, reason: "Invalid year group" };
    const subjects = subjectsForYearGroup(year);
    if (!subjects.includes(input.subject)) return { ok: false, reason: "Subject is not available for selected year group" };

    const skill = (input.skillFocus ?? "").trim();
    const skills = skillsForSubjectAndYear(input.subject, year);
    if (!skill || !skills.includes(skill)) return { ok: false, reason: "Skill focus is not mapped for selected year and subject" };

    const topic = (input.topic ?? "").trim();
    const topics = topicSuggestionsForSelection({ yearGroup: year, subject: input.subject, skillFocus: skill });
    if (!topic || !topics.includes(topic)) return { ok: false, reason: "Topic/theme is not mapped for selected skill" };

    return { ok: true, reason: null as string | null };
  }

  export function buildCurriculumCoverageReport(): {
    totalPaths: number;
    fullyWired: number;
    partiallyWired: number;
    fallbackOnly: number;
    missing: number;
    paths: CurriculumPathAudit[];
  } {
    const paths: CurriculumPathAudit[] = [];

    for (const yearGroup of YEAR_GROUPS) {
      const keyStage = keyStageForYearGroup(yearGroup);
      const ageGroup = ageGroupForYearGroup(yearGroup);
      for (const subject of subjectsForYearGroup(yearGroup)) {
        const skills = skillsForSubjectAndYear(subject, yearGroup);
        if (!skills.length) {
          paths.push({
            yearGroup,
            keyStage,
            ageGroup,
            subject,
            skillFocus: "",
            topicThemes: [],
            status: "missing",
            notes: ["No skills mapped"],
          });
          continue;
        }

        for (const skillFocus of skills) {
          const topics = [...topicSuggestionsForSelection({ yearGroup, subject, skillFocus })];
          let status: CurriculumWiringStatus = "fully-wired";
          const notes: string[] = [];
          if (!GENERATION_CONTENT_TYPE_BY_SUBJECT[subject]) {
            status = "missing";
            notes.push("No AI generation content type mapping");
          }
          if (!topics.length) {
            status = "missing";
            notes.push("No topic/theme mappings");
          } else {
            const hasExplicitSkillTopics = (TOPIC_SUGGESTIONS_BY_SKILL[`${yearGroup}|${subject}|${skillFocus}` as TopicSuggestionKey] ?? []).length > 0;
            const hasAutoGeneratedTopics = (generateTopicsFromSkill(skillFocus, subject) ?? []).length > 0;
            const hasSubjectTopics = (TOPIC_SUGGESTIONS_BY_SUBJECT[subject] ?? []).length > 0;
            
            // Mark as fully-wired if has explicit skill topics OR has auto-generated topics
            if (hasExplicitSkillTopics || hasAutoGeneratedTopics) {
              status = "fully-wired";
              if (!hasExplicitSkillTopics && hasAutoGeneratedTopics) {
                notes.push("Using auto-generated skill-specific topics");
              }
            } else if (hasSubjectTopics) {
              status = "partially-wired";
              notes.push("Using subject-level topics only (no skill-specific mapping)");
            } else {
              status = "fallback-only";
              notes.push("No explicit skill or subject topics");
            }
          }

          paths.push({
            yearGroup,
            keyStage,
            ageGroup,
            subject,
            skillFocus,
            topicThemes: topics,
            status,
            notes,
          });
        }
      }
    }

    return {
      totalPaths: paths.length,
      fullyWired: paths.filter((path) => path.status === "fully-wired").length,
      partiallyWired: paths.filter((path) => path.status === "partially-wired").length,
      fallbackOnly: paths.filter((path) => path.status === "fallback-only").length,
      missing: paths.filter((path) => path.status === "missing").length,
      paths,
    };
  }
