import {
  GENERATION_CONTENT_TYPE_BY_SUBJECT,
  normalizeSubject,
  type Subject,
} from "@/lib/curriculum";
import type { DetectionResult } from "@/lib/lesson-pack-import/types";

/** Canonical AI Generator English subject for primary/import surfaces. */
export const LESSON_PACK_CANONICAL_ENGLISH: Subject = "english-language";

export type EnglishCurriculumArea =
  | "Reading"
  | "Writing"
  | "Grammar"
  | "Spelling"
  | "Phonics"
  | "Punctuation"
  | "Vocabulary"
  | "Poetry"
  | "Literacy"
  | "Fiction"
  | "Non-fiction";

/** Strand / topic aliases that must not be saved as Content Library subject. */
const ENGLISH_STRAND_TO_AREA: Record<string, EnglishCurriculumArea> = {
  reading: "Reading",
  "reading-comprehension": "Reading",
  comprehension: "Reading",
  literacy: "Literacy",
  writing: "Writing",
  composition: "Writing",
  grammar: "Grammar",
  spelling: "Spelling",
  phonics: "Phonics",
  punctuation: "Punctuation",
  vocabulary: "Vocabulary",
  poetry: "Poetry",
  poem: "Poetry",
  fiction: "Fiction",
  "non-fiction": "Non-fiction",
  nonfiction: "Non-fiction",
  author: "Reading",
  illustrator: "Reading",
};

const LESSON_PACK_SUBJECT_ALIASES: Record<string, Subject> = {
  reading: LESSON_PACK_CANONICAL_ENGLISH,
  "reading-comprehension": LESSON_PACK_CANONICAL_ENGLISH,
  comprehension: LESSON_PACK_CANONICAL_ENGLISH,
  literacy: LESSON_PACK_CANONICAL_ENGLISH,
  "english-reading": LESSON_PACK_CANONICAL_ENGLISH,
  "english-language": LESSON_PACK_CANONICAL_ENGLISH,
  english: LESSON_PACK_CANONICAL_ENGLISH,
  writing: LESSON_PACK_CANONICAL_ENGLISH,
  grammar: LESSON_PACK_CANONICAL_ENGLISH,
  spelling: LESSON_PACK_CANONICAL_ENGLISH,
  phonics: LESSON_PACK_CANONICAL_ENGLISH,
  punctuation: LESSON_PACK_CANONICAL_ENGLISH,
  vocabulary: LESSON_PACK_CANONICAL_ENGLISH,
  poetry: LESSON_PACK_CANONICAL_ENGLISH,
  poem: LESSON_PACK_CANONICAL_ENGLISH,
  literature: "english-literature",
  "english-literature": "english-literature",
  arithmetic: "maths",
  fractions: "maths",
  fraction: "maths",
  decimals: "maths",
  decimal: "maths",
  geometry: "maths",
  algebra: "maths",
  maths: "maths",
  math: "maths",
  mathematics: "maths",
  biology: "science",
  chemistry: "science",
  physics: "science",
  science: "science",
  history: "gcse-history",
  geography: "gcse-geography",
  computing: "gcse-computer-science",
  "computer-science": "gcse-computer-science",
  french: "gcse-french",
  spanish: "gcse-spanish",
  german: "gcse-german",
  italian: "gcse-italian",
  mandarin: "gcse-mandarin",
  arabic: "gcse-arabic",
  urdu: "gcse-urdu",
  polish: "gcse-polish",
  latin: "gcse-latin",
  "religious-education": "gcse-religious-studies",
  "religious-studies": "gcse-religious-studies",
  citizenship: "gcse-citizenship-studies",
  business: "gcse-business-studies",
  economics: "gcse-economics",
  psychology: "gcse-psychology",
  sociology: "gcse-sociology",
  art: "gcse-art-and-design",
  "art-and-design": "gcse-art-and-design",
  music: "gcse-music",
  "design-and-technology": "gcse-design-and-technology",
  "physical-education": "gcse-physical-education",
  pe: "gcse-physical-education",
};

type SubjectSignal = {
  subject: Subject;
  curriculumArea?: EnglishCurriculumArea | string;
  patterns: RegExp[];
  weight: number;
};

const SUBJECT_SIGNALS: SubjectSignal[] = [
  { subject: "gcse-history", weight: 8, patterns: [/\bhistory\b/i, /\bsource [a-z]\b/i, /\bchronolog/i] },
  { subject: "gcse-geography", weight: 8, patterns: [/\bgeography\b/i, /\bfieldwork\b/i, /\bclimate graph\b/i, /\bos map\b/i] },
  { subject: "gcse-computer-science", weight: 8, patterns: [/\bcomput(?:ing|er science)\b/i, /\bpseudocode\b/i, /\balgorithm\b/i] },
  { subject: "gcse-french", weight: 9, patterns: [/\bfrench\b/i, /\bfrançais\b/i] },
  { subject: "gcse-spanish", weight: 9, patterns: [/\bspanish\b/i, /\bespañol\b/i] },
  { subject: "gcse-german", weight: 9, patterns: [/\bgerman\b/i, /\bdeutsch\b/i] },
  { subject: "gcse-religious-studies", weight: 8, patterns: [/\breligious (?:education|studies)\b/i, /\btheolog/i] },
  { subject: "gcse-citizenship-studies", weight: 8, patterns: [/\bcitizenship\b/i] },
  { subject: "gcse-business-studies", weight: 8, patterns: [/\bbusiness studies\b/i, /\benterprise\b/i] },
  { subject: "gcse-economics", weight: 8, patterns: [/\beconomics\b/i, /\bsupply and demand\b/i] },
  { subject: "gcse-psychology", weight: 8, patterns: [/\bpsychology\b/i] },
  { subject: "gcse-sociology", weight: 8, patterns: [/\bsociology\b/i] },
  { subject: "gcse-art-and-design", weight: 8, patterns: [/\bart and design\b/i, /\bartwork\b/i] },
  { subject: "gcse-design-and-technology", weight: 8, patterns: [/\bdesign and technology\b/i, /\bdesign brief\b/i] },
  { subject: "gcse-music", weight: 8, patterns: [/\bmusic\b/i, /\bnotation\b/i, /\brhythm\b/i] },
  { subject: "gcse-physical-education", weight: 8, patterns: [/\bphysical education\b/i, /\bpe lesson\b/i] },
  {
    subject: "maths",
    weight: 8,
    patterns: [
      /\bmaths?\b/i,
      /\bmathematics\b/i,
      /\balgebra\b/i,
      /\bfraction/i,
      /\bdecimal/i,
      /\bgeometry\b/i,
      /\bplace value\b/i,
      /\bmultiplication\b/i,
      /\bdivision\b/i,
      /\barithmetic\b/i,
    ],
  },
  {
    subject: "science",
    weight: 8,
    patterns: [
      /\bscience\b/i,
      /\bphotosynthesis\b/i,
      /\bforces?\b/i,
      /\belectricity\b/i,
      /\bhabitat/i,
      /\bliving things\b/i,
      /\bmaterials\b/i,
      /\bevolution\b/i,
      /\bbiolog/i,
      /\bchemistr/i,
      /\bphysics\b/i,
    ],
  },
  {
    subject: LESSON_PACK_CANONICAL_ENGLISH,
    curriculumArea: "Reading",
    weight: 7,
    patterns: [
      /\breading\b/i,
      /\bcomprehension\b/i,
      /\binference\b/i,
      /\bretrieval\b/i,
      /\bguided reading\b/i,
      /\bliteracy\b/i,
      /\bfiction\b/i,
      /\bnon[-\s]?fiction\b/i,
      /\bauthor\b/i,
      /\billustrator\b/i,
    ],
  },
  {
    subject: LESSON_PACK_CANONICAL_ENGLISH,
    curriculumArea: "Writing",
    weight: 7,
    patterns: [/\bwriting\b/i, /\bcomposition\b/i, /\bnarrative\b/i, /\bpersuasive\b/i, /\bhandwriting\b/i],
  },
  {
    subject: LESSON_PACK_CANONICAL_ENGLISH,
    curriculumArea: "Spelling",
    weight: 6,
    patterns: [/\bspelling\b/i, /\bphoneme\b/i, /\bgrapheme\b/i, /\bsuffix\b/i, /\bprefix\b/i],
  },
  {
    subject: LESSON_PACK_CANONICAL_ENGLISH,
    curriculumArea: "Grammar",
    weight: 6,
    patterns: [/\bgrammar\b/i, /\bfronted adverbial\b/i, /\brelative clause\b/i, /\bsubordinating\b/i],
  },
  {
    subject: LESSON_PACK_CANONICAL_ENGLISH,
    curriculumArea: "Punctuation",
    weight: 5,
    patterns: [/\bpunctuation\b/i, /\bapostrophe\b/i, /\bcomma splice\b/i, /\bsemi-?colon\b/i],
  },
  {
    subject: LESSON_PACK_CANONICAL_ENGLISH,
    curriculumArea: "Phonics",
    weight: 6,
    patterns: [/\bphonics\b/i, /\bcvc\b/i, /\bdigraph\b/i, /\bblend\b/i],
  },
  {
    subject: LESSON_PACK_CANONICAL_ENGLISH,
    curriculumArea: "Vocabulary",
    weight: 5,
    patterns: [/\bvocabulary\b/i, /\bword meaning\b/i, /\bsynonym\b/i],
  },
  {
    subject: LESSON_PACK_CANONICAL_ENGLISH,
    weight: 8,
    patterns: [/\benglish language\b/i, /\benglish\b/i],
  },
  {
    subject: "english-literature",
    curriculumArea: "Poetry",
    weight: 6,
    patterns: [/\bliterature\b/i, /\bshakespeare\b/i, /\bpoem\b/i, /\bpoetry\b/i],
  },
  {
    subject: "gcse-maths",
    weight: 9,
    patterns: [/\bgcse\b.*\bmaths?\b/i, /\bmaths?\b.*\bgcse\b/i],
  },
  {
    subject: "gcse-science",
    weight: 9,
    patterns: [/\bgcse\b.*\bscience\b/i, /\bscience\b.*\bgcse\b/i],
  },
];

function cleanKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function isSupportedSubject(value: string | null | undefined): value is Subject {
  return Boolean(value && Object.prototype.hasOwnProperty.call(GENERATION_CONTENT_TYPE_BY_SUBJECT, value));
}

/**
 * Lesson-pack subject normalisation.
 * Maps curriculum strands (reading/writing/literacy/…) onto canonical StarLiz subjects
 * used by the AI Generator / Content Library — without changing Day School strand subjects.
 */
export function normalizeLessonPackSubject(value: string | null | undefined): Subject | null {
  if (!value) return null;
  const cleaned = cleanKey(value);
  if (!cleaned || cleaned === "auto" || cleaned === "auto-detect") return null;

  const alias = LESSON_PACK_SUBJECT_ALIASES[cleaned];
  if (alias && isSupportedSubject(alias)) return alias;

  if (ENGLISH_STRAND_TO_AREA[cleaned]) return LESSON_PACK_CANONICAL_ENGLISH;

  const base = normalizeSubject(value);
  if (!base) return null;

  // Internal English strands remain valid Subject values for Day School, but imports
  // must store the Generator-facing canonical English subject.
  if (ENGLISH_STRAND_TO_AREA[base] || base === "phonics" || base === "spelling" || base === "reading"
    || base === "writing" || base === "grammar" || base === "punctuation" || base === "vocabulary") {
    return LESSON_PACK_CANONICAL_ENGLISH;
  }

  return isSupportedSubject(base) ? base : null;
}

export function detectLessonPackCurriculumArea(input: {
  title?: string | null;
  text?: string;
  subjectHint?: string | null;
}): string | null {
  const hint = cleanKey(input.subjectHint ?? "");
  if (hint && ENGLISH_STRAND_TO_AREA[hint]) return ENGLISH_STRAND_TO_AREA[hint];

  const corpus = `${input.title ?? ""}\n${(input.text ?? "").slice(0, 8000)}`;
  let best: { area: string; score: number } | null = null;
  for (const signal of SUBJECT_SIGNALS) {
    if (!signal.curriculumArea) continue;
    let score = 0;
    for (const pattern of signal.patterns) {
      if (pattern.test(corpus)) score += signal.weight;
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { area: signal.curriculumArea, score };
    }
  }
  return best?.area ?? null;
}

export type LessonPackSubjectDetection = DetectionResult<Subject> & {
  curriculumArea: string | null;
  topic: string | null;
  needsInput: boolean;
};

export function detectSubjectFromPack(input: {
  title?: string | null;
  headings?: string[];
  text?: string;
  metadata?: Record<string, string>;
  manualSubject?: string | null;
}): LessonPackSubjectDetection {
  const manual = normalizeLessonPackSubject(input.manualSubject);
  const corpus = [
    input.title ?? "",
    ...(input.headings ?? []),
    input.metadata?.title ?? "",
    (input.text ?? "").slice(0, 12000),
  ].join("\n");

  const scores = new Map<Subject, { score: number; evidence: string[]; curriculumArea: string | null }>();

  for (const signal of SUBJECT_SIGNALS) {
    for (const pattern of signal.patterns) {
      if (pattern.test(corpus)) {
        const current = scores.get(signal.subject) ?? {
          score: 0,
          evidence: [],
          curriculumArea: signal.curriculumArea ?? null,
        };
        current.score += signal.weight;
        current.evidence.push(`matched ${pattern.source}`);
        if (signal.curriculumArea && !current.curriculumArea) {
          current.curriculumArea = signal.curriculumArea;
        }
        // Prefer stronger curriculum-area score for English strands
        if (signal.curriculumArea && signal.weight >= (current.curriculumArea ? 0 : 0)) {
          // Keep the area from the highest-scoring English strand signal overall later
        }
        scores.set(signal.subject, current);
      }
    }
  }

  // Track best English curriculum area independently of subject winner
  const curriculumArea = detectLessonPackCurriculumArea({
    title: input.title,
    text: corpus,
    subjectHint: input.manualSubject,
  });

  let best: Subject | null = null;
  let bestScore = -1;
  let evidence: string[] = [];
  for (const [subject, entry] of scores.entries()) {
    if (entry.score > bestScore) {
      best = subject;
      bestScore = entry.score;
      evidence = entry.evidence;
    }
  }

  // Title/alias path — never persist "reading" as subject
  const titleSubject = normalizeLessonPackSubject(input.title ?? "");
  if (titleSubject) {
    best = titleSubject;
    bestScore = Math.max(bestScore, 16);
    evidence = [`subject inferred from title: ${titleSubject}`, ...evidence];
  } else {
    const rawTitle = normalizeSubject(input.title ?? "");
    if (rawTitle) {
      const mapped = normalizeLessonPackSubject(rawTitle);
      if (mapped) {
        best = mapped;
        bestScore = Math.max(bestScore, 16);
        evidence = [`subject inferred from title strand ${rawTitle} → ${mapped}`, ...evidence];
      }
    }
  }

  best = normalizeLessonPackSubject(best) ?? best;
  if (best && !isSupportedSubject(best)) {
    best = normalizeLessonPackSubject(best);
  }

  const resolved = manual ?? (isSupportedSubject(best) ? best : null);
  const needsInput = !resolved;
  const confidence = resolved ? Math.min(0.99, Math.max(0.35, bestScore / 16)) : 0.2;
  const topic = (input.title ?? "").trim() || null;

  return {
    value: resolved,
    confidence: Number((manual ? Math.max(confidence, 0.95) : confidence).toFixed(2)),
    evidence: [...new Set(evidence)].slice(0, 8),
    warning: manual && best && manual !== best
      ? `Admin selected ${manual}, but content signals suggest ${best}.`
      : needsInput
        ? "Subject could not be mapped to a supported StarLiz subject. Please select one."
        : null,
    curriculumArea: curriculumArea
      ?? (resolved === LESSON_PACK_CANONICAL_ENGLISH ? "Reading" : null),
    topic,
    needsInput,
  };
}
