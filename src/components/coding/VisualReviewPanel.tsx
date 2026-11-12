"use client";
import { useState } from "react";
import type { VisualReview } from "@/lib/coding/learning/visual-review";

export default function VisualReviewPanel({ review, saved, busy, onSave, onCheck }: { review: VisualReview; saved: string; busy: boolean; onSave: (submission: string) => void; onCheck: (submission: string) => void }) {
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    try {
      const draft = JSON.parse(saved);
      if (draft?.type === "visual-review-v1" && draft.binding === review.binding && draft.answers && typeof draft.answers === "object") return Object.fromEntries(review.questions.filter(question => question.choices.some(choice => choice.id === draft.answers[question.id])).map(question => [question.id, draft.answers[question.id]]));
    } catch { /* Earlier written drafts remain in the saved workspace. */ }
    return {};
  });
  const submission = JSON.stringify({ type: "visual-review-v1", binding: review.binding, answers });
  const complete = review.questions.every(question => question.choices.some(choice => choice.id === answers[question.id]));
  function readAloud() {
    if (!("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const speech = new SpeechSynthesisUtterance(review.questions.map(question => `${question.prompt} ${question.choices.map(choice => choice.text).join(". ")}`).join(". "));
    speech.lang = "en-GB"; speech.rate = .85; speechSynthesis.speak(speech);
  }
  return <section aria-label="Show what you learned" className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
    <h2 className="text-xl font-bold">Show what you learned</h2>
    <p className="text-base leading-7">Replay your program and choose your answers. You do not need to type.</p>
    <button type="button" className="min-h-12 rounded-xl border border-sky-800 px-4 py-3 font-semibold text-sky-900" onClick={readAloud}>Read questions aloud</button>
    {review.questions.map((question, index) => <fieldset key={question.id} disabled={busy} className="space-y-3"><legend className="mb-3 text-lg font-bold">{index + 1}. {question.prompt}</legend><div className="grid gap-3 sm:grid-cols-2">{question.choices.map(choice => <label key={choice.id} className={`flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border-2 p-4 text-lg ${answers[question.id] === choice.id ? "border-indigo-600 bg-indigo-50" : "border-slate-200 bg-slate-50"}`}><input type="radio" name={`review-${question.id}`} value={choice.id} checked={answers[question.id] === choice.id} onChange={() => setAnswers(previous => ({ ...previous, [question.id]: choice.id }))} className="h-5 w-5 shrink-0" /><span>{choice.text}</span></label>)}</div></fieldset>)}
    <div className="flex flex-wrap gap-3"><button type="button" disabled={busy || !complete} className="min-h-12 rounded-xl bg-sky-800 px-5 py-3 text-lg font-bold text-white disabled:opacity-50" onClick={() => onCheck(submission)}>Check my choices</button><button type="button" disabled={busy} className="min-h-12 rounded-xl border border-slate-300 px-4 py-3 font-semibold disabled:opacity-50" onClick={() => onSave(submission)}>Save my choices</button></div>
  </section>;
}
