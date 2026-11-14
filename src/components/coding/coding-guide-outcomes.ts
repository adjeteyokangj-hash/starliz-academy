export type CodingOutcome =
  | { kind: "run"; passed: boolean; error?: string | null; moved?: boolean }
  | { kind: "save"; location: "world" | "lesson" | "versions" };

export function codingOutcome(outcome: CodingOutcome) {
  document.dispatchEvent(new CustomEvent("starliz-coding-outcome", { detail: outcome }));
}

export function mistakeHint({ error, moved }: Extract<CodingOutcome, { kind: "run" }>) {
  if (error && /unavailable|timed? out|timeout|service error/i.test(error)) return "The run could not finish. Try again when the runner is available.";
  if (error && /syntax|indentation|unexpected token/i.test(error)) return "Look at the line marked in the result. Check its punctuation and indentation.";
  if (error && /wall|obstacle|boundary|out of bounds/i.test(error)) return "Replay the movement and find the first step that leaves the route.";
  if (error && /stopped early|expected/i.test(error) && moved) return "Your program got started. Compare the last action you saw with the next step in your plan.";
  if (moved) return "Watch where your program stops. What did you expect it to do next?";
  return "Compare the result with your plan. Which action would you check first?";
}

export type RunHistory = { succeeded: boolean; failed: boolean };
export function codingFeedback(history: RunHistory, outcome: CodingOutcome): { history: RunHistory; message: string; celebrate?: boolean } {
  if (outcome.kind === "save") return {
    history,
    message: outcome.location === "world" ? "Version saved. Find it in Inventions & Skills under Saved project versions." : outcome.location === "versions" ? "Work saved. Find this copy under Saved versions in Instructions." : "Work saved. Reopen this lesson to continue from your saved workspace.",
  };
  if (!outcome.passed) return { history: { ...history, failed: true }, message: mistakeHint(outcome) };
  const message = history.failed ? "Your latest run passed. Compare it with the earlier result to see what improved." :
    history.succeeded ? "Your program ran successfully. Compare the result with your plan." : "Your first successful run! Check the result against your plan.";
  return { history: { succeeded: true, failed: false }, message, celebrate: history.failed || !history.succeeded };
}
