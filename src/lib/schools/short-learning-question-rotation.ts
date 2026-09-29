import { prisma } from "@/lib/db";
import { emitNotificationEvent } from "@/lib/notifications/dispatcher";
import { questionFingerprint } from "@/lib/question-duplicate-detection";
import {
  compareQuestionEquivalence,
  partsFromQuestionFingerprint,
  repetitionPurposeForBlock,
  repetitionPurposeOf,
  type QuestionEquivalence,
  type QuestionRepetitionPurpose,
} from "@/lib/schools/short-learning-question-equivalence";
import {
  canonicalShortLearningSubjectKey,
  shortLearningSubjectLabel,
  shortLearningSubjectMatchValues,
  shortLearningYearMatchValues,
} from "@/lib/schools/short-learning-curriculum";
import { ensureMinimumMathQuestions, minMathQuestionsForMinutes } from "@/lib/schools/math-practice-fill";
import {
  buildSubjectPracticeFillItems,
  ensureMinimumSubjectQuestions,
} from "@/lib/schools/subject-practice-fill";

export const QUESTION_BANK_REFILL_EVENT = "short_learning_question_bank_refill";
export const QUESTION_BANK_REFILL_THRESHOLD = 8;

export type RotatableQuestion = {
  fingerprint: string;
  prompt: string;
  answer: string;
  choices: string[];
  raw: Record<string, unknown>;
};

export type PriorQuestionExposure = {
  fingerprint?: string;
  prompt: string;
  answer?: string;
  studentId?: string;
  subject?: string;
};

export type RotationPickResult = {
  selected: RotatableQuestion[];
  unusedRemaining: number;
  poolSize: number;
  refillNeeded: boolean;
  /** Ordinary questions dropped because this student had already seen an equivalent. */
  excludedRepeatCount?: number;
  /** Questions kept on purpose as retry, mastery, retrieval, or support. */
  intentionalRepeatCount?: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function questionFromRaw(raw: Record<string, unknown>): RotatableQuestion | null {
  const prompt = String(raw.prompt ?? raw.question ?? raw.word ?? "").trim();
  if (!prompt) return null;
  const answer = String(raw.answer ?? raw.correctAnswer ?? raw.word ?? "").trim();
  const choices = Array.isArray(raw.choices)
    ? raw.choices.map((choice) => String(choice ?? "").trim()).filter(Boolean)
    : Array.isArray(raw.options)
      ? raw.options.map((choice) => String(choice ?? "").trim()).filter(Boolean)
      : [];
  const fingerprint = questionFingerprint({ prompt, answer, choices });
  if (!fingerprint) return null;
  return {
    fingerprint,
    prompt,
    answer,
    choices,
    raw: {
      ...raw,
      prompt,
      question: prompt,
      answer,
      choices,
      options: choices.length ? choices : raw.options,
    },
  };
}

function nestedQuestionList(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  const row = asRecord(parsed);
  if (!row) return [];
  if (Array.isArray(row.questions) && row.questions.length) return row.questions;
  if (Array.isArray(row.items) && row.items.length) return row.items;
  return [];
}

export function extractRotatableQuestions(contentJson: string | unknown): RotatableQuestion[] {
  let parsed: unknown = contentJson;
  if (typeof contentJson === "string") {
    try {
      parsed = JSON.parse(contentJson);
    } catch {
      return [];
    }
  }
  const seen = new Set<string>();
  const items: RotatableQuestion[] = [];
  for (const entry of nestedQuestionList(parsed)) {
    const raw = asRecord(entry);
    if (!raw) continue;
    const question = questionFromRaw(raw);
    if (!question || seen.has(question.fingerprint)) continue;
    seen.add(question.fingerprint);
    items.push(question);
  }
  return items;
}

export function replacePackQuestions(contentJson: string, questions: RotatableQuestion[]): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contentJson);
  } catch {
    parsed = { questions: [] };
  }
  const payload = questions.map((item) => item.raw);
  if (Array.isArray(parsed)) {
    return JSON.stringify(payload);
  }
  const row = asRecord(parsed) ?? {};
  const hasQuestions = Array.isArray(row.questions);
  const hasItems = Array.isArray(row.items);
  // Daytime packs mirror the same array in `questions` and `items`. Updating only
  // one leaves stale pre-remix prompts that extractRotatableQuestions can fall back to.
  if (hasItems && !hasQuestions) {
    return JSON.stringify({ ...row, items: payload, targetItems: payload.length });
  }
  if (hasQuestions && hasItems) {
    return JSON.stringify({
      ...row,
      questions: payload,
      items: payload,
      targetItems: payload.length,
    });
  }
  return JSON.stringify({
    ...row,
    questions: payload,
    targetItems: payload.length,
  });
}

export function pickRotatedQuestions(input: {
  pool: RotatableQuestion[];
  usedFingerprints: Iterable<string>;
  usageCounts: Map<string, number>;
  needed: number;
  preferFingerprints?: Iterable<string>;
}): RotationPickResult {
  const needed = Math.max(1, input.needed);
  const used = new Set(Array.from(input.usedFingerprints).filter(Boolean));
  const byFingerprint = new Map<string, RotatableQuestion>();
  for (const item of input.pool) {
    if (!byFingerprint.has(item.fingerprint)) byFingerprint.set(item.fingerprint, item);
  }
  const unused = Array.from(byFingerprint.values()).filter((item) => !used.has(item.fingerprint));
  const preferred = new Set(Array.from(input.preferFingerprints ?? []).filter(Boolean));
  unused.sort((left, right) => {
    const leftPreferred = preferred.has(left.fingerprint) ? 0 : 1;
    const rightPreferred = preferred.has(right.fingerprint) ? 0 : 1;
    if (leftPreferred !== rightPreferred) return leftPreferred - rightPreferred;
    const leftUses = input.usageCounts.get(left.fingerprint) ?? 0;
    const rightUses = input.usageCounts.get(right.fingerprint) ?? 0;
    if (leftUses !== rightUses) return leftUses - rightUses;
    return left.fingerprint.localeCompare(right.fingerprint);
  });
  const selected = unused.slice(0, needed);
  const unusedRemaining = Math.max(0, unused.length - selected.length);
  return {
    selected,
    unusedRemaining,
    poolSize: byFingerprint.size,
    refillNeeded: unused.length < needed || unusedRemaining < QUESTION_BANK_REFILL_THRESHOLD,
  };
}

function sameShortLearningSubject(left: string, right: string): boolean {
  const a = canonicalShortLearningSubjectKey(left) ?? left.trim().toLowerCase();
  const b = canonicalShortLearningSubjectKey(right) ?? right.trim().toLowerCase();
  return a === b;
}

function tagQuestion(item: RotatableQuestion, purpose: QuestionRepetitionPurpose): RotatableQuestion {
  return {
    ...item,
    raw: {
      ...item.raw,
      repetitionPurpose: purpose,
      intentionalRepetition: purpose !== "ordinary",
    },
  };
}

function asComparable(item: { prompt: string; answer?: string; fingerprint?: string }) {
  return { prompt: item.prompt, answer: item.answer ?? "", fingerprint: item.fingerprint };
}

function equivalentToAny(
  item: RotatableQuestion,
  rows: Array<{ prompt: string; answer?: string; fingerprint?: string }>,
): QuestionEquivalence | null {
  for (const row of rows) {
    const match = compareQuestionEquivalence(asComparable(item), asComparable(row));
    if (match) return match;
  }
  return null;
}

/**
 * A fresh pack is not kept wholesale. Ordinary questions this student has
 * already seen for this Short Learning subject are dropped. Retry, mastery,
 * retrieval, and support questions are kept and tagged so they stay distinct
 * from new practice.
 */
export function selectRemixedQuestions(input: {
  packQuestions: RotatableQuestion[];
  bankPool: RotatableQuestion[];
  usedFingerprints: Iterable<string>;
  usageCounts: Map<string, number>;
  needed: number;
  priorExposure?: PriorQuestionExposure[];
  studentId?: string | null;
  subject?: string | null;
  blockTitle?: string | null;
  blockType?: string | null;
}): RotationPickResult {
  const exposure: Array<{ prompt: string; answer: string; fingerprint: string }> = [];
  for (const fingerprint of input.usedFingerprints) {
    if (!fingerprint) continue;
    const parsed = partsFromQuestionFingerprint(fingerprint);
    exposure.push({ fingerprint, prompt: parsed.prompt, answer: parsed.answer });
  }
  for (const row of input.priorExposure ?? []) {
    if (input.studentId && row.studentId && row.studentId !== input.studentId) continue;
    if (input.subject && row.subject && !sameShortLearningSubject(input.subject, row.subject)) continue;
    const parsed = partsFromQuestionFingerprint(row.fingerprint ?? "");
    const prompt = row.prompt.trim() || parsed.prompt;
    const answer = (row.answer ?? "").trim() || parsed.answer;
    if (!prompt && !row.fingerprint) continue;
    exposure.push({
      fingerprint: row.fingerprint || questionFingerprint({ prompt, answer }),
      prompt,
      answer,
    });
  }

  const blockPurpose = repetitionPurposeForBlock({
    title: input.blockTitle,
    blockType: input.blockType,
  });
  const selected: RotatableQuestion[] = [];
  let excludedRepeatCount = 0;
  let intentionalRepeatCount = 0;

  for (const item of input.packQuestions) {
    const marked = repetitionPurposeOf(item.raw);
    const exposureMatch = equivalentToAny(item, exposure);
    const selectedMatch = equivalentToAny(item, selected);
    // Recap/review/mastery blocks carry purpose from the block itself — do not wait
    // for a prior exposure match. Lesson blocks stay ordinary unless the question is marked.
    const purpose: QuestionRepetitionPurpose =
      marked !== "ordinary" ? marked : blockPurpose ? blockPurpose : "ordinary";
    const intentional = purpose !== "ordinary";
    if (!intentional && (exposureMatch || selectedMatch)) {
      excludedRepeatCount += 1;
      continue;
    }
    selected.push(tagQuestion(item, purpose));
    if (intentional && exposureMatch) intentionalRepeatCount += 1;
  }

  const poolSize = new Set(
    [...input.bankPool, ...input.packQuestions].map((item) => item.fingerprint),
  ).size;
  const safeBank = input.bankPool.filter((item) => {
    if (selected.some((kept) => kept.fingerprint === item.fingerprint)) return false;
    if (equivalentToAny(item, exposure)) return false;
    if (equivalentToAny(item, selected)) return false;
    return true;
  });

  let finalSelected = selected;
  if (finalSelected.length < input.needed && safeBank.length > 0) {
    const picked = pickRotatedQuestions({
      pool: safeBank,
      usedFingerprints: [],
      usageCounts: input.usageCounts,
      needed: input.needed - finalSelected.length,
    });
    finalSelected = [
      ...finalSelected,
      ...picked.selected.map((item) => tagQuestion(item, blockPurpose ?? "ordinary")),
    ];
  }

  const addedFromBank = finalSelected.length - selected.length;
  const unusedRemaining = Math.max(0, safeBank.length - addedFromBank);
  return {
    selected: finalSelected,
    unusedRemaining,
    poolSize,
    refillNeeded: finalSelected.length < input.needed || unusedRemaining < QUESTION_BANK_REFILL_THRESHOLD,
    excludedRepeatCount,
    intentionalRepeatCount,
  };
}

function fillQuestions(input: {
  subject: string;
  yearGroup: string;
  skillFocus?: string | null;
  existing: RotatableQuestion[];
  needed: number;
  estimatedMinutes?: number | null;
  usedFingerprints?: Iterable<string>;
  priorExposure?: PriorQuestionExposure[];
}): RotatableQuestion[] {
  const used = new Set(input.existing.map((item) => item.prompt.trim().toLowerCase()));
  const seen = new Set([
    ...input.existing.map((item) => item.fingerprint),
    ...Array.from(input.usedFingerprints ?? []),
  ]);
  const history = [
    ...input.existing.map((item) => ({ prompt: item.prompt, answer: item.answer, fingerprint: item.fingerprint })),
    ...Array.from(input.usedFingerprints ?? []).filter(Boolean).map((fingerprint) => {
      const parsed = partsFromQuestionFingerprint(fingerprint);
      return { prompt: parsed.prompt, answer: parsed.answer, fingerprint };
    }),
    ...(input.priorExposure ?? []).map((row) => ({
      prompt: row.prompt,
      answer: row.answer ?? "",
      fingerprint: row.fingerprint,
    })),
  ];
  const subjectKey = canonicalShortLearningSubjectKey(input.subject);
  const extras = subjectKey === "maths"
    ? ensureMinimumMathQuestions({
        questions: [],
        yearGroup: input.yearGroup,
        skillFocus: input.skillFocus,
        estimatedMinutes: input.estimatedMinutes,
      })
    : buildSubjectPracticeFillItems({
        subject: input.subject,
        yearGroup: input.yearGroup,
        skillFocus: input.skillFocus,
        existingPrompts: Array.from(used),
        count: Math.max(0, input.needed - input.existing.length),
      });
  const filled = subjectKey === "maths"
    ? extras
    : ensureMinimumSubjectQuestions({
        questions: extras,
        subject: input.subject,
        yearGroup: input.yearGroup,
        skillFocus: input.skillFocus,
        estimatedMinutes: input.estimatedMinutes,
      });
  const out = [...input.existing];
  for (const row of filled) {
    const question = questionFromRaw(row as Record<string, unknown>);
    if (!question || seen.has(question.fingerprint) || used.has(question.prompt.trim().toLowerCase())) continue;
    if (equivalentToAny(question, history) || equivalentToAny(question, out)) continue;
    seen.add(question.fingerprint);
    used.add(question.prompt.trim().toLowerCase());
    history.push({ prompt: question.prompt, answer: question.answer, fingerprint: question.fingerprint });
    out.push(tagQuestion(question, "ordinary"));
    if (out.length >= input.needed) break;
  }
  return out;
}

function parsePermissionList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return [];
  }
}

export async function loadQuestionBankPool(input: {
  schoolId: string;
  subject: string;
  yearGroup: string;
}): Promise<{
  pool: RotatableQuestion[];
  usageCounts: Map<string, number>;
  usedFingerprints: Map<string, Set<string>>;
  exposureByStudent: Map<string, PriorQuestionExposure[]>;
}> {
  const subjectValues = shortLearningSubjectMatchValues(input.subject);
  const yearValues = shortLearningYearMatchValues(input.yearGroup);
  const journeys = await prisma.shortLearningJourney.findMany({
    where: {
      schoolId: input.schoolId,
      subject: { in: subjectValues },
      yearGroup: { in: yearValues },
      status: { in: ["published", "approved"] },
    },
    select: {
      blocks: { select: { contentId: true } },
    },
  });
  const contentIds = Array.from(
    new Set(
      journeys.flatMap((journey) => journey.blocks.map((block) => block.contentId).filter((id): id is string => Boolean(id))),
    ),
  );
  const contents = contentIds.length
    ? await prisma.aIContentCache.findMany({
        where: { id: { in: contentIds } },
        select: { contentJson: true },
      })
    : [];
  const pool: RotatableQuestion[] = [];
  const seen = new Set<string>();
  for (const content of contents) {
    for (const item of extractRotatableQuestions(content.contentJson)) {
      if (seen.has(item.fingerprint)) continue;
      seen.add(item.fingerprint);
      pool.push(item);
    }
  }
  // Student + subject, across year groups. A later year must not treat last year's
  // question as new just because the bank query is year-scoped.
  const exposures = await prisma.studentQuestionExposure.findMany({
    where: {
      schoolId: input.schoolId,
      subject: { in: subjectValues },
    },
    select: { studentId: true, fingerprint: true, prompt: true, subject: true },
  });
  const usageCounts = new Map<string, number>();
  const usedFingerprints = new Map<string, Set<string>>();
  const exposureByStudent = new Map<string, PriorQuestionExposure[]>();
  for (const row of exposures) {
    usageCounts.set(row.fingerprint, (usageCounts.get(row.fingerprint) ?? 0) + 1);
    const set = usedFingerprints.get(row.studentId) ?? new Set<string>();
    set.add(row.fingerprint);
    usedFingerprints.set(row.studentId, set);
    const list = exposureByStudent.get(row.studentId) ?? [];
    const parsed = partsFromQuestionFingerprint(row.fingerprint);
    list.push({
      studentId: row.studentId,
      subject: row.subject,
      fingerprint: row.fingerprint,
      prompt: row.prompt || parsed.prompt,
      answer: parsed.answer,
    });
    exposureByStudent.set(row.studentId, list);
  }
  return { pool, usageCounts, usedFingerprints, exposureByStudent };
}

export async function recordQuestionExposures(input: {
  studentId: string;
  schoolId: string;
  subject: string;
  yearGroup: string;
  questions: RotatableQuestion[];
  contentId?: string | null;
  bookingId?: string | null;
}) {
  const subject = canonicalShortLearningSubjectKey(input.subject) ?? input.subject.trim().toLowerCase();
  if (!input.questions.length) return;
  await prisma.studentQuestionExposure.createMany({
    data: input.questions.map((item) => ({
      studentId: input.studentId,
      schoolId: input.schoolId,
      subject,
      yearGroup: input.yearGroup,
      fingerprint: item.fingerprint,
      prompt: item.prompt.slice(0, 500),
      contentId: input.contentId ?? null,
      bookingId: input.bookingId ?? null,
    })),
    skipDuplicates: true,
  });
}

export async function notifyAdminQuestionBankRefill(input: {
  schoolId: string;
  subject: string;
  yearGroup: string;
  poolSize: number;
  unusedRemaining: number;
  needed: number;
}) {
  const subjectKey = canonicalShortLearningSubjectKey(input.subject) ?? input.subject;
  const label = shortLearningSubjectLabel(subjectKey);
  const dedupeKey = [
    "short-learning:question-bank-refill",
    input.schoolId,
    subjectKey,
    input.yearGroup,
    String(input.poolSize),
  ].join(":");
  const generateHref = `/admin/ai-generator?deliveryMode=SHORT_LEARNING`;
  const message = [
    `Start generating new ${input.yearGroup} ${label} Short Learning questions.`,
    `The year-group bank has ${input.unusedRemaining} unused question${input.unusedRemaining === 1 ? "" : "s"} left`,
    `(pool ${input.poolSize}; a session needs about ${input.needed}).`,
    `Open Admin → AI Generator → Short Learning and generate ${input.yearGroup} ${label}.`,
  ].join(" ");

  const admins = await prisma.adminUser.findMany({
    where: { active: true, isLocked: false },
    select: {
      user: { select: { email: true, name: true } },
      role: { select: { name: true, permissions: true } },
    },
  });
  const recipients = admins.filter((admin) => {
    const roleName = (admin.role?.name ?? "").toUpperCase();
    const permissions = parsePermissionList(admin.role?.permissions);
    return roleName === "SUPER_ADMIN" || roleName === "ADMIN" || permissions.includes("MANAGE_CONTENT");
  });

  if (recipients.length === 0) {
    await emitNotificationEvent({
      eventType: QUESTION_BANK_REFILL_EVENT,
      schoolId: input.schoolId,
      severity: "warning",
      dedupeKey,
      payload: {
        subject: `${input.yearGroup} ${label} question bank needs new questions`,
        message,
        generateHref,
        yearGroup: input.yearGroup,
        schoolSubject: subjectKey,
        poolSize: input.poolSize,
        unusedRemaining: input.unusedRemaining,
        needed: input.needed,
      },
    });
    return;
  }

  for (const admin of recipients) {
    const email = admin.user.email?.trim();
    if (!email) continue;
    await emitNotificationEvent({
      eventType: QUESTION_BANK_REFILL_EVENT,
      schoolId: input.schoolId,
      severity: "warning",
      dedupeKey: `${dedupeKey}:${email.toLowerCase()}`,
      payload: {
        channel: "email",
        recipient: email,
        subject: `Generate new ${input.yearGroup} ${label} questions`,
        message,
        generateHref,
        yearGroup: input.yearGroup,
        schoolSubject: subjectKey,
        poolSize: input.poolSize,
        unusedRemaining: input.unusedRemaining,
        needed: input.needed,
      },
    });
  }
}

export async function listQuestionBankRefillAlerts(schoolId?: string | null) {
  const events = await prisma.notificationEvent.findMany({
    where: {
      eventType: QUESTION_BANK_REFILL_EVENT,
      ...(schoolId ? { schoolId } : {}),
      createdAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      schoolId: true,
      payloadJson: true,
      createdAt: true,
      severity: true,
    },
  });
  const seen = new Set<string>();
  const alerts: Array<{
    id: string;
    schoolId: string | null;
    subject: string;
    yearGroup: string;
    message: string;
    generateHref: string;
    createdAt: string;
  }> = [];
  for (const event of events) {
    const payload = JSON.parse(event.payloadJson || "{}") as Record<string, unknown>;
    const subject = String(payload.schoolSubject ?? payload.subject ?? "").trim();
    const yearGroup = String(payload.yearGroup ?? "").trim();
    const key = `${event.schoolId ?? ""}:${subject}:${yearGroup}`;
    if (seen.has(key)) continue;
    seen.add(key);
    alerts.push({
      id: event.id,
      schoolId: event.schoolId,
      subject,
      yearGroup,
      message: String(payload.message ?? "Generate new year-group subject questions."),
      generateHref: String(payload.generateHref ?? "/admin/ai-generator?deliveryMode=SHORT_LEARNING"),
      createdAt: event.createdAt.toISOString(),
    });
  }
  return alerts;
}

export async function remixContentQuestionsForStudent(input: {
  contentId: string;
  studentId: string;
  schoolId: string;
  subject: string;
  yearGroup: string;
  bookingId?: string | null;
  skillFocus?: string | null;
  estimatedMinutes?: number | null;
  blockTitle?: string | null;
  blockType?: string | null;
}): Promise<{ contentId: string; refillNeeded: boolean; unusedRemaining: number; selectedCount: number }> {
  const content = await prisma.aIContentCache.findUnique({
    where: { id: input.contentId },
    select: {
      id: true,
      contentType: true,
      level: true,
      topic: true,
      contentJson: true,
      status: true,
      createdBy: true,
      model: true,
      keyStage: true,
      yearGroup: true,
      skillFocus: true,
      metadataJson: true,
    },
  });
  if (!content) {
    return { contentId: input.contentId, refillNeeded: false, unusedRemaining: 0, selectedCount: 0 };
  }

  const packQuestions = extractRotatableQuestions(content.contentJson);
  const needed = Math.max(
    packQuestions.length || 0,
    minMathQuestionsForMinutes(input.estimatedMinutes, content.topic),
  );
  const bank = await loadQuestionBankPool({
    schoolId: input.schoolId,
    subject: input.subject,
    yearGroup: input.yearGroup,
  });
  const studentUsed = bank.usedFingerprints.get(input.studentId) ?? new Set<string>();
  const studentExposure = bank.exposureByStudent.get(input.studentId) ?? [];
  const mergedPool = [...bank.pool];
  const seen = new Set(mergedPool.map((item) => item.fingerprint));
  for (const item of packQuestions) {
    if (seen.has(item.fingerprint)) continue;
    seen.add(item.fingerprint);
    mergedPool.push(item);
  }
  const picked = selectRemixedQuestions({
    packQuestions,
    bankPool: mergedPool,
    usedFingerprints: studentUsed,
    usageCounts: bank.usageCounts,
    needed,
    priorExposure: studentExposure,
    studentId: input.studentId,
    subject: input.subject,
    blockTitle: input.blockTitle,
    blockType: input.blockType,
  });
  let selected = picked.selected;
  if (selected.length < needed) {
    selected = fillQuestions({
      subject: input.subject,
      yearGroup: input.yearGroup,
      skillFocus: input.skillFocus ?? content.skillFocus,
      existing: selected,
      needed,
      estimatedMinutes: input.estimatedMinutes,
      usedFingerprints: studentUsed,
      priorExposure: studentExposure,
    });
  }

  const remixedJson = replacePackQuestions(content.contentJson, selected);
  let metadata: Record<string, unknown> = {};
  try {
    metadata = content.metadataJson ? JSON.parse(content.metadataJson) as Record<string, unknown> : {};
  } catch {
    metadata = {};
  }
  const cloned = await prisma.aIContentCache.create({
    data: {
      contentType: content.contentType,
      level: content.level,
      topic: content.topic,
      contentJson: remixedJson,
      status: content.status === "published" ? "generated" : content.status,
      createdBy: "short-learning-question-rotation",
      model: content.model,
      keyStage: content.keyStage,
      yearGroup: content.yearGroup ?? input.yearGroup,
      skillFocus: content.skillFocus,
      metadataJson: JSON.stringify({
        ...metadata,
        sourceContentId: content.id,
        rotatedForStudentId: input.studentId,
        questionRotation: true,
        unusedRemaining: picked.unusedRemaining,
        excludedRepeatCount: picked.excludedRepeatCount ?? 0,
        intentionalRepeatCount: picked.intentionalRepeatCount ?? 0,
      }),
    },
    select: { id: true },
  });

  await recordQuestionExposures({
    studentId: input.studentId,
    schoolId: input.schoolId,
    subject: input.subject,
    yearGroup: input.yearGroup,
    questions: selected,
    contentId: cloned.id,
    bookingId: input.bookingId,
  });

  if (picked.refillNeeded || selected.length < needed) {
    await notifyAdminQuestionBankRefill({
      schoolId: input.schoolId,
      subject: input.subject,
      yearGroup: input.yearGroup,
      poolSize: picked.poolSize,
      unusedRemaining: picked.unusedRemaining,
      needed,
    });
  }

  return {
    contentId: cloned.id,
    refillNeeded: picked.refillNeeded,
    unusedRemaining: picked.unusedRemaining,
    selectedCount: selected.length,
  };
}
