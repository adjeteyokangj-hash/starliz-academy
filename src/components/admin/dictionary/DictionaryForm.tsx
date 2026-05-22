import type { ReactNode } from "react";

export type DictionaryFormValues = {
  word: string;
  subject: string;
  keyStage: string;
  yearGroup: string;
  difficulty: string;
  topic: string;
  skillFocus: string;
  definitionChild: string;
  definitionParent: string;
  exampleSentence: string;
  secondExampleSentence: string;
  phonicsPattern: string;
  syllables: string;
  pronunciationHint: string;
  synonyms: string;
  antonyms: string;
  relatedWords: string;
  isTrickyWord: boolean;
  isTopicKeyword: boolean;
  isMathsKeyword: boolean;
  isScienceKeyword: boolean;
  isReadingKeyword: boolean;
  isSpellingKeyword: boolean;
  interventionTags: string;
  senTags: string;
  safeguardingTags: string;
  curriculumTags: string;
  active: boolean;
};

type Props = {
  value: DictionaryFormValues;
  onChange: (next: DictionaryFormValues) => void;
  onSubmit: () => void;
  onCancel: () => void;
  saving: boolean;
  mode: "create" | "edit";
};

const SUBJECTS = ["english", "spelling", "reading", "maths", "science"];
const KEY_STAGES = ["early-years", "ks1", "ks2", "ks3", "ks4", "ks5"];
const DIFFICULTIES = ["easy", "medium", "hard", "challenge"];

function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`space-y-2 text-sm font-bold text-slate-200 ${wide ? "md:col-span-2" : ""}`}>
      <span className="block text-xs font-black uppercase tracking-[0.16em] text-slate-400">{label}</span>
      {children}
    </label>
  );
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm font-bold text-slate-200">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-cyan-500 focus:ring-cyan-500" />
      <span>{label}</span>
    </label>
  );
}

export default function DictionaryForm({ value, onChange, onSubmit, onCancel, saving, mode }: Props) {
  return (
    <section className="rounded-3xl border border-slate-800/80 bg-slate-950/60 p-5 shadow-lg shadow-slate-950/20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">{mode === "edit" ? "Edit word" : "Add word"}</p>
          <h3 className="mt-1 text-2xl font-black text-white">Dictionary entry</h3>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="rounded-2xl border border-slate-700 px-4 py-2.5 text-sm font-black text-slate-200 hover:bg-slate-900">Clear</button>
          <button type="button" onClick={onSubmit} disabled={saving} className="rounded-2xl bg-cyan-500 px-4 py-2.5 text-sm font-black text-white hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60">
            {saving ? "Saving..." : mode === "edit" ? "Save changes" : "Create word"}
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Field label="Word"><input value={value.word} onChange={(event) => onChange({ ...value, word: event.target.value })} className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-cyan-500" /></Field>
        <Field label="Subject"><select value={value.subject} onChange={(event) => onChange({ ...value, subject: event.target.value })} className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-cyan-500">{SUBJECTS.map((subject) => <option key={subject} value={subject}>{subject}</option>)}</select></Field>
        <Field label="Key stage"><select value={value.keyStage} onChange={(event) => onChange({ ...value, keyStage: event.target.value })} className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-cyan-500">{KEY_STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}</select></Field>
        <Field label="Year group"><input value={value.yearGroup} onChange={(event) => onChange({ ...value, yearGroup: event.target.value })} placeholder="Year 1" className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-500" /></Field>
        <Field label="Difficulty"><select value={value.difficulty} onChange={(event) => onChange({ ...value, difficulty: event.target.value })} className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-cyan-500">{DIFFICULTIES.map((level) => <option key={level} value={level}>{level}</option>)}</select></Field>
        <Field label="Topic"><input value={value.topic} onChange={(event) => onChange({ ...value, topic: event.target.value })} className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-cyan-500" /></Field>
        <Field label="Skill focus"><input value={value.skillFocus} onChange={(event) => onChange({ ...value, skillFocus: event.target.value })} className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-cyan-500" /></Field>
        <Field label="Child-friendly definition" wide><textarea value={value.definitionChild} onChange={(event) => onChange({ ...value, definitionChild: event.target.value })} rows={3} className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-cyan-500" /></Field>
        <Field label="Parent definition" wide><textarea value={value.definitionParent} onChange={(event) => onChange({ ...value, definitionParent: event.target.value })} rows={3} className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-cyan-500" /></Field>
        <Field label="Example sentence" wide><textarea value={value.exampleSentence} onChange={(event) => onChange({ ...value, exampleSentence: event.target.value })} rows={2} className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-cyan-500" /></Field>
        <Field label="Second example" wide><textarea value={value.secondExampleSentence} onChange={(event) => onChange({ ...value, secondExampleSentence: event.target.value })} rows={2} className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-cyan-500" /></Field>
        <Field label="Phonics pattern"><input value={value.phonicsPattern} onChange={(event) => onChange({ ...value, phonicsPattern: event.target.value })} className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-cyan-500" /></Field>
        <Field label="Syllables"><input value={value.syllables} onChange={(event) => onChange({ ...value, syllables: event.target.value })} className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-cyan-500" /></Field>
        <Field label="Pronunciation hint"><input value={value.pronunciationHint} onChange={(event) => onChange({ ...value, pronunciationHint: event.target.value })} className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-cyan-500" /></Field>
        <Field label="Synonyms"><input value={value.synonyms} onChange={(event) => onChange({ ...value, synonyms: event.target.value })} placeholder="comma-separated" className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-500" /></Field>
        <Field label="Antonyms"><input value={value.antonyms} onChange={(event) => onChange({ ...value, antonyms: event.target.value })} placeholder="comma-separated" className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-500" /></Field>
        <Field label="Related words" wide><input value={value.relatedWords} onChange={(event) => onChange({ ...value, relatedWords: event.target.value })} placeholder="comma-separated" className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-500" /></Field>
        <Field label="Intervention tags" wide><input value={value.interventionTags} onChange={(event) => onChange({ ...value, interventionTags: event.target.value })} placeholder="comma-separated" className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-500" /></Field>
        <Field label="SEN tags" wide><input value={value.senTags} onChange={(event) => onChange({ ...value, senTags: event.target.value })} placeholder="comma-separated" className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-500" /></Field>
        <Field label="Safeguarding-sensitive tags" wide><input value={value.safeguardingTags} onChange={(event) => onChange({ ...value, safeguardingTags: event.target.value })} placeholder="comma-separated" className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-500" /></Field>
        <Field label="Curriculum objective tags" wide><input value={value.curriculumTags} onChange={(event) => onChange({ ...value, curriculumTags: event.target.value })} placeholder="comma-separated" className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-500" /></Field>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Checkbox label="Tricky word" checked={value.isTrickyWord} onChange={(next) => onChange({ ...value, isTrickyWord: next })} />
        <Checkbox label="Topic keyword" checked={value.isTopicKeyword} onChange={(next) => onChange({ ...value, isTopicKeyword: next })} />
        <Checkbox label="Maths keyword" checked={value.isMathsKeyword} onChange={(next) => onChange({ ...value, isMathsKeyword: next })} />
        <Checkbox label="Science keyword" checked={value.isScienceKeyword} onChange={(next) => onChange({ ...value, isScienceKeyword: next })} />
        <Checkbox label="Reading keyword" checked={value.isReadingKeyword} onChange={(next) => onChange({ ...value, isReadingKeyword: next })} />
        <Checkbox label="Spelling keyword" checked={value.isSpellingKeyword} onChange={(next) => onChange({ ...value, isSpellingKeyword: next })} />
        <Checkbox label="Active" checked={value.active} onChange={(next) => onChange({ ...value, active: next })} />
      </div>
    </section>
  );
}
