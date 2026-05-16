import { prisma } from "@/lib/db";
import { assignContentToStudent } from "@/lib/assignments";
import { getOpenAiApiKey } from "@/lib/api-key-config";
import { SKILL_MAP, serializeSkills, skillFocusToCode } from "@/lib/skills";
import { adaptiveDifficultyFromSignals, buildSkillStatesForStudent } from "@/lib/learningEngineV2";
import { composeDailyLessonPlan } from "@/lib/dailyLessonPlanner";
import { extractForcedWarmupSkills } from "@/lib/retentionScheduler";
import { buildLiteracyBridgeItem, buildWeakWordRecoveryBridgeItem } from "@/lib/readingBridge";
import { resolveDashboardTier } from "@/lib/dashboardResolver";
import { extractLearningDnaFromProfileJson } from "@/lib/learning_dna";

type LessonItem = Record<string, unknown>;

type BuildOptions = {
  studentId: string;
  actorUserId?: string;
};

type BuiltLesson = {
  assignmentId: string;
  lessonId: string;
  contentId: string;
  weakSkills: string[];
  reusedExisting: boolean;
};

const OPENAI_MODEL = "gpt-4o-mini";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function parseItems(contentJson: string): LessonItem[] {
  try {
    const parsed = JSON.parse(contentJson) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is LessonItem => Boolean(item && typeof item === "object"));
    }
    if (parsed && typeof parsed === "object") return [parsed as LessonItem];
  } catch {
    return [];
  }
  return [];
}

function isFoundationSkill(skill: string | null | undefined): boolean {
  if (!skill) return false;
  return SKILL_MAP[skill]?.subject === "foundation";
}

function containsFoundationSignals(value: string | null | undefined): boolean {
  const normalized = String(value ?? "").toLowerCase();
  return normalized.includes("letter sound")
    || normalized.includes("phonics")
    || normalized.includes("letter_recognition")
    || normalized.includes("letter_sound");
}

function hasFoundationLessonContent(items: LessonItem[]): boolean {
  return items.some((item) => {
    const skillFocus = String(item.skillFocus ?? "");
    const prompt = String(item.prompt ?? item.question ?? "");
    return containsFoundationSignals(skillFocus) || containsFoundationSignals(prompt);
  });
}

function readingItemsFromPassage(params: { skill: string; label: string; difficulty: number }): LessonItem[] {
  return [
    {
      id: `reading-${params.skill}-1`,
      type: "reading",
      passage: "Lena packs a small red bag for school. She puts in a book, a pencil, and an apple.",
      prompt: "What does Lena put in her bag?",
      question: "What does Lena put in her bag?",
      answer: "a book, a pencil, and an apple",
      options: ["a toy car", "a book, a pencil, and an apple", "only a book"],
      hint: `Look for details linked to ${params.label}.`,
      skillFocus: params.label,
      difficulty: params.difficulty,
    },
  ];
}

function spellingItemsForSkill(params: { skill: string; label: string; difficulty: number }): LessonItem[] {
  const defaults = ["cat", "dog", "sun", "map", "pen"];
  const silentE = ["cake", "bike", "rope", "home", "cube"];
  const words = params.skill === "silent_e" ? silentE : defaults;
  return words.slice(0, 3).map((word, index) => ({
    id: `spelling-${params.skill}-${index + 1}`,
    type: "spelling",
    word,
    prompt: word,
    answer: word,
    hint: `Focus on ${params.label}.`,
    skillFocus: params.label,
    difficulty: params.difficulty,
  }));
}

function mathsItemsForSkill(params: { skill: string; label: string; difficulty: number }): LessonItem[] {
  return [
    {
      id: `math-${params.skill}-1`,
      type: "math",
      prompt: "7 + 2",
      question: "7 + 2",
      answer: 9,
      options: [8, 9, 10],
      hint: `Use ${params.label}.`,
      skillFocus: params.label,
      difficulty: params.difficulty,
    },
    {
      id: `math-${params.skill}-2`,
      type: "math",
      prompt: "10 - 3",
      question: "10 - 3",
      answer: 7,
      options: [6, 7, 8],
      hint: `Use ${params.label}.`,
      skillFocus: params.label,
      difficulty: params.difficulty,
    },
  ];
}

function buildFallbackItems(weakSkills: string[], difficulty: number): LessonItem[] {
  const first = weakSkills[0] ?? "cvc";
  const second = weakSkills[1] ?? first;
  const firstDef = SKILL_MAP[first];
  const secondDef = SKILL_MAP[second];
  const bundle: LessonItem[] = [];

  if (!firstDef || firstDef.subject === "foundation" || firstDef.subject === "spelling") {
    bundle.push(...spellingItemsForSkill({ skill: first, label: firstDef?.label ?? first, difficulty }));
  }
  if (secondDef?.subject === "maths") {
    bundle.push(...mathsItemsForSkill({ skill: second, label: secondDef.label, difficulty }));
  }
  if (secondDef?.subject === "reading") {
    bundle.push(...readingItemsFromPassage({ skill: second, label: secondDef.label, difficulty }));
  }

  if (!bundle.length) {
    bundle.push(...spellingItemsForSkill({ skill: first, label: firstDef?.label ?? first, difficulty }));
  }

  return bundle;
}

function buildAlphabetFoundationItems(difficulty: number): LessonItem[] {
  // Max 2 alphabet warm-up items, then move straight into CVC spelling
  return [
    {
      id: "foundation-letter-1",
      type: "spelling",
      word: "a",
      prompt: "Tap the letter A",
      answer: "a",
      options: ["a", "e", "o"],
      hint: "Look for lowercase a.",
      skillFocus: "Letter recognition",
      difficulty,
    },
    {
      id: "foundation-sound-1",
      type: "spelling",
      word: "m",
      prompt: "Tap the letter M",
      answer: "m",
      options: ["m", "n", "s"],
      hint: "Say the sound out loud: /m/.",
      skillFocus: "Letter sounds (phonics)",
      difficulty,
    },
    // Transition into CVC spelling after the 2 alphabet warm-ups
    {
      id: "foundation-cvc-1",
      type: "spelling",
      word: "cat",
      prompt: "Spell cat",
      answer: "cat",
      hint: "Sound it out: c-a-t.",
      skillFocus: "CVC words",
      difficulty,
    },
    {
      id: "foundation-cvc-2",
      type: "spelling",
      word: "dog",
      prompt: "Spell dog",
      answer: "dog",
      hint: "Sound it out: d-o-g.",
      skillFocus: "CVC words",
      difficulty,
    },
    {
      id: "foundation-cvc-3",
      type: "spelling",
      word: "sit",
      prompt: "Spell sit",
      answer: "sit",
      hint: "Sound it out: s-i-t.",
      skillFocus: "CVC words",
      difficulty,
    },
  ];
}

function normalizeAiItems(raw: unknown, weakSkills: string[], difficulty: number): LessonItem[] {
  if (Array.isArray(raw)) {
    return raw
      .filter((item): item is LessonItem => Boolean(item && typeof item === "object"))
      .map((item, index) => ({
        type: typeof item.type === "string" ? item.type : "spelling",
        id: String(item.id ?? `ai-${index + 1}`),
        skillFocus: String(item.skillFocus ?? SKILL_MAP[weakSkills[0]]?.label ?? weakSkills[0] ?? "practice"),
        difficulty: Number(item.difficulty ?? difficulty),
        ...item,
      }));
  }
  if (raw && typeof raw === "object") {
    const one = raw as LessonItem;
    return [{
      type: String(one.type ?? "spelling"),
      id: String(one.id ?? "ai-1"),
      skillFocus: String(one.skillFocus ?? SKILL_MAP[weakSkills[0]]?.label ?? weakSkills[0] ?? "practice"),
      difficulty: Number(one.difficulty ?? difficulty),
      ...one,
    }];
  }
  return [];
}

export async function generateTargetedItems(input: {
  weakSkills: string[];
  count?: number;
  difficulty?: number;
}): Promise<LessonItem[]> {
  const weakSkills = input.weakSkills.filter(Boolean).slice(0, 3);
  const difficulty = Math.max(1, Math.min(5, input.difficulty ?? 2));
  if (!weakSkills.length) {
    return buildFallbackItems(["cvc"], difficulty);
  }

  const apiKey = await getOpenAiApiKey();
  if (!apiKey) {
    return buildFallbackItems(weakSkills, difficulty);
  }

  const prompt = [
    "Generate child-friendly learning questions for ages 5-7.",
    `Target skills: ${weakSkills.join(", ")}`,
    `Difficulty: ${difficulty}`,
    "Include mixed item types where suitable: spelling, reading, maths.",
    "Return JSON array only.",
    "Each item should include: id, type, prompt or question, answer, optional options, skillFocus, difficulty.",
    `Create ${input.count ?? 5} items.`,
  ].join("\n");

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.4,
        max_tokens: 1200,
        messages: [
          { role: "system", content: "You are an adaptive KS1 tutor. Return valid JSON only." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      return buildFallbackItems(weakSkills, difficulty);
    }

    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const raw = payload.choices?.[0]?.message?.content ?? "[]";
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(cleaned) as unknown;
    const normalized = normalizeAiItems(parsed, weakSkills, difficulty);
    return normalized.length ? normalized : buildFallbackItems(weakSkills, difficulty);
  } catch {
    return buildFallbackItems(weakSkills, difficulty);
  }
}

async function getWeakSkills(studentId: string): Promise<string[]> {
  const [rows, weakAreas, skillStates, student, studentProfile] = await Promise.all([
    prisma.studentSkill.findMany({
      where: { studentId },
      orderBy: [{ status: "asc" }, { accuracy: "asc" }],
    }),
    prisma.weakArea.findMany({
      where: { studentId, status: "active" },
      select: { skillFocus: true, metadataJson: true },
    }),
    buildSkillStatesForStudent(studentId),
    prisma.childProfile.findUnique({
      where: { id: studentId },
      select: { yearGroup: true, age: true },
    }),
    prisma.studentProfile.findUnique({
      where: { childId: studentId },
      select: { aiLearningProfileJson: true },
    }),
  ]);

  const learningDna = extractLearningDnaFromProfileJson(studentProfile?.aiLearningProfileJson ?? null);
  const dnaWeakSkillCodes = (() => {
    if (!learningDna) return [] as string[];
    const fromMistakes = Object.entries(learningDna.recurringMistakes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([key]) => key.split(":")[1] ?? "")
      .map((skill) => skillFocusToCode(skill) ?? skill)
      .filter((skill): skill is string => Boolean(skill && SKILL_MAP[skill]));

    const fromSubjects = Object.entries(learningDna.subjectStates)
      .filter(([, state]) => state.attempts >= 4 && state.accuracy < 68)
      .flatMap(([subject]) => {
        if (subject === "math") return ["word_problems", "addition_basic"];
        if (subject === "reading") return ["inference", "retrieval"];
        return ["cvc", "digraphs"];
      })
      .filter((skill): skill is string => Boolean(SKILL_MAP[skill]));

    return Array.from(new Set([...fromMistakes, ...fromSubjects])).slice(0, 5);
  })();

  const tier = resolveDashboardTier({
    yearGroup: student?.yearGroup,
    ageYears: student?.age ?? null,
  });
  const isPrimaryTier = tier === "primary";

  const letterSound = rows.find((row) => row.skill === "letter_sound");
  if (isPrimaryTier && (!letterSound || letterSound.accuracy < 60 || skillStates.length === 0)) {
    return ["letter_sound", "letter_recognition"];
  }

  if (!isPrimaryTier && skillStates.length === 0) {
    return ["inference", "word_problems"];
  }

  const forcedWarmupSkills = extractForcedWarmupSkills(weakAreas);
  const plan = composeDailyLessonPlan({
    skillStates,
    forcedWarmupSkills,
    fallbackSkill: isPrimaryTier ? "cvc" : "inference",
  });

  const plannedWeak = (isPrimaryTier
    ? plan.weakSkillsForLesson
    : plan.weakSkillsForLesson.filter((skill) => !isFoundationSkill(skill))).slice(0, 2);
  if (plannedWeak.length) {
    return Array.from(new Set([...plannedWeak, ...dnaWeakSkillCodes])).slice(0, 3);
  }

  const weakRows = rows
    .filter((row) => row.status === "weak")
    .filter((row) => isPrimaryTier || !isFoundationSkill(row.skill))
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 2)
    .map((row) => row.skill);

  if (weakRows.length) {
    return Array.from(new Set([...weakRows, ...dnaWeakSkillCodes])).slice(0, 3);
  }

  if (dnaWeakSkillCodes.length) {
    return dnaWeakSkillCodes.slice(0, 3);
  }

  return isPrimaryTier ? ["cvc", "digraphs"] : ["inference", "word_problems"];
}

async function buildFromDatabase(studentId: string, weakSkills: string[]): Promise<LessonItem[]> {
  const [student, recentAttempts] = await Promise.all([
    prisma.childProfile.findUnique({ where: { id: studentId }, select: { level: true } }),
    prisma.attempt.findMany({
      where: { studentId },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { correct: true },
    }),
  ]);
  const baseDifficulty = Math.max(1, Math.min(5, student?.level ?? 2));
  const difficulty = adaptiveDifficultyFromSignals({
    level: Math.max(1, student?.level ?? 1),
    currentDifficulty: baseDifficulty,
    recentCorrectness: recentAttempts.map((attempt) => attempt.correct).reverse(),
  });
  if (weakSkills.includes("letter_sound") || weakSkills.includes("letter_recognition")) {
    return buildAlphabetFoundationItems(difficulty);
  }

  const dbContent = await prisma.aIContentCache.findMany({
    where: {
      OR: [
        { skills: { contains: weakSkills[0] ?? "" } },
        { skillFocus: { contains: SKILL_MAP[weakSkills[0]]?.label ?? weakSkills[0] ?? "" } },
        { skills: { contains: weakSkills[1] ?? "" } },
        { skillFocus: { contains: SKILL_MAP[weakSkills[1]]?.label ?? weakSkills[1] ?? "" } },
      ],
      status: { in: ["reviewed", "approved", "published"] },
    },
    orderBy: { createdAt: "desc" },
    take: 6,
  });

  const items = dbContent.flatMap((content) => parseItems(content.contentJson)).slice(0, 5).map((item) => ({
    ...item,
    difficulty: Number(item.difficulty ?? difficulty),
    supportMode: weakSkills.some((skill) => String(item.skillFocus ?? "").toLowerCase().includes(skill.toLowerCase())) ? "support" : "guide",
  }));
  if (items.length >= 5) return items;

  const generated = await generateTargetedItems({ weakSkills, count: 5 - items.length, difficulty });
  return [...items, ...generated].slice(0, 5);
}

export async function autoBuildLessonForStudent(input: BuildOptions): Promise<BuiltLesson> {
  const student = await prisma.childProfile.findUnique({
    where: { id: input.studentId },
    select: { id: true, level: true, yearGroup: true, age: true },
  });
  if (!student) {
    throw new Error("Student not found.");
  }

  const tier = resolveDashboardTier({
    yearGroup: student.yearGroup,
    ageYears: student.age,
  });
  const isPrimaryTier = tier === "primary";

  const today = todayKey();
  const existingAssignment = await prisma.assignment.findFirst({
    where: {
      studentId: input.studentId,
      status: { in: ["assigned", "in_progress"] },
      content: {
        contentType: "lesson",
        topic: `Auto Lesson ${today}`,
      },
    },
    include: { content: true },
    orderBy: { updatedAt: "desc" },
  });

  if (existingAssignment) {
    const existingSkills = (existingAssignment.content.skills ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const existingItems = parseItems(existingAssignment.content.contentJson);
    const existingLooksFoundational = existingSkills.some((skill) => isFoundationSkill(skill))
      || containsFoundationSignals(existingAssignment.content.skillFocus)
      || hasFoundationLessonContent(existingItems);

    if (!isPrimaryTier && existingLooksFoundational) {
      await prisma.assignment.update({
        where: { id: existingAssignment.id },
        data: { status: "completed" },
      });
    } else {
    const existingLesson = await prisma.lesson.findFirst({
      where: { contentRefs: { contains: existingAssignment.contentId } },
      orderBy: { updatedAt: "desc" },
      select: { id: true, skills: true },
    });

    return {
      assignmentId: existingAssignment.id,
      contentId: existingAssignment.contentId,
      lessonId: existingLesson?.id ?? "",
      weakSkills: existingLesson?.skills ? existingLesson.skills.split(",").map((v) => v.trim()).filter(Boolean) : [],
      reusedExisting: true,
    };
    }
  }

  const weakSkills = await getWeakSkills(input.studentId);
  const items = await buildFromDatabase(input.studentId, weakSkills);

  // Literacy bridges: first recover weak words in reading context, then reinforce
  // recently mastered words so the lesson can both repair and extend learning.
  const [weakBridgeItem, masteredBridgeItem] = await Promise.all([
    buildWeakWordRecoveryBridgeItem(input.studentId, student.level),
    buildLiteracyBridgeItem(input.studentId, student.level),
  ]);

  const bridgeItems: LessonItem[] = [];
  if (weakBridgeItem) {
    bridgeItems.push(weakBridgeItem);
  }
  if (masteredBridgeItem && masteredBridgeItem.bridgeWord !== weakBridgeItem?.bridgeWord) {
    bridgeItems.push(masteredBridgeItem);
  }

  const finalItems = [...items, ...bridgeItems];

  const content = await prisma.aIContentCache.create({
    data: {
      contentType: "lesson",
      level: Math.max(1, Math.min(5, student.level)),
      topic: `Auto Lesson ${today}`,
      skillFocus: SKILL_MAP[weakSkills[0]]?.label ?? weakSkills[0] ?? "Daily practice",
      skills: serializeSkills(weakSkills),
      contentJson: JSON.stringify(finalItems),
      status: "published",
      createdBy: "auto_lesson_engine",
      metadataJson: JSON.stringify({
        type: "auto_lesson",
        date: today,
        weakSkills,
      }),
    },
  });

  const lesson = await prisma.lesson.create({
    data: {
      title: `Focus Practice: ${weakSkills.join(", ") || "core skills"}`,
      subject: "spelling",
      difficulty: Math.max(1, Math.min(5, student.level)),
      status: "published",
      contentRefs: content.id,
      skills: serializeSkills(weakSkills),
    },
  });

  const assignment = await assignContentToStudent({
    studentId: input.studentId,
    contentId: content.id,
    actorUserId: input.actorUserId,
    reason: "auto_lesson",
  });

  return {
    assignmentId: assignment.id,
    lessonId: lesson.id,
    contentId: content.id,
    weakSkills,
    reusedExisting: false,
  };
}
