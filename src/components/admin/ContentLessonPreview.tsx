"use client";

type PreviewQuestion = {
  id?: string;
  question?: string;
  prompt?: string;
  word?: string;
  options?: string[];
  choices?: unknown[];
  answer?: unknown;
  correctAnswer?: unknown;
  explanation?: string;
  hint?: string;
};

type ReadingShape = {
  title?: string;
  passage?: string;
  vocabularyWords?: string[];
  questions?: PreviewQuestion[];
  yearGroup?: string;
  skillFocus?: string;
  subject?: string;
};

function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function choiceList(row: PreviewQuestion): string[] {
  const raw = row.options ?? row.choices ?? [];
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => asString(entry)).filter(Boolean);
}

function correctAnswer(row: PreviewQuestion): string {
  return asString(row.answer ?? row.correctAnswer);
}

function parsePreview(contentJson: string): {
  kind: "reading" | "items" | "empty" | "invalid";
  reading?: ReadingShape;
  items?: PreviewQuestion[];
} {
  try {
    const parsed = JSON.parse(contentJson) as unknown;
    if (Array.isArray(parsed)) {
      return { kind: "items", items: parsed as PreviewQuestion[] };
    }
    if (parsed && typeof parsed === "object") {
      const row = parsed as ReadingShape;
      if (row.passage || Array.isArray(row.questions)) {
        return { kind: "reading", reading: row };
      }
      return { kind: "items", items: [parsed as PreviewQuestion] };
    }
    return { kind: "empty" };
  } catch {
    return { kind: "invalid" };
  }
}

function QuestionCard({
  index,
  row,
}: {
  index: number;
  row: PreviewQuestion;
}) {
  const prompt = asString(row.question ?? row.prompt ?? (row.word ? `Spell: ${row.word}` : "")) || `Item ${index + 1}`;
  const choices = choiceList(row);
  const answer = correctAnswer(row);
  const explanation = asString(row.explanation ?? row.hint);

  return (
    <article className="rounded-xl border border-slate-700/80 bg-slate-950/50 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Question {index + 1}</p>
      <p className="mt-2 text-sm font-semibold text-white">{prompt}</p>
      {choices.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {choices.map((choice) => {
            const isCorrect = answer && choice === answer;
            return (
              <li
                key={`${index}-${choice}`}
                className={`rounded-lg border px-3 py-2 text-xs ${
                  isCorrect
                    ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100"
                    : "border-slate-700 bg-slate-900/60 text-slate-300"
                }`}
              >
                {choice}
                {isCorrect ? <span className="ml-2 font-bold uppercase tracking-wide text-emerald-300">Correct</span> : null}
              </li>
            );
          })}
        </ul>
      ) : answer ? (
        <p className="mt-3 text-xs text-emerald-200">
          Answer: <span className="font-semibold">{answer}</span>
        </p>
      ) : null}
      {explanation ? <p className="mt-3 text-xs text-slate-400">{explanation}</p> : null}
    </article>
  );
}

export default function ContentLessonPreview({
  contentType,
  contentJson,
}: {
  contentType: string;
  contentJson: string;
}) {
  const preview = parsePreview(contentJson);

  if (preview.kind === "invalid") {
    return (
      <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
        Content JSON is invalid, so the lesson preview cannot render.
      </p>
    );
  }

  if (preview.kind === "empty") {
    return <p className="text-sm text-slate-400">No playable items found in this content pack.</p>;
  }

  if (preview.kind === "reading" && preview.reading) {
    const reading = preview.reading;
    const questions = Array.isArray(reading.questions) ? reading.questions : [];
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-700/80 bg-slate-950/45 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            {contentType} preview
          </p>
          <h3 className="mt-2 text-lg font-black text-white">{reading.title || "Reading lesson"}</h3>
          <p className="mt-1 text-xs text-slate-400">
            {[reading.subject, reading.yearGroup, reading.skillFocus].filter(Boolean).join(" · ")}
          </p>
          {reading.passage ? (
            <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-200">{reading.passage}</p>
          ) : null}
          {Array.isArray(reading.vocabularyWords) && reading.vocabularyWords.length > 0 ? (
            <p className="mt-3 text-xs text-slate-400">
              Vocabulary: {reading.vocabularyWords.join(", ")}
            </p>
          ) : null}
        </div>
        <div className="grid gap-3">
          {questions.map((row, index) => (
            <QuestionCard key={asString(row.id) || `q-${index}`} index={index} row={row} />
          ))}
        </div>
      </div>
    );
  }

  const items = preview.items ?? [];
  const sharedPassage = items
    .map((row) => asString((row as PreviewQuestion & { passage?: string }).passage))
    .find(Boolean);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-700/80 bg-slate-950/45 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          {contentType} preview
        </p>
        <p className="mt-2 text-sm text-slate-300">
          {items.length} playable item{items.length === 1 ? "" : "s"} students will see in the lesson.
        </p>
        {sharedPassage ? (
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-200">{sharedPassage}</p>
        ) : null}
      </div>
      <div className="grid gap-3">
        {items.map((row, index) => (
          <QuestionCard key={asString(row.id) || `item-${index}`} index={index} row={row} />
        ))}
      </div>
    </div>
  );
}
