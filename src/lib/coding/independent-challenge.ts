import type { CodingLessonBrief } from "@/lib/coding/catalog";

// Each target is different. A disclosed solution never becomes an independent
// check merely because the learner restored the same starter.
const TARGETS = [
  { x: 2, y: 2 },
  ...Array.from({ length: 16 }, (_, index) => ({ x: index % 4 + 1, y: Math.floor(index / 4) + 1 }))
    .filter((point) => point.x !== 2 || point.y !== 2),
];

export function independentChallenge(lesson: CodingLessonBrief, variant: number): CodingLessonBrief {
  if (variant === 0) return lesson;
  const goal = TARGETS[variant];
  if (!goal) throw new Error("All independent challenge variants have been used. Ask your teacher to review your work.");
  return { ...lesson, stages: lesson.stages.map((stage) => stage.stage === "create" ? {
    ...stage, goal, starter: { blocks: [] },
    prompt: `Fresh independent challenge: the star is ${goal.x} steps right and ${goal.y} steps up. Use loops to reach it without a full answer from the tutor.`,
  } : stage) };
}

export function nextIndependentVariant(current: number): number | null {
  return current + 1 < TARGETS.length ? current + 1 : null;
}
