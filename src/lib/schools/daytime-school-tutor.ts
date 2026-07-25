import { randomUUID } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requestOpenAiJson } from "@/lib/ai/openai-json";
import { writeAuditLog } from "@/lib/audit";
import { writeSchoolAuditLog } from "@/lib/schools/audit";
import {
  buildStoredQuestionHelpSteps,
  nextStoredHelpStep,
  type QuestionHelpStep,
} from "@/lib/schools/question-help";
import {
  AI_TUTOR_SCOPE_DAYTIME_SCHOOL,
  type DaytimeSchoolTutorContext,
} from "@/lib/schools/daytime-school-tutor-access";

export const DAYTIME_TUTOR_INTENTS = [
  "explain-question",
  "explain-word",
  "give-hint",
  "show-first-step",
  "why-wrong",
] as const;

export type DaytimeTutorIntent = (typeof DAYTIME_TUTOR_INTENTS)[number];

export type DaytimeTutorSource = "stored-help" | "openai" | "fallback";

export type DaytimeTutorResponse = {
  conversationId: string;
  source: DaytimeTutorSource;
  intent: DaytimeTutorIntent;
  message: string;
  hintLevel: number;
  revealsAnswer: boolean;
  canAskAgain: boolean;
  nextSuggestedIntents: DaytimeTutorIntent[];
  periodEndsAt: string;
  needsTeacher: boolean;
  /** Optional AI hypothesis — persisted into history/audit for misconception analytics. */
  misconception?: string | null;
};

type TutorMessage = {
  role: "assistant" | "user";
  intent?: DaytimeTutorIntent;
  message: string;
  source?: DaytimeTutorSource;
  hintLevel?: number;
  revealsAnswer?: boolean;
  createdAt: string;
};

type LoadHistoryInput = {
  studentId: string;
  periodId: string;
  assignmentId: string;
  questionKey: string;
  conversationId?: string;
};

type LoadHistoryResult = {
  conversationId: string;
  messages: TutorMessage[];
  hintTurns: number;
};

type AppendHistoryInput = {
  context: DaytimeSchoolTutorContext;
  conversationId: string;
  intent: DaytimeTutorIntent;
  response: DaytimeTutorResponse;
  studentAttemptPresent: boolean;
};

type LogHelpEventInput = {
  context: DaytimeSchoolTutorContext;
  intent: DaytimeTutorIntent;
  response: DaytimeTutorResponse;
  studentAttemptPresent: boolean;
  recovered?: boolean;
};

export type DaytimeTutorHistoryStore = {
  load: (input: LoadHistoryInput) => Promise<LoadHistoryResult>;
  append: (input: AppendHistoryInput) => Promise<void>;
  logEvent: (input: LogHelpEventInput) => Promise<void>;
};

const MAX_HISTORY = 8;
const HISTORY_MODE = "daytime_tutor";

const openAiTutorSchema = z.object({
  message: z.string().trim().min(1).max(1200),
  hintLevel: z.number().int().min(1).max(5),
  revealsAnswer: z.boolean(),
  misconception: z.string().trim().max(400).optional(),
  suggestedIntent: z.enum(DAYTIME_TUTOR_INTENTS).optional(),
  needsTeacher: z.boolean().optional(),
});

function historyKey(input: {
  periodId: string;
  assignmentId: string;
  questionKey: string;
  conversationId: string;
}): string {
  return `dts:${input.periodId}:${input.assignmentId}:${input.questionKey}:${input.conversationId}`;
}

function questionKey(context: DaytimeSchoolTutorContext): string {
  return context.question.id || `idx-${context.question.index}`;
}

function defaultNextIntents(intent: DaytimeTutorIntent, canAskAgain: boolean): DaytimeTutorIntent[] {
  if (!canAskAgain) return [];
  if (intent === "explain-word") return ["give-hint", "explain-question", "show-first-step"];
  if (intent === "why-wrong") return ["give-hint", "show-first-step", "explain-question"];
  if (intent === "show-first-step") return ["give-hint", "explain-question"];
  return ["give-hint", "show-first-step", "explain-word", "why-wrong"];
}

function findWordMeaning(context: DaytimeSchoolTutorContext, word: string): string | null {
  const wanted = word.trim().toLowerCase();
  if (!wanted) return null;
  const fromBreakdown = context.storedHelp.breakdown?.keyWords ?? [];
  for (const row of fromBreakdown) {
    if (row.word.trim().toLowerCase() === wanted) {
      return `${row.word}: ${row.meaning}`;
    }
  }
  try {
    const raw = context.question.raw;
    const vocab = Array.isArray(raw.vocabulary) ? raw.vocabulary : null;
    if (vocab) {
      for (const entry of vocab) {
        if (!entry || typeof entry !== "object") continue;
        const item = entry as Record<string, unknown>;
        const w = String(item.word ?? "").trim();
        if (w.toLowerCase() !== wanted) continue;
        const meaning = String(item.childFriendlyMeaning ?? item.meaning ?? "").trim();
        if (meaning) return `${w}: ${meaning}`;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function storedStepForIntent(
  context: DaytimeSchoolTutorContext,
  intent: DaytimeTutorIntent,
  previouslyShown: number,
  word?: string,
): { step: QuestionHelpStep; nextShown: number; exhausted: boolean } | null {
  const steps = buildStoredQuestionHelpSteps(context.storedHelp);

  if (intent === "explain-word") {
    const meaning = word ? findWordMeaning(context, word) : null;
    if (meaning) {
      return {
        step: {
          level: 1,
          title: "Word in this lesson",
          body: meaning,
          revealsAnswer: false,
        },
        nextShown: previouslyShown,
        exhausted: false,
      };
    }
    // Fall through to OpenAI / fallback when no stored definition.
    return null;
  }

  if (intent === "show-first-step") {
    const starting = context.storedHelp.breakdown?.startingPoint?.trim();
    const firstStep = context.storedHelp.breakdown?.steps?.[0]?.trim();
    const body = starting || firstStep || steps[0]?.body;
    if (!body) return null;
    return {
      step: {
        level: 1,
        title: "First step",
        body: starting
          ? `Start here: ${starting}`
          : firstStep
            ? `Try this first: ${firstStep}`
            : body,
        revealsAnswer: false,
      },
      nextShown: Math.max(previouslyShown, 1),
      exhausted: false,
    };
  }

  if (intent === "explain-question") {
    // Prefer simpler wording / first non-reveal step; never jump to full explanation on first turns.
    const safer = steps.find((step) => !step.revealsAnswer) ?? steps[0];
    if (!safer) return null;
    if (previouslyShown === 0) {
      return { step: { ...safer, revealsAnswer: false }, nextShown: 1, exhausted: false };
    }
    const next = nextStoredHelpStep(context.storedHelp, previouslyShown);
    if (!next) return null;
    if (next.revealsAnswer && previouslyShown < 2) {
      const nonReveal = steps.slice(previouslyShown).find((step) => !step.revealsAnswer);
      if (nonReveal) {
        return {
          step: nonReveal,
          nextShown: previouslyShown + 1,
          exhausted: false,
        };
      }
    }
    return {
      step: next,
      nextShown: previouslyShown + 1,
      exhausted: previouslyShown + 1 >= steps.length,
    };
  }

  if (intent === "give-hint") {
    const next = nextStoredHelpStep(context.storedHelp, previouslyShown);
    if (!next) return null;
    if (next.revealsAnswer && previouslyShown < 2) {
      const nonReveal = steps.slice(previouslyShown).find((step) => !step.revealsAnswer);
      if (nonReveal) {
        return { step: nonReveal, nextShown: previouslyShown + 1, exhausted: false };
      }
      // Do not return full explanation early — force OpenAI/fallback path.
      return null;
    }
    return {
      step: next,
      nextShown: previouslyShown + 1,
      exhausted: previouslyShown + 1 >= steps.length,
    };
  }

  if (intent === "why-wrong") {
    const attempt = context.studentAttempt?.trim();
    const safer = steps.find((step) => !step.revealsAnswer);
    const nudge = safer?.body
      ?? context.storedHelp.hints[0]
      ?? "Look back at the question and check one small part of your answer.";
    const body = [
      attempt
        ? `You wrote “${attempt}”. That is a useful try — one part needs another look.`
        : "One part of your answer needs another look.",
      nudge,
      "Try one next step, then check again.",
    ].join("\n\n");
    return {
      step: {
        level: Math.max(1, previouslyShown + 1),
        title: "Let’s check your attempt",
        body,
        revealsAnswer: false,
      },
      nextShown: previouslyShown + 1,
      exhausted: false,
    };
  }

  return null;
}

async function loadHistoryDefault(input: LoadHistoryInput): Promise<LoadHistoryResult> {
  const rows = await prisma.coachInteractionLog.findMany({
    where: {
      childId: input.studentId,
      mode: HISTORY_MODE,
      skillFocus: {
        startsWith: `dts:${input.periodId}:${input.assignmentId}:${input.questionKey}:`,
      },
    },
    orderBy: { createdAt: "asc" },
    take: 40,
  });

  const conversationId = input.conversationId?.trim() || "";
  // No client conversationId means a fresh tutor turn — do not resume prior history.
  if (!conversationId) {
    return {
      conversationId: randomUUID(),
      messages: [],
      hintTurns: 0,
    };
  }

  const prefix = historyKey({
    periodId: input.periodId,
    assignmentId: input.assignmentId,
    questionKey: input.questionKey,
    conversationId,
  });

  const messages: TutorMessage[] = rows
    .filter((row) => (row.skillFocus ?? "").startsWith(prefix))
    .map((row) => {
      let meta: Record<string, unknown> = {};
      try {
        meta = JSON.parse(row.questionText) as Record<string, unknown>;
      } catch {
        meta = { message: row.questionText };
      }
      return {
        role: "assistant" as const,
        intent: typeof meta.intent === "string" ? (meta.intent as DaytimeTutorIntent) : undefined,
        message: typeof meta.message === "string" ? meta.message : String(row.questionText),
        source: typeof meta.source === "string" ? (meta.source as DaytimeTutorSource) : "stored-help",
        hintLevel: row.hintLevel,
        revealsAnswer: Boolean(meta.revealsAnswer),
        createdAt: row.createdAt.toISOString(),
      };
    })
    .slice(-MAX_HISTORY);

  return {
    conversationId,
    messages,
    hintTurns: messages.length,
  };
}

async function appendHistoryDefault(input: AppendHistoryInput): Promise<void> {
  const qKey = questionKey(input.context);
  const skillFocus = historyKey({
    periodId: input.context.periodId,
    assignmentId: input.context.assignmentId,
    questionKey: qKey,
    conversationId: input.conversationId,
  });

  const misconception = typeof input.response.misconception === "string"
    && input.response.misconception.trim()
    ? input.response.misconception.trim().slice(0, 400)
    : null;
  const payload = JSON.stringify({
    message: input.response.message,
    intent: input.intent,
    source: input.response.source,
    revealsAnswer: input.response.revealsAnswer,
    needsTeacher: input.response.needsTeacher,
    questionKey: qKey,
    ...(misconception ? { misconception } : {}),
  });

  try {
    await prisma.coachInteractionLog.create({
      data: {
        childId: input.context.studentId,
        subject: input.context.subject,
        skillFocus,
        questionText: payload.slice(0, 4000),
        hintLevel: input.response.hintLevel,
        mode: HISTORY_MODE,
        studentAnswer: input.studentAttemptPresent ? (input.context.studentAttempt ?? null) : null,
        correct: null,
        responseTimeMs: null,
      },
    });
  } catch (error) {
    console.error("[daytime-tutor] failed to append history", error);
  }
}

async function logHelpEventDefault(input: LogHelpEventInput): Promise<void> {
  const misconception = typeof input.response.misconception === "string"
    && input.response.misconception.trim()
    ? input.response.misconception.trim().slice(0, 400)
    : null;
  const event = {
    aiTutorScope: AI_TUTOR_SCOPE_DAYTIME_SCHOOL,
    studentId: input.context.studentId,
    schoolId: input.context.schoolId,
    classroomId: input.context.classroomId,
    lessonId: input.context.lessonId,
    periodId: input.context.periodId,
    assignmentId: input.context.assignmentId,
    contentId: input.context.contentId,
    stage: input.context.stage,
    stageOrder: input.context.stageOrder,
    questionIdOrIndex: questionKey(input.context),
    intent: input.intent,
    source: input.response.source,
    hintLevel: input.response.hintLevel,
    revealsAnswer: input.response.revealsAnswer,
    studentAttemptPresent: input.studentAttemptPresent,
    recovered: input.recovered ?? false,
    needsTeacher: input.response.needsTeacher,
    ...(misconception ? { misconception } : {}),
    createdAt: new Date().toISOString(),
  };

  try {
    await writeAuditLog({
      action: "daytime.tutor.help",
      entityType: "assignment",
      entityId: input.context.assignmentId,
      metadata: event,
    });
  } catch (error) {
    console.error("[daytime-tutor] audit log failed", error);
  }

  try {
    await writeSchoolAuditLog({
      schoolId: input.context.schoolId,
      action: "daytime_tutor_help",
      entityType: "assignment",
      entityId: input.context.assignmentId,
      metadata: event,
      severity: input.response.needsTeacher ? "warning" : "info",
    });
  } catch (error) {
    console.error("[daytime-tutor] school audit log failed", error);
  }
}

function fallbackMessage(needsTeacher: boolean): string {
  if (needsTeacher) {
    return "I’m not able to explain this clearly enough. Please ask your teacher.\n\nYou may need help from your teacher with this question.";
  }
  return "I’m not able to explain this clearly enough. Please ask your teacher.";
}

async function callOpenAiTutor(input: {
  context: DaytimeSchoolTutorContext;
  intent: DaytimeTutorIntent;
  word?: string;
  previousMessages: TutorMessage[];
  storedHintsAlreadyShown: number;
  allowReveal: boolean;
}): Promise<z.infer<typeof openAiTutorSchema> | null> {
  const systemPrompt = `You are School AI Tutor for StarLiz Academy daytime lessons only.
Respond with STRICT JSON:
{
  "message": string,
  "hintLevel": number (1-5),
  "revealsAnswer": boolean,
  "misconception"?: string,
  "suggestedIntent"?: one of ${DAYTIME_TUTOR_INTENTS.join("|")},
  "needsTeacher"?: boolean
}
Rules:
- Child-friendly, concise, lesson-specific.
- Never shame the student.
- Do not invent passage details.
- Do not reveal the final answer unless allowReveal is true AND this is a late turn.
- Prefer one clear next step.
- If confidence is low, set needsTeacher true.
- Stop after a short useful response.`;

  const userPrompt = JSON.stringify({
    intent: input.intent,
    word: input.word ?? null,
    allowReveal: input.allowReveal,
    subject: input.context.subject,
    yearGroup: input.context.yearGroup,
    lessonTitle: input.context.lessonTitle,
    curriculumSkill: input.context.curriculumSkill,
    stage: input.context.stage,
    passageOrExplanation: input.context.sharedPassage
      ?? input.context.question.passageOrExplanation
      ?? input.context.ruleExplanation,
    question: input.context.question.prompt,
    answerType: input.context.question.answerType,
    modelAnswer: input.allowReveal ? input.context.question.modelAnswer : "[hidden until later turn]",
    studentAttempt: input.context.studentAttempt ?? null,
    previousTutorMessages: input.previousMessages.map((row) => ({
      role: row.role,
      message: row.message,
      intent: row.intent,
    })),
    storedHintsAlreadyShown: input.storedHintsAlreadyShown,
  });

  try {
    const result = await requestOpenAiJson({
      systemPrompt,
      userPrompt,
      temperature: 0.3,
      maxTokens: 500,
      timeoutMs: 12_000,
    });
    const parsed = openAiTutorSchema.safeParse(result.parsed);
    if (!parsed.success) return null;
    if (!input.allowReveal && parsed.data.revealsAnswer) {
      return { ...parsed.data, revealsAnswer: false };
    }
    return parsed.data;
  } catch {
    return null;
  }
}

const defaultDaytimeTutorHistoryStore: DaytimeTutorHistoryStore = {
  load: loadHistoryDefault,
  append: appendHistoryDefault,
  logEvent: logHelpEventDefault,
};

export function createMemoryDaytimeTutorHistoryStore(): DaytimeTutorHistoryStore {
  const store = new Map<string, TutorMessage[]>();

  return {
    load: async (loadInput) => {
      let conversationId = loadInput.conversationId?.trim() || "";
      if (!conversationId) conversationId = randomUUID();

      const key = historyKey({
        periodId: loadInput.periodId,
        assignmentId: loadInput.assignmentId,
        questionKey: loadInput.questionKey,
        conversationId,
      });

      const messages = (store.get(key) ?? []).slice(-MAX_HISTORY);
      return {
        conversationId,
        messages,
        hintTurns: messages.length,
      };
    },

    append: async (appendInput) => {
      const qKey = questionKey(appendInput.context);
      const key = historyKey({
        periodId: appendInput.context.periodId,
        assignmentId: appendInput.context.assignmentId,
        questionKey: qKey,
        conversationId: appendInput.conversationId,
      });

      const existing = store.get(key) ?? [];
      const message: TutorMessage = {
        role: "assistant",
        intent: appendInput.intent,
        message: appendInput.response.message,
        source: appendInput.response.source,
        hintLevel: appendInput.response.hintLevel,
        revealsAnswer: appendInput.response.revealsAnswer,
        createdAt: new Date().toISOString(),
      };
      store.set(key, [...existing, message].slice(-MAX_HISTORY));
    },

    logEvent: async () => {
      // no-op for tests
    },
  };
}

export async function respondDaytimeSchoolTutor(input: {
  context: DaytimeSchoolTutorContext;
  intent: DaytimeTutorIntent;
  word?: string;
  conversationId?: string;
  /** Injected for tests */
  openAi?: typeof callOpenAiTutor;
  history?: DaytimeTutorHistoryStore;
}): Promise<DaytimeTutorResponse> {
  const historyStore = input.history ?? defaultDaytimeTutorHistoryStore;
  const qKey = questionKey(input.context);
  const history = await historyStore.load({
    studentId: input.context.studentId,
    periodId: input.context.periodId,
    assignmentId: input.context.assignmentId,
    questionKey: qKey,
    conversationId: input.conversationId,
  });

  const previouslyShown = history.hintTurns;
  const studentAttemptPresent = Boolean(input.context.studentAttempt?.trim());
  const repeatedHelp = history.messages.filter((row) => row.intent === input.intent).length >= 3;

  const stored = storedStepForIntent(
    input.context,
    input.intent,
    previouslyShown,
    input.word,
  );

  let response: DaytimeTutorResponse | null = null;
  let recovered = false;

  if (stored && !(stored.step.revealsAnswer && previouslyShown === 0)) {
    const canAskAgain = !stored.exhausted;
    response = {
      conversationId: history.conversationId,
      source: "stored-help",
      intent: input.intent,
      message: stored.step.body,
      hintLevel: stored.step.level,
      revealsAnswer: previouslyShown === 0 ? false : stored.step.revealsAnswer,
      canAskAgain,
      nextSuggestedIntents: defaultNextIntents(input.intent, canAskAgain),
      periodEndsAt: input.context.periodEndsAt,
      needsTeacher: repeatedHelp && stored.exhausted,
    };
  }

  if (!response) {
    const allowReveal = previouslyShown >= 3;
    const openAi = input.openAi ?? callOpenAiTutor;
    const ai = await openAi({
      context: input.context,
      intent: input.intent,
      word: input.word,
      previousMessages: history.messages,
      storedHintsAlreadyShown: previouslyShown,
      allowReveal,
    });

    if (ai) {
      const needsTeacher = Boolean(ai.needsTeacher) || repeatedHelp;
      const misconception = typeof ai.misconception === "string" && ai.misconception.trim()
        ? ai.misconception.trim().slice(0, 400)
        : null;
      response = {
        conversationId: history.conversationId,
        source: "openai",
        intent: input.intent,
        message: ai.message,
        hintLevel: ai.hintLevel,
        revealsAnswer: previouslyShown === 0 ? false : ai.revealsAnswer,
        canAskAgain: !needsTeacher,
        nextSuggestedIntents: defaultNextIntents(
          (ai.suggestedIntent as DaytimeTutorIntent | undefined) ?? input.intent,
          !needsTeacher,
        ),
        periodEndsAt: input.context.periodEndsAt,
        needsTeacher,
        misconception,
      };
    } else {
      recovered = true;
      response = {
        conversationId: history.conversationId,
        source: "fallback",
        intent: input.intent,
        message: fallbackMessage(true),
        hintLevel: Math.max(1, previouslyShown + 1),
        revealsAnswer: false,
        canAskAgain: false,
        nextSuggestedIntents: [],
        periodEndsAt: input.context.periodEndsAt,
        needsTeacher: true,
      };
    }
  }

  if (response.needsTeacher && !response.message.includes("ask your teacher")) {
    response = {
      ...response,
      message: `${response.message}\n\nYou may need help from your teacher with this question.`,
      canAskAgain: false,
      nextSuggestedIntents: [],
    };
  }

  // First tutor turn never reveals the answer.
  if (previouslyShown === 0 && response.revealsAnswer) {
    response = { ...response, revealsAnswer: false };
  }

  await historyStore.append({
    context: input.context,
    conversationId: response.conversationId,
    intent: input.intent,
    response,
    studentAttemptPresent,
  });
  await historyStore.logEvent({
    context: input.context,
    intent: input.intent,
    response,
    studentAttemptPresent,
    recovered,
  });

  return response;
}

export type { TutorMessage };
