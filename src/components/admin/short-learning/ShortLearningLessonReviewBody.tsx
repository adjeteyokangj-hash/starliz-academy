import type { ReactNode } from "react";
import type { PlayableLessonParseResult } from "@/lib/schools/parse-playable-lesson-content";

type Props = {
  parsed: PlayableLessonParseResult;
  defaultOpen?: boolean;
};

function Section({
  title,
  children,
  open = false,
}: {
  title: string;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details
      open={open}
      className="rounded-[var(--admin-radius)] border border-[var(--admin-border)]"
      style={{ background: "var(--admin-rail)" }}
    >
      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] text-[var(--admin-muted)]">
        {title}
      </summary>
      <div className="space-y-3 border-t border-[var(--admin-border)] px-3 py-3 text-sm text-[var(--admin-text)]">
        {children}
      </div>
    </details>
  );
}

export default function ShortLearningLessonReviewBody({ parsed, defaultOpen = true }: Props) {
  if (!parsed.ok) {
    return (
      <div className="mt-4 rounded-[var(--admin-radius)] border border-rose-500/40 bg-rose-500/10 px-3 py-3 text-sm text-rose-100">
        <p className="font-semibold">Lesson content cannot be reviewed</p>
        <p className="mt-1 text-rose-100/90">{parsed.error}</p>
        {parsed.approvalDenialReasons.length ? (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
            {parsed.approvalDenialReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {parsed.approvalDenialReasons.length ? (
        <div className="rounded-[var(--admin-radius)] border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          <p className="font-semibold">Approval blocked</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-xs">
            {parsed.approvalDenialReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <Section title="Learning objective" open={defaultOpen}>
        <p>{parsed.learningObjective || "No learning objective recorded for this block."}</p>
      </Section>

      {parsed.priorLearningWarmup ? (
        <Section title="Prior-learning warm-up" open={defaultOpen}>
          <p className="whitespace-pre-wrap leading-6">{parsed.priorLearningWarmup}</p>
        </Section>
      ) : null}

      {parsed.explanation ? (
        <Section title="Teaching explanation" open={defaultOpen}>
          <p className="whitespace-pre-wrap leading-6">{parsed.explanation}</p>
        </Section>
      ) : null}

      {parsed.ruleExplanation || parsed.spellingFocus || parsed.targetWords.length ? (
        <Section title="Spelling focus" open={defaultOpen}>
          {parsed.spellingFocus ? <p className="font-semibold">{parsed.spellingFocus}</p> : null}
          {parsed.ruleExplanation ? (
            <p className="whitespace-pre-wrap leading-6">{parsed.ruleExplanation}</p>
          ) : null}
          {parsed.targetWords.length ? (
            <p className="text-[var(--admin-muted)]">Target words: {parsed.targetWords.join(", ")}</p>
          ) : null}
        </Section>
      ) : null}

      {parsed.passage?.text ? (
        <Section title="Passage" open={defaultOpen}>
          <p className="font-semibold">{parsed.passage.title || "Reading passage"}</p>
          <p className="mt-2 whitespace-pre-wrap leading-6">{parsed.passage.text}</p>
          {parsed.passage.wordCount ? (
            <p className="text-xs text-[var(--admin-muted)]">{parsed.passage.wordCount} words</p>
          ) : null}
        </Section>
      ) : null}

      {parsed.vocabulary.length ? (
        <Section title="Vocabulary" open={defaultOpen}>
          <ul className="space-y-2">
            {parsed.vocabulary.map((item) => (
              <li key={`${item.word}-${item.meaning}`}>
                <span className="font-semibold">{item.word}</span>
                <span className="text-[var(--admin-muted)]"> — {item.meaning}</span>
                {item.example ? <p className="mt-0.5 text-xs text-[var(--admin-muted)]">Example: {item.example}</p> : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {parsed.workedExamples.length ? (
        <Section title="Worked examples" open={defaultOpen}>
          {parsed.workedExamples.map((example, index) => (
            <div key={`ex-${index}`} className="rounded-lg border border-[var(--admin-border)] px-3 py-2">
              <p className="font-semibold">Example {index + 1}</p>
              <p className="mt-1 whitespace-pre-wrap">{example.question}</p>
              {example.steps.length ? (
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-[var(--admin-muted)]">
                  {example.steps.map((step, stepIndex) => (
                    <li key={`ex-${index}-step-${stepIndex}`}>{step}</li>
                  ))}
                </ol>
              ) : null}
              <p className="mt-2 text-emerald-300">
                Expected answer: <span className="font-semibold text-[var(--admin-text)]">{example.answer}</span>
              </p>
            </div>
          ))}
        </Section>
      ) : null}

      {parsed.activities.length ? (
        <Section title={`Activities (${parsed.activities.length})`} open={defaultOpen}>
          <ul className="space-y-2">
            {parsed.activities.map((activity, index) => (
              <li key={`act-${index}-${activity.kind}`} className="flex flex-wrap gap-2">
                <span className="font-semibold capitalize">{activity.kind.replace(/-/g, " ")}</span>
                <span className="text-[var(--admin-muted)]">{activity.estimatedMinutes}m</span>
                {activity.title ? <span className="text-[var(--admin-muted)]">— {activity.title}</span> : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {parsed.scenarioOrObservation ? (
        <Section title="Scenario / observation" open={false}>
          <p className="whitespace-pre-wrap leading-6">{parsed.scenarioOrObservation}</p>
        </Section>
      ) : null}

      {parsed.misconceptions.length ? (
        <Section title="Common misconceptions" open={defaultOpen}>
          <ul className="list-disc space-y-1 pl-5">
            {parsed.misconceptions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Section>
      ) : null}

      {parsed.reflectionCheck ? (
        <Section title="Reflection / check for understanding" open={defaultOpen}>
          <p className="whitespace-pre-wrap leading-6">{parsed.reflectionCheck}</p>
        </Section>
      ) : null}

      {parsed.transitionNote ? (
        <Section title="Transition / next step" open={defaultOpen}>
          <p className="whitespace-pre-wrap leading-6">{parsed.transitionNote}</p>
        </Section>
      ) : null}

      {parsed.questions.length ? (
        <Section title={`Questions (${parsed.questions.length})`} open={defaultOpen}>
          {parsed.questions.map((question, index) => (
            <div key={`q-${index}`} className="rounded-lg border border-[var(--admin-border)] px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--admin-muted)]">
                Question {index + 1}
              </p>
              <p className="mt-1 whitespace-pre-wrap font-medium">{question.prompt}</p>
              {question.choices.length ? (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--admin-muted)]">
                  {question.choices.map((choice) => (
                    <li key={choice}>{choice}</li>
                  ))}
                </ul>
              ) : null}
              <p className="mt-2 text-emerald-300">
                Expected answer:{" "}
                <span className="font-semibold text-[var(--admin-text)]">{question.answer || "—"}</span>
              </p>
              {question.explanation ? (
                <p className="mt-1 text-sm text-[var(--admin-muted)]">Feedback: {question.explanation}</p>
              ) : null}
              {question.hints.length ? (
                <div className="mt-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--admin-muted)]">Hints</p>
                  <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-[var(--admin-muted)]">
                    {question.hints.map((hint, hintIndex) => (
                      <li key={`q-${index}-hint-${hintIndex}`}>{hint}</li>
                    ))}
                  </ol>
                </div>
              ) : null}
              {question.breakdown ? (
                <div className="mt-2 rounded-md border border-[var(--admin-border)] px-2 py-2 text-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--admin-muted)]">
                    Breakdown
                  </p>
                  {question.breakdown.simplerQuestion ? (
                    <p className="mt-1">Simpler question: {question.breakdown.simplerQuestion}</p>
                  ) : null}
                  {question.breakdown.startingPoint ? (
                    <p className="mt-1 text-[var(--admin-muted)]">Start: {question.breakdown.startingPoint}</p>
                  ) : null}
                  {question.breakdown.steps.length ? (
                    <ol className="mt-1 list-decimal space-y-1 pl-5 text-[var(--admin-muted)]">
                      {question.breakdown.steps.map((step, stepIndex) => (
                        <li key={`q-${index}-bd-${stepIndex}`}>{step}</li>
                      ))}
                    </ol>
                  ) : null}
                  {question.breakdown.keyWords.length ? (
                    <ul className="mt-2 space-y-1 text-[var(--admin-muted)]">
                      {question.breakdown.keyWords.map((kw) => (
                        <li key={`${kw.word}-${kw.meaning}`}>
                          <span className="font-semibold text-[var(--admin-text)]">{kw.word}</span> — {kw.meaning}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </Section>
      ) : null}

      <Section title="Validator and generation" open={false}>
        <p>
          Generation status:{" "}
          <span className="font-semibold">{parsed.generationStatus ?? "unknown"}</span>
        </p>
        {parsed.failureReason ? (
          <p className="mt-1 text-rose-300">Failure reason: {parsed.failureReason}</p>
        ) : null}
        <p className="mt-1 text-[var(--admin-muted)]">
          Subject mode: {parsed.subjectType} · Estimated {parsed.estimatedMinutes}m ·{" "}
          {parsed.questions.length} question{parsed.questions.length === 1 ? "" : "s"} ·{" "}
          {parsed.activities.length} activit{parsed.activities.length === 1 ? "y" : "ies"}
        </p>
      </Section>
    </div>
  );
}
