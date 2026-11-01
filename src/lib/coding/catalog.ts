import type { CodingPathwayId, CodingProgram, CodingStage, GridPoint } from "@/lib/coding/types";
import { PUBLISHED_CODING_LESSON_ID } from "@/lib/coding/types";

export type CodingPathwaySummary = {
  id: CodingPathwayId;
  title: string;
  years: string;
  mainLearning: string;
  exampleProjects: string[];
  courses: Array<{
    id: string;
    title: string;
    modules: Array<{
      id: string;
      title: string;
      lessons: Array<{ id: string; title: string; published: boolean }>;
    }>;
  }>;
};

export type CodingChoice = { id: string; label: string };

export type CodingStageBrief = {
  stage: CodingStage;
  title: string;
  prompt: string;
  choices?: CodingChoice[];
  starter: CodingProgram;
  goal: GridPoint | null;
  example: CodingProgram | null;
};

export type CodingLessonBrief = {
  id: string;
  title: string;
  pathwayId: CodingPathwayId;
  pathwayTitle: string;
  courseTitle: string;
  moduleTitle: string;
  yearBand: string;
  yearMin: number;
  yearMax: number;
  prerequisites: string[];
  learningObjective: string;
  difficulty: number;
  difficultyLabel: string;
  masteryCriteria: string[];
  skills: string[];
  challenge: string;
  project: string;
  voiceHelp: boolean;
  published: boolean;
  editor: "blocks" | "text";
  stages: CodingStageBrief[];
};

const repeat = (id: string, times: number, direction: "up" | "down" | "left" | "right"): CodingProgram => ({
  blocks: [{ id, kind: "repeat", times, body: [{ id: `${id}-move`, kind: "move", direction }] }],
});

const exampleLoop = repeat("example-repeat", 3, "right");

export const CODING_PATHWAY_CATALOG: CodingPathwaySummary[] = [
  {
    id: "foundations",
    title: "Coding Foundations",
    years: "Years 1–2",
    mainLearning: "Instructions, sequencing, patterns, simple repetition and finding mistakes",
    exampleProjects: ["Guide a character through a maze", "Animate a story"],
    courses: [
      {
        id: "first-instructions",
        title: "First Instructions",
        modules: [
          {
            id: "sequences",
            title: "Putting Steps in Order",
            lessons: [{ id: "what-is-an-instruction", title: "What is an instruction?", published: false }],
          },
        ],
      },
    ],
  },
  {
    id: "block-coding",
    title: "Block Coding",
    years: "Years 3–4",
    mainLearning: "Events, loops, conditions, coordinates and simple variables",
    exampleProjects: ["Animated quiz", "Maze game", "Interactive story"],
    courses: [
      {
        id: "first-games",
        title: "Build Your First Games",
        modules: [
          {
            id: "repeating-actions",
            title: "Repeating Actions",
            lessons: [{ id: PUBLISHED_CODING_LESSON_ID, title: "Understanding Loops", published: true }],
          },
        ],
      },
    ],
  },
  {
    id: "blocks-to-text",
    title: "Blocks to Text",
    years: "Years 5–6",
    mainLearning: "Variables, functions, debugging, introductory HTML/CSS and Python",
    exampleProjects: ["Personal webpage", "Calculator", "Number game"],
    courses: [
      {
        id: "first-text",
        title: "From Blocks to Text",
        modules: [
          {
            id: "variables",
            title: "Remembering a Value",
            lessons: [{ id: "what-is-a-variable", title: "What is a variable?", published: false }],
          },
        ],
      },
    ],
  },
  {
    id: "programming-web",
    title: "Programming and Web",
    years: "Years 7–9",
    mainLearning: "Python, HTML, CSS, JavaScript, algorithms and data",
    exampleProjects: ["Interactive website", "Revision quiz", "Data project"],
    courses: [
      {
        id: "web-and-python",
        title: "Programs and Pages",
        modules: [
          {
            id: "python-start",
            title: "Python Starts Here",
            lessons: [{ id: "first-python-program", title: "Your first Python program", published: false }],
          },
        ],
      },
    ],
  },
  {
    id: "applied",
    title: "Applied Computing",
    years: "Years 10–11",
    mainLearning: "Decomposition, searching, sorting, files, testing, databases and secure coding principles",
    exampleProjects: ["Revision application", "Inventory simulator", "Portfolio project"],
    courses: [
      {
        id: "applied-projects",
        title: "Applied Projects",
        modules: [
          {
            id: "testing",
            title: "Testing a Program",
            lessons: [{ id: "plan-a-test", title: "Plan a test", published: false }],
          },
        ],
      },
    ],
  },
];

export const UNDERSTANDING_LOOPS: CodingLessonBrief = {
  id: PUBLISHED_CODING_LESSON_ID,
  title: "Understanding Loops",
  pathwayId: "block-coding",
  pathwayTitle: "Block Coding",
  courseTitle: "Build Your First Games",
  moduleTitle: "Repeating Actions",
  yearBand: "Years 3–4",
  yearMin: 3,
  yearMax: 4,
  prerequisites: ["Give instructions in order"],
  learningObjective: "Use a repeat block so a character repeats a movement without writing the same move again and again.",
  difficulty: 2,
  difficultyLabel: "Core",
  masteryCriteria: [
    "Predict what a repeat block will do before it runs",
    "Build a loop that meets the task",
    "Find and repair a deliberate mistake",
    "Explain why a loop was used",
    "Reach a new goal with little help",
  ],
  skills: [
    "Using a loop to repeat a movement",
    "Finding a wrong direction inside a loop",
  ],
  challenge: "Make a character repeat a movement",
  project: "Build a path to the star using loops",
  voiceHelp: true,
  published: true,
  editor: "blocks",
  stages: [
    {
      stage: "discover",
      title: "Discover",
      prompt: "Watch the character. A repeat block holds one move and runs it again. Your goal in this lesson is to send the character to the star by repeating a move.",
      starter: exampleLoop,
      goal: { x: 3, y: 0 },
      example: exampleLoop,
    },
    {
      stage: "predict",
      title: "Predict",
      prompt: "Before you run it, what will this program do? Repeat 3, with move right inside.",
      choices: [
        { id: "right-once", label: "The character moves right once" },
        { id: "right-three", label: "The character moves right three times" },
        { id: "up-three", label: "The character moves up three times" },
        { id: "nothing", label: "Nothing happens, because repeat only counts" },
      ],
      starter: exampleLoop,
      goal: { x: 3, y: 0 },
      example: exampleLoop,
    },
    {
      stage: "build",
      title: "Build together",
      prompt: "The star is four steps to the right. Add a repeat block, set it to 4, and put move right inside it.",
      starter: { blocks: [] },
      goal: { x: 4, y: 0 },
      example: null,
    },
    {
      stage: "practise",
      title: "Practise",
      prompt: "The star is three steps up. Use a loop. Write the move once, not three separate times.",
      starter: { blocks: [] },
      goal: { x: 0, y: 3 },
      example: null,
    },
    {
      stage: "debug",
      title: "Debug",
      prompt: "This program is supposed to reach the star on the right, but the character walks the wrong way. Find the mistake and repair it.",
      starter: repeat("bug-repeat", 3, "left"),
      goal: { x: 3, y: 0 },
      example: null,
    },
    {
      stage: "create",
      title: "Create",
      prompt: "The star is two steps right and two steps up. Use loops to get there. Try this with as little help as you can.",
      starter: { blocks: [] },
      goal: { x: 2, y: 2 },
      example: null,
    },
    {
      stage: "review",
      title: "Review",
      prompt: "Explain how your loop works. Say what it repeats and why you did not write the same move many times.",
      starter: { blocks: [] },
      goal: null,
      example: null,
    },
  ],
};

export function publishedCodingLessons(): CodingLessonBrief[] {
  return [UNDERSTANDING_LOOPS];
}

export function codingLessonById(lessonId: string): CodingLessonBrief | null {
  if (lessonId === UNDERSTANDING_LOOPS.id) return UNDERSTANDING_LOOPS;
  for (const pathway of CODING_PATHWAY_CATALOG) {
    for (const course of pathway.courses) {
      for (const courseModule of course.modules) {
        if (courseModule.lessons.some((lesson) => lesson.id === lessonId && !lesson.published)) {
          return null;
        }
      }
    }
  }
  return null;
}

export function stageBrief(lesson: CodingLessonBrief, stage: CodingStage): CodingStageBrief {
  const found = lesson.stages.find((item) => item.stage === stage);
  if (!found) throw new Error(`Missing coding stage ${stage}`);
  return found;
}

export function yearNumber(yearGroup: string | null | undefined): number | null {
  const match = /(\d{1,2})/.exec(yearGroup ?? "");
  if (!match) return null;
  const year = Number(match[1]);
  if (!Number.isFinite(year) || year < 1 || year > 11) return null;
  return year;
}

export function pathwayForYear(yearGroup: string | null | undefined): CodingPathwayId {
  const year = yearNumber(yearGroup) ?? 4;
  if (year <= 2) return "foundations";
  if (year <= 4) return "block-coding";
  if (year <= 6) return "blocks-to-text";
  if (year <= 9) return "programming-web";
  return "applied";
}

export function pathwaySummary(id: CodingPathwayId): CodingPathwaySummary {
  const found = CODING_PATHWAY_CATALOG.find((pathway) => pathway.id === id);
  if (!found) throw new Error(`Missing coding pathway ${id}`);
  return found;
}
