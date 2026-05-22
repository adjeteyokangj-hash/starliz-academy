import type { ReactNode } from "react";

export type DictionaryFilterState = {
  q: string;
  subject: string;
  keyStage: string;
  yearGroup: string;
  difficulty: string;
  topic: string;
  active: string;
  tricky: string;
  topicKeyword: string;
};

type Props = {
  value: DictionaryFilterState;
  onChange: (next: DictionaryFilterState) => void;
  onSearch: () => void;
  onReset: () => void;
  searching: boolean;
};

const SUBJECTS = ["", "english", "spelling", "reading", "maths", "science"];
const KEY_STAGES = ["", "early-years", "ks1", "ks2"];
const DIFFICULTIES = ["", "easy", "medium", "hard", "challenge"];
const ACTIVE_OPTIONS = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
];
const FLAG_OPTIONS = [
  { label: "All", value: "all" },
  { label: "Yes", value: "true" },
  { label: "No", value: "false" },
];

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="space-y-2 text-sm font-bold text-slate-200">
      <span className="block text-xs font-black uppercase tracking-[0.16em] text-slate-400">{label}</span>
      {children}
    </label>
  );
}

export default function DictionaryFilters({ value, onChange, onSearch, onReset, searching }: Props) {
  return (
    <section className="rounded-3xl border border-slate-800/80 bg-slate-950/60 p-4 shadow-lg shadow-slate-950/20">
      <div className="grid gap-3 lg:grid-cols-3 xl:grid-cols-5">
        <Field label="Search words">
          <input
            value={value.q}
            onChange={(event) => onChange({ ...value, q: event.target.value })}
            placeholder="Search word, topic, meaning"
            className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none ring-0 placeholder:text-slate-500 focus:border-cyan-500"
          />
        </Field>
        <Field label="Subject">
          <select value={value.subject} onChange={(event) => onChange({ ...value, subject: event.target.value })} className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-cyan-500">
            {SUBJECTS.map((option) => <option key={option || "all"} value={option}>{option ? option : "All subjects"}</option>)}
          </select>
        </Field>
        <Field label="Key Stage">
          <select value={value.keyStage} onChange={(event) => onChange({ ...value, keyStage: event.target.value })} className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-cyan-500">
            {KEY_STAGES.map((option) => <option key={option || "all"} value={option}>{option ? option : "All key stages"}</option>)}
          </select>
        </Field>
        <Field label="Year group">
          <input value={value.yearGroup} onChange={(event) => onChange({ ...value, yearGroup: event.target.value })} placeholder="Year 1" className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-500" />
        </Field>
        <Field label="Difficulty">
          <select value={value.difficulty} onChange={(event) => onChange({ ...value, difficulty: event.target.value })} className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-cyan-500">
            {DIFFICULTIES.map((option) => <option key={option || "all"} value={option}>{option ? option : "All difficulties"}</option>)}
          </select>
        </Field>
        <Field label="Topic">
          <input value={value.topic} onChange={(event) => onChange({ ...value, topic: event.target.value })} placeholder="Habitat, fractions, phonics..." className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-500" />
        </Field>
        <Field label="Status">
          <select value={value.active} onChange={(event) => onChange({ ...value, active: event.target.value })} className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-cyan-500">
            {ACTIVE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </Field>
        <Field label="Tricky word">
          <select value={value.tricky} onChange={(event) => onChange({ ...value, tricky: event.target.value })} className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-cyan-500">
            {FLAG_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </Field>
        <Field label="Topic keyword">
          <select value={value.topicKeyword} onChange={(event) => onChange({ ...value, topicKeyword: event.target.value })} className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-cyan-500">
            {FLAG_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </Field>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={onSearch} disabled={searching} className="rounded-2xl bg-cyan-500 px-4 py-2.5 text-sm font-black text-white hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60">
          {searching ? "Searching..." : "Search"}
        </button>
        <button type="button" onClick={onReset} className="rounded-2xl border border-slate-700 px-4 py-2.5 text-sm font-black text-slate-200 hover:bg-slate-900">
          Reset filters
        </button>
      </div>
    </section>
  );
}
