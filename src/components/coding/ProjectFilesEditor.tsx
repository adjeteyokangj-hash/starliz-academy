"use client";
import { useState } from "react";
import SourceEditor from "./SourceEditor";
import { sourceArtifactSchema, type PracticalArtifact } from "@/lib/coding/learning/types";
type Source = Extract<PracticalArtifact, { type: "source" }>;
const control = "min-h-11 max-w-full rounded-lg border border-slate-400 bg-white px-3 py-2 text-sm text-slate-950";
export default function ProjectFilesEditor({ artifact, readOnly, onChange }: { artifact: Source; readOnly: boolean; onChange: (artifact: Source) => void }) {
  const [selected, setSelected] = useState(""), [filename, setFilename] = useState(""), [error, setError] = useState("");
  const files = artifact.projectFiles ?? {}, names = Object.keys(files), active = Object.hasOwn(files, selected) ? selected : names[0];
  const update = (next: Record<string, string>) => {
    const candidate = { ...artifact, projectFiles: next };
    if (!sourceArtifactSchema.safeParse(candidate).success) { setError("Use up to eight files, 8KiB each and 32KiB total. Filenames need a letter first and a supported extension, with no directories."); return; }
    setError(""); onChange(candidate);
  };
  if (artifact.language === "sql" || artifact.entry === "dom") return null;
  const extension = active?.split(".").at(-1);
  const language = extension === "py" ? "python" : extension === "js" ? "javascript" : extension === "css" ? "css" : extension === "html" ? "html" : extension === "json" ? "json" : extension === "sql" ? "sql" : "text";
  return <section className="min-w-0 space-y-3 rounded-xl border border-slate-300 p-3" aria-label="Supporting project files"><h3 className="font-semibold">Supporting project files</h3><p className="text-sm text-slate-700">Python imports and CommonJS require use these real files inside the isolated project directory.</p>{names.length > 0 && <label className="block text-sm">Choose a file<select className={`${control} ml-2`} value={active} onChange={(event) => setSelected(event.target.value)}>{names.map((name) => <option key={name}>{name}</option>)}</select></label>}{active && <SourceEditor value={files[active]!} language={language} label={`${active} source`} readOnly={readOnly} onChange={(content) => update({ ...files, [active]: content })} />}{!readOnly && <div className="flex flex-wrap gap-2"><label className="text-sm">New filename<input className={`${control} ml-2`} value={filename} maxLength={48} placeholder={artifact.language === "python" ? "helpers.py" : "helpers.js"} onChange={(event) => setFilename(event.target.value)} /></label><button className={control} type="button" disabled={names.length >= 8 || !filename || Object.hasOwn(files, filename)} onClick={() => { if (sourceArtifactSchema.safeParse({ ...artifact, projectFiles: { ...files, [filename]: "" } }).success) { update({ ...files, [filename]: "" }); setSelected(filename); setFilename(""); } else setError("Choose a supported filename such as helpers.py or helpers.js, without a directory."); }}>Add file</button></div>}{error && <p role="alert" className="text-sm text-red-800">{error}</p>}</section>;
}
