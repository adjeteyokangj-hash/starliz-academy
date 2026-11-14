export type CodingNextStep =
  | { state: "next"; activity: { title: string; href: string } }
  | { state: "prerequisites" }
  | { state: "caught-up" };

/** Candidates must already be publication-filtered and scoped to the learner. */
export function codingNextStep(candidates: ReadonlyArray<{ title: string; href: string; mastered: boolean; unlocked: boolean }>): CodingNextStep {
  const remaining = candidates.filter(candidate => !candidate.mastered);
  const next = remaining.find(candidate => candidate.unlocked);
  if (next) return { state: "next", activity: { title: next.title, href: next.href } };
  return { state: remaining.length ? "prerequisites" : "caught-up" };
}
