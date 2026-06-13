export type GaLessonAdminWord = {
  id: string;
  englishWord: string;
  gaWord: string;
  category: string;
  level: string;
};

export type GaLessonAdminRow = {
  id: string;
  title: string;
  level: string;
  category: string;
  objective: string;
  publishStatus: string;
  packKey: string | null;
  lessonOrder: number;
  description?: string | null;
  words: Array<{ wordId: string; word: GaLessonAdminWord }>;
  quizQuestions?: Array<{ id: string }>;
};

export type GaLessonFormState = {
  title: string;
  description: string;
  level: string;
  category: string;
  objective: string;
  publishStatus: string;
  packKey: string;
  lessonOrder: string;
};

export type GaLessonEditorState = {
  lessonId: string;
  lessonTitle: string;
  form: GaLessonFormState;
  selectedWordIds: string[];
  loadedQuizQuestionIds: string[];
};

export const GA_ALPHABET_LESSON_ID = "cmqc9bbjs001iju04qhydth4z";
export const GA_ALPHABET_LESSON_TITLE = "Ga Alphabet: A, B, D, E, Ɛ";
export const HELLO_OBJECTIVE = "Recognise and practise hello, yes, and no.";
export const GA_ALPHABET_EXPECTED_OBJECTIVE = "Recognise and practise the first Ga alphabet letters: A, B, D, E, and Ɛ.";

export function lessonFormFromRow(lesson: GaLessonAdminRow): GaLessonFormState {
  return {
    title: lesson.title,
    description: lesson.description ?? "",
    level: lesson.level,
    category: lesson.category,
    objective: lesson.objective,
    publishStatus: lesson.publishStatus,
    packKey: lesson.packKey ?? "beginner-pack-1",
    lessonOrder: String(lesson.lessonOrder),
  };
}

export function selectedWordIdsFromLesson(lesson: GaLessonAdminRow): string[] {
  return lesson.words.map((row) => row.wordId);
}

export function buildLessonEditorStateById(
  lessonId: string,
  lessons: GaLessonAdminRow[],
): GaLessonEditorState | null {
  const lesson = lessons.find((candidate) => candidate.id === lessonId);
  if (!lesson) return null;
  return {
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    form: lessonFormFromRow(lesson),
    selectedWordIds: selectedWordIdsFromLesson(lesson),
    loadedQuizQuestionIds: lesson.quizQuestions?.map((question) => question.id) ?? [],
  };
}

export function hasUnexpectedGaAlphabetObjective(lesson: Pick<GaLessonAdminRow, "id" | "title" | "objective">): boolean {
  if (lesson.id !== GA_ALPHABET_LESSON_ID) return false;
  return lesson.objective.trim() === HELLO_OBJECTIVE;
}

export function mergeLessonLinkedWords(
  approvedWords: GaLessonAdminWord[],
  lessons: GaLessonAdminRow[],
): GaLessonAdminWord[] {
  const byId = new Map<string, GaLessonAdminWord>();
  for (const word of approvedWords) byId.set(word.id, word);
  for (const lesson of lessons) {
    for (const row of lesson.words) {
      if (!byId.has(row.word.id)) byId.set(row.word.id, row.word);
    }
  }
  return Array.from(byId.values());
}

export function getLessonUpsertRequest(editingId: string | null): { method: "POST" | "PATCH"; url: string } {
  if (editingId) {
    return { method: "PATCH", url: `/api/admin/ga/lessons/${editingId}` };
  }
  return { method: "POST", url: "/api/admin/ga/lessons" };
}
