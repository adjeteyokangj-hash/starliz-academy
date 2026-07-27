export type InstructionalDepthBudget = {
  priorLearningMinutes: number;
  teachingMinutes: number;
  workedExampleMinutes: number;
  guidedMinutes: number;
  independentMinutes: number;
  reflectionMinutes: number;
};

/**
 * Approximate minute split for an academic Short Learning block.
 * Used by bulk lesson-pack transform for short_learning session types.
 */
export function instructionalDepthBudget(targetMinutes: number): InstructionalDepthBudget {
  const total = Math.max(5, Math.round(targetMinutes));
  const priorLearningMinutes = Math.max(1, Math.round(total * 0.11));
  const teachingMinutes = Math.max(2, Math.round(total * 0.22));
  const workedExampleMinutes = Math.max(2, Math.round(total * 0.17));
  const guidedMinutes = Math.max(2, Math.round(total * 0.22));
  const independentMinutes = Math.max(2, Math.round(total * 0.17));
  const used =
    priorLearningMinutes + teachingMinutes + workedExampleMinutes + guidedMinutes + independentMinutes;
  const reflectionMinutes = Math.max(1, total - used);
  return {
    priorLearningMinutes,
    teachingMinutes,
    workedExampleMinutes,
    guidedMinutes,
    independentMinutes,
    reflectionMinutes,
  };
}
