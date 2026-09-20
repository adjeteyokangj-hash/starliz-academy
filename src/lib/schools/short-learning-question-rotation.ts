import { prisma } from "@/lib/db";
import { emitNotificationEvent } from "@/lib/notifications/dispatcher";
import { questionFingerprint } from "@/lib/question-duplicate-detection";
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

export type RotationPickResult = {
  selected: RotatableQuestion[];
  unusedRemaining: number;
  poolSize: number;
  refillNeeded: boolean;
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
  if (Array.isArray(row.items) && !Array.isArray(row.questions)) {
    return JSON.stringify({ ...row, items: payload, targetItems: payload.length });
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

/**
 * Keep this pack's generated questions. Bank rotation may supplement a short pack,
 * but must not drop validated items because an earlier block used the same fingerprint.
 */
export function selectRemixedQuestions(input: {
  packQuestions: RotatableQuestion[];
  bankPool: RotatableQuestion[];
  usedFingerprints: Iterable<string>;
  usageCounts: Map<string, number>;
  needed: number;
}): RotationPickResult {
  const packQuestions = input.packQuestions;
  const packFingerprints = new Set(packQuestions.map((item) => item.fingerprint));
  const selected = [...packQuestions];
  const poolSize = new Set(
    [...input.bankPool, ...packQuestions].map((item) => item.fingerprint),
  ).size;
  const used = new Set(Array.from(input.usedFingerprints).filter(Boolean));
  const unusedBank = input.bankPool.filter(
    (item) => !used.has(item.fingerprint) && !packFingerprints.has(item.fingerprint),
  );

  if (selected.length >= input.needed) {
    return {
      selected,
      unusedRemaining: unusedBank.length,
      poolSize,
      refillNeeded: unusedBank.length < QUESTION_BANK_REFILL_THRESHOLD,
    };
  }

  const picked = pickRotatedQuestions({
    pool: input.bankPool.filter((item) => !packFingerprints.has(item.fingerprint)),
    usedFingerprints: input.usedFingerprints,
    usageCounts: input.usageCounts,
    needed: input.needed - selected.length,
  });
  return {
    selected: [...selected, ...picked.selected],
    unusedRemaining: picked.unusedRemaining,
    poolSize,
    refillNeeded: picked.refillNeeded,
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
}): RotatableQuestion[] {
  const used = new Set(input.existing.map((item) => item.prompt.trim().toLowerCase()));
  const seen = new Set([
    ...input.existing.map((item) => item.fingerprint),
    ...Array.from(input.usedFingerprints ?? []),
  ]);
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
    seen.add(question.fingerprint);
    used.add(question.prompt.trim().toLowerCase());
    out.push(question);
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
  const exposures = await prisma.studentQuestionExposure.findMany({
    where: {
      schoolId: input.schoolId,
      subject: { in: subjectValues },
      yearGroup: { in: yearValues },
    },
    select: { studentId: true, fingerprint: true },
  });
  const usageCounts = new Map<string, number>();
  const usedFingerprints = new Map<string, Set<string>>();
  for (const row of exposures) {
    usageCounts.set(row.fingerprint, (usageCounts.get(row.fingerprint) ?? 0) + 1);
    const set = usedFingerprints.get(row.studentId) ?? new Set<string>();
    set.add(row.fingerprint);
    usedFingerprints.set(row.studentId, set);
  }
  return { pool, usageCounts, usedFingerprints };
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
