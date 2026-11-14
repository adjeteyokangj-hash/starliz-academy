import { activityDefinition } from "./catalogue";
import type { Execution, PracticalArtifact } from "./types";
import { visualReview } from "./visual-review";

export function savedReviewAnswers(activityId: string, artifact: PracticalArtifact, execution: Execution | null, explanation: string) {
  if (!explanation.trimStart().startsWith("{") || !execution) return [];
  try {
    const saved = JSON.parse(explanation);
    if (saved?.type !== "visual-review-v1" || !saved.answers || typeof saved.answers !== "object") return [];
    const activity = activityDefinition(activityId);
    const review = activity && visualReview(activity, artifact, execution)?.public;
    if (!review || review.binding !== saved.binding) return [];
    return review.questions.flatMap(question => {
      const choice = question.choices.find(option => option.id === saved.answers[question.id]);
      return choice ? [{ prompt: question.prompt, answer: choice.text }] : [];
    });
  } catch {
    return [];
  }
}
