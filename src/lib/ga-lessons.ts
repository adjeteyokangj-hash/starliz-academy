import { prisma } from "@/lib/db";
import { GA_CATEGORIES, GA_LEVELS, toStudentSafeGaWord } from "@/lib/ga-word-bank";
import { GA_VOICE_ACTIVITY_TYPES, canServeGaAudioToStudent } from "@/lib/ga-voice";
import { listGaPronunciationReferences, serializeGaPronunciationReference } from "@/lib/ga-audio";
import { resolveGaCategoryAgainstAllowed } from "@/lib/ga-categories";
import { GA_LANGUAGE_PROFILE } from "@/lib/language-profiles";

export const GA_LESSON_STATUSES = ["Draft", "Published", "Archived"] as const;
export const GA_ACTIVITY_TYPES = ["flashcards", "quiz", ...GA_VOICE_ACTIVITY_TYPES] as const;
export const GA_QUIZ_TYPES = ["english_to_ga", "ga_to_english", "review"] as const;

export const BEGINNER_PACK_1_LESSONS = [
  { title: "Hello, Yes, No", slug: "beginner-pack-1-hello-yes-no", category: "Greetings", level: "Foundation", objective: "Recognise and practise hello, yes, and no.", lessonOrder: 1 },
  { title: "Today, Tomorrow, Yesterday", slug: "beginner-pack-1-today-tomorrow-yesterday", category: "Time", level: "Beginner 1", objective: "Recognise basic time words.", lessonOrder: 2 },
  { title: "Numbers 0-6", slug: "beginner-pack-1-numbers-0-6", category: "Numbers", level: "Beginner 1", objective: "Practise numbers zero to six.", lessonOrder: 3 },
  { title: "Family 1", slug: "beginner-pack-1-family-1", category: "Family", level: "Beginner 1", objective: "Learn first family words.", lessonOrder: 4 },
  { title: "Animals 1", slug: "beginner-pack-1-animals-1", category: "Animals", level: "Beginner 1", objective: "Learn first animal words.", lessonOrder: 5 },
  { title: "Food 1", slug: "beginner-pack-1-food-1", category: "Food", level: "Beginner 1", objective: "Learn first food words.", lessonOrder: 6 },
  { title: "Body Parts 1", slug: "beginner-pack-1-body-parts-1", category: "Body", level: "Beginner 1", objective: "Learn first body-part words.", lessonOrder: 7 },
  { title: "Review Quiz", slug: "beginner-pack-1-review-quiz", category: "Grammar", level: "Beginner 1", objective: "Review Beginner Pack 1 words.", lessonOrder: 8 },
] as const;

type GaWordLike = {
  id: string;
  englishWord: string;
  gaWord: string;
  wordType: string;
  category: string;
  level: string;
  quizReady: boolean;
  storyReady: boolean;
  reviewStatus: string;
};

type LessonWordLike = { word: GaWordLike; sortOrder: number };
type QuizQuestionLike = {
  id: string;
  questionType: string;
  prompt: string;
  optionsJson: string;
  correctAnswer: string;
  explanation: string | null;
  sortOrder: number;
  word: GaWordLike | null;
};

type LessonLike = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  level: string;
  category: string;
  objective: string;
  packKey: string | null;
  lessonOrder: number;
  publishStatus: string;
  words: LessonWordLike[];
  activities: Array<{ id: string; activityType: string; title: string; instructions: string | null; sortOrder: number }>;
  quizQuestions: QuizQuestionLike[];
};

type PronunciationReferenceLike = {
  id: string;
  referenceType: string;
  sourceUrl: string;
  sourceTitle: string | null;
  speakerName: string | null;
  channelName: string | null;
  timestampStart: string | null;
  timestampEnd: string | null;
  linkedWordId: string | null;
  linkedLessonId: string | null;
  linkedLetter: string | null;
  linkedSound: string | null;
  linkedPhraseText: string | null;
  pronunciationNote: string | null;
  permissionStatus: string;
  reviewStatus: string;
  confidenceLevel: number | null;
  createdAt: string;
  updatedAt: string;
};

export type GaLessonInput = {
  title: string;
  slug?: string | null;
  description?: string | null;
  level: string;
  category: string;
  objective: string;
  packKey?: string | null;
  lessonOrder?: number | null;
  publishStatus?: string | null;
  wordIds?: string[];
  activities?: Array<{ activityType: string; title: string; instructions?: string | null; sortOrder?: number | null }>;
  quizQuestions?: Array<{ questionType: string; wordId: string; prompt: string; options: string[]; correctAnswer: string; explanation?: string | null; sortOrder?: number | null }>;
};

type GaLessonBuildOptions = {
  allowedCategories?: readonly string[];
};

export type GaProgressInput = {
  studentId: string;
  lessonId: string;
  correctAnswers: number;
  totalQuestions: number;
  completed?: boolean;
};

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function optionalText(value: unknown): string | null {
  const text = cleanText(value);
  return text ? text : null;
}

function assertAllowed(value: string, allowed: readonly string[], label: string): string {
  if (!allowed.includes(value)) throw new Error(`${label} must be one of: ${allowed.join(", ")}.`);
  return value;
}

export function slugifyGaLessonTitle(title: string): string {
  return cleanText(title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "ga-lesson";
}

function safeOptionsJson(options: string[]): string {
  const cleaned = options.map(cleanText).filter(Boolean);
  if (cleaned.length < 2) throw new Error("Quiz questions need at least two options.");
  return JSON.stringify([...new Set(cleaned)]);
}

export function assertOnlyApprovedGaWords(words: Array<{ id: string; reviewStatus: string }>, requestedWordIds: string[]) {
  const byId = new Map(words.map((word) => [word.id, word]));
  const blocked = requestedWordIds.filter((id) => byId.get(id)?.reviewStatus !== "Approved");
  if (blocked.length) throw new Error("Lessons, flashcards and quizzes can only use Approved Ga words.");
}

export function buildGaProgressData(input: Pick<GaProgressInput, "correctAnswers" | "totalQuestions" | "completed">) {
  const totalQuestions = Math.max(0, Math.round(input.totalQuestions));
  const correctAnswers = Math.max(0, Math.min(totalQuestions, Math.round(input.correctAnswers)));
  const score = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;
  return {
    status: input.completed ? "completed" : "in_progress",
    score,
    totalQuestions,
    correctAnswers,
  };
}

export function buildGaLessonData(input: GaLessonInput, options: GaLessonBuildOptions = {}) {
  const title = cleanText(input.title);
  if (!title) throw new Error("Lesson title is required.");
  const objective = cleanText(input.objective);
  if (!objective) throw new Error("Lesson objective is required.");
  const allowedCategories = options.allowedCategories ?? GA_CATEGORIES;
  return {
    title,
    slug: optionalText(input.slug) ?? slugifyGaLessonTitle(title),
    description: optionalText(input.description),
    level: assertAllowed(cleanText(input.level), GA_LEVELS, "Level"),
    category: resolveGaCategoryAgainstAllowed(cleanText(input.category), allowedCategories),
    objective,
    packKey: optionalText(input.packKey),
    lessonOrder: Math.max(0, Math.round(input.lessonOrder ?? 0)),
    publishStatus: assertAllowed(cleanText(input.publishStatus) || "Draft", GA_LESSON_STATUSES, "Publish status"),
  };
}

export function toStudentSafeGaLesson(lesson: LessonLike) {
  if (lesson.publishStatus !== "Published") return null;
  const words = lesson.words
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((row) => toStudentSafeGaWord(row.word))
    .filter((word) => word !== null);
  const approvedWordIds = new Set(words.map((word) => word.id));
  const quizQuestions = lesson.quizQuestions
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .filter((question) => question.word && approvedWordIds.has(question.word.id))
    .map((question) => ({
      id: question.id,
      questionType: question.questionType,
      prompt: question.prompt,
      options: JSON.parse(question.optionsJson) as string[],
      correctAnswer: question.correctAnswer,
      explanation: question.explanation,
      word: question.word ? toStudentSafeGaWord(question.word) : null,
    }));

  return {
    id: lesson.id,
    languageProfileId: GA_LANGUAGE_PROFILE.id,
    requiresLanguageReadinessReview: GA_LANGUAGE_PROFILE.requiresLanguageReadinessReview,
    title: lesson.title,
    slug: lesson.slug,
    description: lesson.description,
    level: lesson.level,
    category: lesson.category,
    objective: lesson.objective,
    packKey: lesson.packKey,
    lessonOrder: lesson.lessonOrder,
    words,
    flashcards: words.map((word) => ({ wordId: word.id, englishWord: word.englishWord, gaWord: word.gaWord })),
    pronunciationReferences: [] as PronunciationReferenceLike[],
    activities: lesson.activities
      .filter((activity) => GA_ACTIVITY_TYPES.includes(activity.activityType as typeof GA_ACTIVITY_TYPES[number]))
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((activity) => ({ id: activity.id, activityType: activity.activityType, title: activity.title, instructions: activity.instructions })),
    quizQuestions,
  };
}

async function buildStudentPronunciationReferences(lesson: LessonLike) {
  const references = await listGaPronunciationReferences(200);
  const serialized = references
    .map(serializeGaPronunciationReference)
    .filter((reference) => canServeGaAudioToStudent(reference.reviewStatus)) as PronunciationReferenceLike[];
  const wordIds = new Set(lesson.words.map((row) => row.word.id));

  const lessonRefs = serialized.filter((reference) => reference.linkedLessonId === lesson.id);
  const wordRefs = serialized.filter((reference) => reference.linkedWordId && wordIds.has(reference.linkedWordId));
  const unique = new Map<string, PronunciationReferenceLike>();
  for (const reference of [...lessonRefs, ...wordRefs]) {
    unique.set(reference.id, reference);
  }

  return Array.from(unique.values()).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

async function approvedWordsByIds(wordIds: string[]) {
  const uniqueIds = [...new Set(wordIds.map(cleanText).filter(Boolean))];
  if (!uniqueIds.length) return [];
  const words = await prisma.gaWord.findMany({ where: { id: { in: uniqueIds } } });
  assertOnlyApprovedGaWords(words, uniqueIds);
  return uniqueIds;
}

async function replaceLessonChildren(lessonId: string, input: GaLessonInput) {
  const wordIds = await approvedWordsByIds(input.wordIds ?? []);
  const quizWordIds = await approvedWordsByIds((input.quizQuestions ?? []).map((question) => question.wordId));

  await prisma.$transaction([
    prisma.gaLessonWord.deleteMany({ where: { lessonId } }),
    prisma.gaLessonActivity.deleteMany({ where: { lessonId } }),
    prisma.gaQuizQuestion.deleteMany({ where: { lessonId } }),
    ...wordIds.map((wordId, index) => prisma.gaLessonWord.create({ data: { lessonId, wordId, sortOrder: index + 1 } })),
    ...(input.activities ?? []).map((activity, index) => prisma.gaLessonActivity.create({
      data: {
        lessonId,
        activityType: assertAllowed(cleanText(activity.activityType), GA_ACTIVITY_TYPES, "Activity type"),
        title: cleanText(activity.title) || "Lesson activity",
        instructions: optionalText(activity.instructions),
        sortOrder: Math.max(0, Math.round(activity.sortOrder ?? index + 1)),
      },
    })),
    ...(input.quizQuestions ?? []).map((question, index) => {
      if (!quizWordIds.includes(question.wordId)) throw new Error("Quiz questions can only use Approved Ga words.");
      return prisma.gaQuizQuestion.create({
        data: {
          lessonId,
          wordId: question.wordId,
          questionType: assertAllowed(cleanText(question.questionType), GA_QUIZ_TYPES, "Question type"),
          prompt: cleanText(question.prompt),
          optionsJson: safeOptionsJson(question.options),
          correctAnswer: cleanText(question.correctAnswer),
          explanation: optionalText(question.explanation),
          sortOrder: Math.max(0, Math.round(question.sortOrder ?? index + 1)),
        },
      });
    }),
  ]);
}

export async function createGaLesson(input: GaLessonInput, options: GaLessonBuildOptions = {}) {
  const data = buildGaLessonData(input, options);
  if (data.publishStatus === "Published" && !(input.wordIds ?? []).length) {
    throw new Error("Published Ga lessons require at least one Approved Ga word.");
  }
  const lesson = await prisma.gaLesson.create({ data });
  await replaceLessonChildren(lesson.id, input);
  return getGaLessonById(lesson.id);
}

export async function updateGaLesson(id: string, input: Partial<GaLessonInput>, options: GaLessonBuildOptions = {}) {
  const existing = await prisma.gaLesson.findUnique({ where: { id }, include: { words: true } });
  if (!existing) return null;
  const allowedCategories = options.allowedCategories ?? GA_CATEGORIES;
  const categoryAllowList = allowedCategories.includes(existing.category)
    ? allowedCategories
    : [...allowedCategories, existing.category];
  const merged = buildGaLessonData({
    title: input.title ?? existing.title,
    slug: input.slug === undefined ? existing.slug : input.slug,
    description: input.description === undefined ? existing.description : input.description,
    level: input.level ?? existing.level,
    category: input.category ?? existing.category,
    objective: input.objective ?? existing.objective,
    packKey: input.packKey === undefined ? existing.packKey : input.packKey,
    lessonOrder: input.lessonOrder === undefined ? existing.lessonOrder : input.lessonOrder,
    publishStatus: input.publishStatus ?? existing.publishStatus,
  }, { allowedCategories: categoryAllowList });
  const nextWordIds = input.wordIds ?? existing.words.map((word) => word.wordId);
  if (merged.publishStatus === "Published" && !nextWordIds.length) {
    throw new Error("Published Ga lessons require at least one Approved Ga word.");
  }
  await prisma.gaLesson.update({ where: { id }, data: merged });
  if (input.wordIds || input.activities || input.quizQuestions) {
    await replaceLessonChildren(id, { ...input, title: merged.title, level: merged.level, category: merged.category, objective: merged.objective, wordIds: nextWordIds } as GaLessonInput);
  }
  return getGaLessonById(id);
}

export async function getGaLessonById(id: string) {
  return prisma.gaLesson.findUnique({
    where: { id },
    include: {
      words: { include: { word: true }, orderBy: { sortOrder: "asc" } },
      activities: { orderBy: { sortOrder: "asc" } },
      quizQuestions: { include: { word: true }, orderBy: { sortOrder: "asc" } },
    },
  });
}

export async function listAdminGaLessons() {
  return prisma.gaLesson.findMany({
    include: {
      words: { include: { word: true }, orderBy: { sortOrder: "asc" } },
      activities: { orderBy: { sortOrder: "asc" } },
      quizQuestions: { include: { word: true }, orderBy: { sortOrder: "asc" } },
    },
    orderBy: [{ packKey: "asc" }, { lessonOrder: "asc" }, { title: "asc" }],
  });
}

export async function listStudentGaLessons() {
  const lessons = await prisma.gaLesson.findMany({
    where: { publishStatus: "Published" },
    include: {
      words: { include: { word: true }, orderBy: { sortOrder: "asc" } },
      activities: { orderBy: { sortOrder: "asc" } },
      quizQuestions: { include: { word: true }, orderBy: { sortOrder: "asc" } },
    },
    orderBy: [{ packKey: "asc" }, { lessonOrder: "asc" }, { title: "asc" }],
  });
  return Promise.all(lessons.map(async (lesson) => {
    const safeLesson = toStudentSafeGaLesson(lesson);
    if (!safeLesson) return null;
    return {
      ...safeLesson,
      pronunciationReferences: await buildStudentPronunciationReferences(lesson),
    };
  })).then((items) => items.filter((lesson) => lesson !== null));
}

export async function getStudentGaLesson(idOrSlug: string) {
  const lesson = await prisma.gaLesson.findFirst({
    where: { publishStatus: "Published", OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    include: {
      words: { include: { word: true }, orderBy: { sortOrder: "asc" } },
      activities: { orderBy: { sortOrder: "asc" } },
      quizQuestions: { include: { word: true }, orderBy: { sortOrder: "asc" } },
    },
  });
  if (!lesson) return null;
  const safeLesson = toStudentSafeGaLesson(lesson);
  if (!safeLesson) return null;
  return {
    ...safeLesson,
    pronunciationReferences: await buildStudentPronunciationReferences(lesson),
  };
}

export async function recordGaLessonProgress(input: GaProgressInput) {
  const lesson = await prisma.gaLesson.findUnique({ where: { id: input.lessonId }, select: { id: true, publishStatus: true } });
  if (!lesson || lesson.publishStatus !== "Published") throw new Error("Ga lesson is not available to students.");
  const progress = buildGaProgressData(input);
  return prisma.gaStudentLessonProgress.upsert({
    where: { studentId_lessonId: { studentId: input.studentId, lessonId: input.lessonId } },
    create: {
      studentId: input.studentId,
      lessonId: input.lessonId,
      ...progress,
      completedAt: input.completed ? new Date() : null,
    },
    update: {
      ...progress,
      completedAt: input.completed ? new Date() : null,
    },
  });
}

export async function ensureBeginnerPack1GaLessonDrafts() {
  const results = [];
  for (const lesson of BEGINNER_PACK_1_LESSONS) {
    const existing = await prisma.gaLesson.findUnique({ where: { slug: lesson.slug } });
    if (existing) {
      results.push({ slug: lesson.slug, status: "existing" });
      continue;
    }
    await prisma.gaLesson.create({
      data: {
        ...lesson,
        description: "Beginner Pack 1 framework. Add Approved Ga words before publishing.",
        packKey: "beginner-pack-1",
        publishStatus: "Draft",
      },
    });
    results.push({ slug: lesson.slug, status: "created" });
  }
  return results;
}
