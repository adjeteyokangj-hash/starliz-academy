import {
  YEAR_GROUPS,
  keyStageForYearGroup,
  normalizeYearGroup,
  type YearGroup,
} from "@/lib/curriculum";
import type { DetectionResult } from "@/lib/lesson-pack-import/types";

const YEAR_PATTERNS: Array<{ year: YearGroup; patterns: RegExp[] }> = YEAR_GROUPS.map((year) => {
  if (year === "Reception") {
    return {
      year,
      patterns: [/\breception\b/i, /\beyfs\b/i, /\bearly\s+years\b/i],
    };
  }
  const n = year.replace("Year ", "");
  return {
    year,
    patterns: [
      new RegExp(`\\byear\\s*${n}\\b`, "i"),
      new RegExp(`\\byr\\.?\\s*${n}\\b`, "i"),
      new RegExp(`\\by${n}\\b`, "i"),
    ],
  };
});

const KS_HINTS: Array<{ years: YearGroup[]; patterns: RegExp[]; label: string }> = [
  { years: ["Reception"], patterns: [/\beyfs\b/i], label: "EYFS reference" },
  { years: ["Year 1", "Year 2"], patterns: [/\bks\s*1\b/i, /\bkey\s*stage\s*1\b/i], label: "KS1 reference" },
  { years: ["Year 3", "Year 4", "Year 5", "Year 6"], patterns: [/\bks\s*2\b/i, /\bkey\s*stage\s*2\b/i, /\bupper\s+ks2\b/i], label: "KS2 reference" },
  { years: ["Year 7", "Year 8", "Year 9"], patterns: [/\bks\s*3\b/i, /\bkey\s*stage\s*3\b/i], label: "KS3 reference" },
  { years: ["Year 10", "Year 11"], patterns: [/\bks\s*4\b/i, /\bgcse\b/i, /\bkey\s*stage\s*4\b/i], label: "KS4/GCSE reference" },
];

function complexitySignals(text: string): { score: number; evidence: string[] } {
  const evidence: string[] = [];
  let score = 0;
  if (/\b(fraction|decimal|percentage|ratio|algebra|equation|hypothesis|photosynthesis|evaporation)\b/i.test(text)) {
    score += 2;
    evidence.push("upper-primary / secondary vocabulary present");
  }
  if (/\b(phonics|cvc|digraph|sounding out|counting to 20)\b/i.test(text)) {
    score -= 2;
    evidence.push("early-primary vocabulary present");
  }
  if (/\b(evaluate|justify|analyse|analyze|compare and contrast|multi-step)\b/i.test(text)) {
    score += 2;
    evidence.push("higher cognitive demand language");
  }
  if (/\b(exam board|aqa|edexcel|ocr|paper 1|grade 9)\b/i.test(text)) {
    score += 3;
    evidence.push("exam-board language");
  }
  return { score, evidence };
}

export function detectYearGroupFromPack(input: {
  title?: string | null;
  headings?: string[];
  text?: string;
  metadata?: Record<string, string>;
  manualYearGroup?: string | null;
}): DetectionResult<YearGroup> & { keyStage: ReturnType<typeof keyStageForYearGroup> | null; mismatchWarning?: string | null } {
  const corpus = [
    input.title ?? "",
    ...(input.headings ?? []),
    input.metadata?.title ?? "",
    (input.text ?? "").slice(0, 12000),
  ].join("\n");

  const evidence: string[] = [];
  const scores = new Map<YearGroup, number>();

  for (const entry of YEAR_PATTERNS) {
    for (const pattern of entry.patterns) {
      if (pattern.test(corpus)) {
        scores.set(entry.year, (scores.get(entry.year) ?? 0) + 10);
        evidence.push(`“${entry.year}” wording matched`);
      }
    }
  }

  for (const hint of KS_HINTS) {
    for (const pattern of hint.patterns) {
      if (pattern.test(corpus)) {
        for (const year of hint.years) {
          scores.set(year, (scores.get(year) ?? 0) + 3);
        }
        evidence.push(hint.label);
      }
    }
  }

  const complexity = complexitySignals(corpus);
  if (complexity.score !== 0) {
    // Soft nudge toward upper or lower years
    const ordered = [...YEAR_GROUPS];
    const pivot = complexity.score > 0 ? "Year 5" : "Year 2";
    const pivotIdx = ordered.indexOf(pivot as YearGroup);
    for (const [year, value] of scores.entries()) {
      const idx = ordered.indexOf(year);
      const distanceBoost = Math.max(0, 3 - Math.abs(idx - pivotIdx));
      scores.set(year, value + distanceBoost * Math.abs(complexity.score));
    }
    evidence.push(...complexity.evidence);
  }

  let detected: YearGroup | null = null;
  let best = -1;
  for (const [year, score] of scores.entries()) {
    if (score > best) {
      best = score;
      detected = year;
    }
  }

  // Prefer explicit Year N in title if present
  const titleYear = normalizeYearGroup(input.title ?? "");
  if (titleYear) {
    detected = titleYear;
    best = Math.max(best, 20);
    evidence.unshift(`“${titleYear}” appears in the lesson title`);
  }

  const confidence = detected
    ? Math.min(0.99, Math.max(0.4, best / 20))
    : 0.2;

  const manual = normalizeYearGroup(input.manualYearGroup);
  let mismatchWarning: string | null = null;
  if (manual && detected && manual !== detected) {
    const distance = Math.abs(YEAR_GROUPS.indexOf(manual) - YEAR_GROUPS.indexOf(detected));
    if (distance >= 2) {
      mismatchWarning = `Admin selected ${manual}, but content signals suggest ${detected} (distance ${distance}).`;
    }
  }

  const authoritative = manual ?? detected;

  return {
    value: authoritative,
    confidence: Number((manual ? Math.max(confidence, 0.95) : confidence).toFixed(2)),
    evidence: [...new Set(evidence)].slice(0, 8),
    warning: mismatchWarning,
    keyStage: authoritative ? keyStageForYearGroup(authoritative) : null,
    mismatchWarning,
  };
}
