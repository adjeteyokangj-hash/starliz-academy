import DictionaryStatusBadge from "@/components/admin/dictionary/DictionaryStatusBadge";
import type { DictionaryWordRecord } from "@/lib/dictionary";

type Props = {
  items: DictionaryWordRecord[];
  onEdit: (item: DictionaryWordRecord) => void;
  onToggleActive: (item: DictionaryWordRecord) => void;
  busyId?: string | null;
};

function flagList(item: DictionaryWordRecord): string[] {
  return [
    item.isTrickyWord ? "Tricky" : null,
    item.isTopicKeyword ? "Topic" : null,
    item.isMathsKeyword ? "Maths" : null,
    item.isScienceKeyword ? "Science" : null,
    item.isReadingKeyword ? "Reading" : null,
    item.isSpellingKeyword ? "Spelling" : null,
  ].filter((value): value is string => Boolean(value));
}

export default function DictionaryTable({ items, onEdit, onToggleActive, busyId }: Props) {
  if (!items.length) {
    return (
      <div className="rounded-3xl border border-slate-800 bg-slate-950/60 p-10 text-center text-sm text-slate-400">
        No dictionary words found.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-800/80 bg-slate-950/60 shadow-lg shadow-slate-950/20">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
          <thead className="bg-slate-950/90 text-xs font-black uppercase tracking-[0.16em] text-slate-400">
            <tr>
              <th className="px-4 py-3">Word</th>
              <th className="px-4 py-3">Subject</th>
              <th className="px-4 py-3">Key Stage</th>
              <th className="px-4 py-3">Year Group</th>
              <th className="px-4 py-3">Difficulty</th>
              <th className="px-4 py-3">Topic</th>
              <th className="px-4 py-3">Child Definition</th>
              <th className="px-4 py-3">Flags</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-slate-200">
            {items.map((item) => (
              <tr key={item.id} className="align-top hover:bg-slate-900/50">
                <td className="px-4 py-4 font-black text-white">{item.word}</td>
                <td className="px-4 py-4 capitalize text-slate-300">{item.subject}</td>
                <td className="px-4 py-4 uppercase text-slate-300">{item.keyStage}</td>
                <td className="px-4 py-4 text-slate-300">{item.yearGroup ?? "—"}</td>
                <td className="px-4 py-4 capitalize text-slate-300">{item.difficulty}</td>
                <td className="px-4 py-4 text-slate-300">{item.topic ?? "—"}</td>
                <td className="px-4 py-4 text-slate-200">{item.definitionChild}</td>
                <td className="px-4 py-4">
                  <div className="flex flex-wrap gap-2">
                    {flagList(item).length ? flagList(item).map((flag) => (
                      <span key={flag} className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-slate-300">{flag}</span>
                    )) : <span className="text-slate-500">—</span>}
                  </div>
                </td>
                <td className="px-4 py-4"><DictionaryStatusBadge active={item.active} /></td>
                <td className="px-4 py-4">
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => onEdit(item)} className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-cyan-200 hover:bg-cyan-500/20">Edit</button>
                    <button type="button" onClick={() => onToggleActive(item)} disabled={busyId === item.id} className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-slate-200 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60">
                      {busyId === item.id ? "..." : item.active ? "Deactivate" : "Reactivate"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
