import type { LessonPackComponentType, LessonPackUploadedFile } from "@/lib/lesson-pack-import/types";

type ClassificationHit = {
  type: LessonPackComponentType;
  score: number;
  evidence: string;
};

const RULES: Array<{
  type: LessonPackComponentType;
  weight: number;
  patterns: RegExp[];
}> = [
  {
    type: "starter_answers",
    weight: 12,
    patterns: [
      /starter[\s_-]*(quiz|activity)?[\s_-]*answers?/i,
      /answers?[\s_-]*to[\s_-]*starter/i,
      /starter[\s_-]*key/i,
      /\bmark[\s_-]*scheme\b.*\bstarter\b/i,
    ],
  },
  {
    type: "starter_questions",
    weight: 11,
    patterns: [
      /starter[\s_-]*(quiz|questions?|activity)/i,
      /warm[\s_-]*up[\s_-]*(quiz|questions?)/i,
      /prior[\s_-]*learning[\s_-]*(quiz|questions?)/i,
      /\bstarter\b(?![\s_-]*answer)/i,
    ],
  },
  {
    type: "exit_answers",
    weight: 12,
    patterns: [
      /exit[\s_-]*(quiz|ticket|activity)?[\s_-]*answers?/i,
      /plenary[\s_-]*answers?/i,
      /answers?[\s_-]*to[\s_-]*exit/i,
    ],
  },
  {
    type: "exit_questions",
    weight: 11,
    patterns: [
      /exit[\s_-]*(quiz|ticket|questions?|activity)/i,
      /plenary[\s_-]*(quiz|questions?)/i,
      /end[\s_-]*of[\s_-]*lesson[\s_-]*(quiz|check)/i,
    ],
  },
  {
    type: "worksheet_answers",
    weight: 12,
    patterns: [
      /worksheet[\s_-]*answers?/i,
      /answers?[\s_-]*sheet/i,
      /answer[\s_-]*key/i,
      /mark[\s_-]*scheme/i,
    ],
  },
  {
    type: "worksheet",
    weight: 10,
    patterns: [
      /\bworksheet\b(?![\s_-]*answer)/i,
      /independent[\s_-]*practice/i,
      /pupil[\s_-]*worksheet/i,
      /student[\s_-]*sheet/i,
    ],
  },
  {
    type: "teaching_slides",
    weight: 10,
    patterns: [
      /slide[\s_-]*deck/i,
      /\bslidedeck\b/i,
      /teaching[\s_-]*slides?/i,
      /presentation/i,
      /lesson[\s_-]*slides?/i,
    ],
  },
  {
    type: "teacher_notes",
    weight: 9,
    patterns: [
      /teacher[\s_-]*notes?/i,
      /teaching[\s_-]*notes?/i,
      /guidance[\s_-]*for[\s_-]*teachers?/i,
      /lesson[\s_-]*plan/i,
      /pedagogy/i,
    ],
  },
  {
    type: "supporting_material",
    weight: 5,
    patterns: [
      /supporting/i,
      /resource[\s_-]*pack/i,
      /vocabulary[\s_-]*list/i,
      /knowledge[\s_-]*organiser/i,
      /glossary/i,
    ],
  },
];

function collectCorpus(file: Pick<LessonPackUploadedFile, "originalName" | "documentTitle" | "headings" | "textContent" | "metadata" | "kind">): string {
  return [
    file.originalName,
    file.documentTitle ?? "",
    ...(file.headings ?? []),
    file.metadata?.title ?? "",
    file.kind,
    (file.textContent ?? "").slice(0, 4000),
  ].join("\n");
}

function scoreFile(corpus: string, fileName: string): ClassificationHit[] {
  const hits: ClassificationHit[] = [];
  const lowerName = fileName.toLowerCase();
  const looksLikeAnswers = /answer|mark[\s_-]?scheme|answer[\s_-]?key/i.test(lowerName) || /answer|mark\s*scheme|answer\s*key/i.test(corpus.slice(0, 500));

  for (const rule of RULES) {
    let score = 0;
    const evidence: string[] = [];
    for (const pattern of rule.patterns) {
      if (pattern.test(corpus) || pattern.test(fileName)) {
        score += rule.weight;
        evidence.push(`matched ${pattern.source}`);
      }
    }
    // Prefer answer classifications when answer signals are present.
    if (looksLikeAnswers && rule.type.endsWith("_answers")) {
      score += 8;
      evidence.push("answer-sheet signal boost");
    }
    if (looksLikeAnswers && rule.type.endsWith("_questions")) {
      score = Math.max(0, score - 10);
    }
    if (score > 0) {
      hits.push({ type: rule.type, score, evidence: evidence[0] ?? rule.type });
    }
  }
  return hits.sort((a, b) => b.score - a.score);
}

function contentStructureBoost(corpus: string, type: LessonPackComponentType): { boost: number; evidence: string[] } {
  const evidence: string[] = [];
  let boost = 0;
  const hasQuestions = /\b(q\s*\d+|question\s*\d+|^\s*\d+[\).])/im.test(corpus);
  const hasAnswers = /\b(answer|mark scheme|correct response|answers?:)/i.test(corpus);
  const numberedAnswers = /^\s*\d+[\).]\s*.{0,40}\b(answer|ans)\b/im.test(corpus) || /\banswers?\b[\s\S]{0,200}\b1[\).]/i.test(corpus);

  if (type.includes("answers") && (hasAnswers || numberedAnswers)) {
    boost += 4;
    evidence.push("answer markings / answer structure detected");
  }
  if (type.includes("questions") && hasQuestions && !type.includes("answers")) {
    boost += 3;
    evidence.push("question numbering detected");
  }
  if (type === "worksheet" && hasQuestions && !hasAnswers) {
    boost += 2;
    evidence.push("worksheet-like question structure");
  }
  if (type === "teaching_slides" && /\b(learning objective|today we will|i can|success criteria)\b/i.test(corpus)) {
    boost += 2;
    evidence.push("teaching slide structure");
  }
  return { boost, evidence };
}

export function classifyLessonPackFile(
  file: Pick<LessonPackUploadedFile, "originalName" | "documentTitle" | "headings" | "textContent" | "metadata" | "kind" | "manualClassification">,
): { classification: LessonPackComponentType; confidence: number; evidence: string[] } {
  if (file.manualClassification) {
    return {
      classification: file.manualClassification,
      confidence: 1,
      evidence: ["manual admin override"],
    };
  }

  const corpus = collectCorpus(file);
  const fileName = file.originalName;
  const base = (fileName.split("/").pop() ?? fileName).replace(/\.[^.]+$/, "").toLowerCase();
  // Filename stem is authoritative for Oak pack components (do not let .pptx tip worksheets into slides).
  if (/^worksheet-answers$|^worksheet[\s_-]*answers$/i.test(base)) {
    return { classification: "worksheet_answers", confidence: 0.99, evidence: ["filename stem worksheet-answers"] };
  }
  if (/^worksheet$/i.test(base)) {
    return { classification: "worksheet", confidence: 0.99, evidence: ["filename stem worksheet"] };
  }
  if (/^slidedeck$|^slide-deck$|^teaching-slides$/i.test(base)) {
    return { classification: "teaching_slides", confidence: 0.99, evidence: ["filename stem teaching slides"] };
  }
  if (/^starter-quiz-answers$|^starter-quiz[\s_-]*answers$/i.test(base)) {
    return { classification: "starter_answers", confidence: 0.99, evidence: ["filename stem starter answers"] };
  }
  if (/^starter-quiz-questions$|^starter-quiz$/i.test(base)) {
    return { classification: "starter_questions", confidence: 0.99, evidence: ["filename stem starter questions"] };
  }
  if (/^exit-quiz-answers$|^exit-quiz[\s_-]*answers$/i.test(base)) {
    return { classification: "exit_answers", confidence: 0.99, evidence: ["filename stem exit answers"] };
  }
  if (/^exit-quiz-questions$|^exit-quiz$/i.test(base)) {
    return { classification: "exit_questions", confidence: 0.99, evidence: ["filename stem exit questions"] };
  }
  const hits = scoreFile(corpus, fileName);
  if (!hits.length) {
    return { classification: "unknown", confidence: 0.2, evidence: ["no strong filename/content signals"] };
  }

  const top = hits[0];
  const structure = contentStructureBoost(corpus, top.type);
  const rawScore = top.score + structure.boost;
  const second = hits[1]?.score ?? 0;
  const confidence = Math.min(0.99, Math.max(0.35, (rawScore - second * 0.35) / 20));

  return {
    classification: top.type,
    confidence: Number(confidence.toFixed(2)),
    evidence: [top.evidence, ...structure.evidence].filter(Boolean).slice(0, 6),
  };
}

export function classifyLessonPackFiles(files: LessonPackUploadedFile[]): LessonPackUploadedFile[] {
  return files.map((file) => {
    const result = classifyLessonPackFile(file);
    return {
      ...file,
      classification: result.classification,
      classificationConfidence: result.confidence,
      classificationEvidence: result.evidence,
    };
  });
}

/** Group related files into lesson packs using shared name stems / folder prefixes. */
export function groupFilesIntoLessonPacks(files: LessonPackUploadedFile[]): Map<string, LessonPackUploadedFile[]> {
  const groups = new Map<string, LessonPackUploadedFile[]>();

  for (const file of files) {
    const folder = file.originalName.includes("/")
      ? file.originalName.split("/").slice(0, -1).join("/")
      : "";
    const base = (file.originalName.split("/").pop() ?? file.originalName)
      .replace(/\.[^.]+$/, "")
      .toLowerCase()
      .replace(/(starter|exit|worksheet|answers?|questions?|quiz|slides?|slidedeck|deck|notes?|teacher|teaching|mark[\s_-]?scheme|answer[\s_-]?key)/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, "-") || "lesson";

    const groupKey = folder ? `${folder}::${base}` : base;
    const list = groups.get(groupKey) ?? [];
    list.push({ ...file, lessonGroupId: groupKey });
    groups.set(groupKey, list);
  }

  // If everything collapsed to one thin key and filenames suggest multiple lessons, split by folder only.
  if (groups.size === 1) {
    const folders = new Set(
      files.map((f) => (f.originalName.includes("/") ? f.originalName.split("/")[0] : "")).filter(Boolean),
    );
    if (folders.size > 1) {
      const byFolder = new Map<string, LessonPackUploadedFile[]>();
      for (const file of files) {
        const key = file.originalName.split("/")[0] || "lesson";
        const list = byFolder.get(key) ?? [];
        list.push({ ...file, lessonGroupId: key });
        byFolder.set(key, list);
      }
      return byFolder;
    }
  }

  return groups;
}

/**
 * Mark PDF/PPTX (etc.) pairs that share the same component role as equivalent.
 * Prefer the file with usable readable text. When both are readable, prefer PPTX
 * (structured XML) over PDF; when only one is readable, that one wins.
 */
export function markEquivalentComponentSources(files: LessonPackUploadedFile[]): LessonPackUploadedFile[] {
  const byRole = new Map<string, LessonPackUploadedFile[]>();
  for (const file of files) {
    const role = file.manualClassification ?? file.classification;
    if (role === "unknown" || role === "supporting_material") continue;
    const stem = (file.originalName.split("/").pop() ?? file.originalName)
      .replace(/\.[^.]+$/, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-");
    const folderHint = file.originalName.includes("/")
      ? file.originalName.split("/").slice(0, -1).join("/")
      : "";
    const lessonKey = file.lessonGroupId || folderHint;
    const key = `${lessonKey}::${role}::${stem.replace(/-(pdf|pptx|ppt|docx)$/i, "")}`;
    const list = byRole.get(key) ?? [];
    list.push(file);
    byRole.set(key, list);
  }

  const primaryIds = new Set<string>();
  const groupIds = new Map<string, string>();

  for (const [key, list] of byRole.entries()) {
    if (list.length < 2) {
      if (list[0]) {
        primaryIds.add(list[0].id);
      }
      continue;
    }
    const readability = (f: LessonPackUploadedFile) => {
      const text = f.textContent ?? "";
      if (!text || text.length < 8) return 0;
      const sample = text.slice(0, 8000);
      const readable = sample.match(/[A-Za-z0-9\s.,;:+\-=()]/g) ?? [];
      return readable.length / sample.length;
    };
    const sorted = [...list].sort((a, b) => {
      const ra = readability(a);
      const rb = readability(b);
      // Prefer usable text first
      if (ra >= 0.55 && rb < 0.55) return -1;
      if (rb >= 0.55 && ra < 0.55) return 1;
      // Among usable sources, prefer PPTX structured XML over PDF
      const kindRank = (f: LessonPackUploadedFile) => (f.kind === "pptx" ? 0 : f.kind === "docx" ? 1 : f.kind === "pdf" ? 2 : 3);
      const kr = kindRank(a) - kindRank(b);
      if (kr !== 0) return kr;
      // Prefer higher readability, then moderate length (not binary dumps)
      if (Math.abs(ra - rb) > 0.05) return rb - ra;
      const lenScore = (f: LessonPackUploadedFile) => {
        const n = f.textContent?.length ?? 0;
        if (n > 50_000) return -n; // penalise huge garbled dumps
        return n;
      };
      return lenScore(b) - lenScore(a);
    });
    const groupId = `equiv:${key}`;
    for (const file of sorted) groupIds.set(file.id, groupId);
    primaryIds.add(sorted[0].id);
  }

  return files.map((file) => {
    const alone = !groupIds.has(file.id);
    return {
      ...file,
      equivalentGroupId: groupIds.get(file.id),
      isPrimaryExtractionSource: alone ? true : primaryIds.has(file.id),
      classificationEvidence: groupIds.has(file.id)
        ? [...file.classificationEvidence, primaryIds.has(file.id)
          ? "primary extraction source among equivalent components"
          : "equivalent duplicate component retained in source metadata"]
        : file.classificationEvidence,
    };
  });
}
