"use client";

type Props = {
  spellingFocus?: string | null;
  targetWords?: string[];
  ruleExplanation?: string | null;
  sentenceContext?: string | null;
  onPlayAudio?: (() => void) | null;
};

export default function DaytimeSpellingPanel({
  spellingFocus,
  targetWords,
  ruleExplanation,
  sentenceContext,
  onPlayAudio,
}: Props) {
  if (!spellingFocus && !targetWords?.length && !ruleExplanation && !sentenceContext) return null;

  return (
    <section
      data-testid="daytime-spelling-panel"
      className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-fuchsia-700">Spelling</p>
        {onPlayAudio ? (
          <button
            type="button"
            onClick={onPlayAudio}
            className="rounded-lg border border-fuchsia-200 bg-fuchsia-50 px-3 py-1.5 text-xs font-bold text-fuchsia-900"
            data-testid="daytime-spelling-audio"
          >
            Hear word
          </button>
        ) : null}
      </div>
      {spellingFocus ? (
        <div data-testid="daytime-spelling-focus">
          <p className="text-xs font-semibold text-slate-500">Spelling focus</p>
          <p className="mt-1 text-sm font-bold text-slate-900">{spellingFocus}</p>
        </div>
      ) : null}
      {targetWords?.length ? (
        <div data-testid="daytime-spelling-targets">
          <p className="text-xs font-semibold text-slate-500">Target words</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {targetWords.map((word) => (
              <span
                key={word}
                className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-1 text-sm font-semibold text-fuchsia-900"
              >
                {word}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {ruleExplanation ? (
        <div data-testid="daytime-spelling-rule" className="rounded-xl bg-slate-50 px-3 py-2">
          <p className="text-xs font-semibold text-slate-500">Rule reminder</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-700">{ruleExplanation}</p>
        </div>
      ) : null}
      {sentenceContext ? (
        <div data-testid="daytime-spelling-sentence">
          <p className="text-xs font-semibold text-slate-500">Sentence context</p>
          <p className="mt-1 text-sm italic text-slate-700">{sentenceContext}</p>
        </div>
      ) : null}
    </section>
  );
}
