"use client";
import { useState } from "react";
import EngineeringProjectDetails from "./EngineeringProjectDetails";
import { engineeringDocumentSchema, engineeringFixtureSchema } from "@/lib/coding/learning/engineering-contract";
import type { Json } from "@/lib/coding/learning/types";

const control = "min-h-11 max-w-full rounded-lg border border-slate-400 bg-white px-3 py-2 text-slate-950";
export default function EngineeringStudio({ value, input, readOnly, onChange }: { value: Json; input: Json; readOnly: boolean; onChange: (value: Json) => void }) {
  const [filename, setFilename] = useState("guide.txt"), [content, setContent] = useState(""), [version, setVersion] = useState("v2");
  const parsed = engineeringDocumentSchema.safeParse(value), fixture = engineeringFixtureSchema.safeParse(input);
  if (!parsed.success || !fixture.success) return <p role="alert">Restore a supported engineering starter to edit this project.</p>;
  const document = parsed.data, supplied = fixture.data;
  const update = (patch: Partial<typeof document>) => onChange({ ...document, ...patch } as Json);
  const append = (op: "edit" | "snapshot" | "restore") => update({ ...(op === "restore" ? { selectedVersion: version } : {}), actions: [...document.actions, { op, target: op === "edit" ? filename : version, content: op === "edit" ? content : "", author: `Fictional ${supplied.role}` }] });
  return <section aria-label="Engineering project studio" className="min-w-0 space-y-5">
    <p className="rounded-xl bg-sky-50 p-3 text-sm">Private practice team · supplied role: <strong>{supplied.role}</strong>. These fictional permissions model collaboration. Actual classroom access is enforced separately by the server. Preview applies your queued actions to the supplied starting files.</p>
    <section className="space-y-2"><h3 className="font-bold">Starting files</h3>{Object.entries(supplied.initialFiles ?? document.files).map(([name, text]) => <details key={name} className="rounded-xl border p-3"><summary className="min-h-11 cursor-pointer font-mono">{name}</summary><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-sm">{text}</pre></details>)}</section>
    {(supplied.initialVersions ?? document.versions).length > 0 && <section aria-label="Supplied private version history" className="space-y-2"><h3 className="font-bold">Inspect earlier revisions</h3>{(supplied.initialVersions ?? document.versions).map((revision) => <details key={revision.id} className="rounded-xl border p-3"><summary className="min-h-11 cursor-pointer">{revision.id} · {revision.author}</summary>{Object.entries(revision.files).map(([name, text]) => <div key={name}><h4 className="font-mono text-sm">{name}</h4><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-sm">{text}</pre></div>)}</details>)}</section>}
    <fieldset disabled={readOnly} className="min-w-0 space-y-4"><legend className="font-bold">Project brief and permissions</legend>
      {(["purpose", "audience", "notes"] as const).map((field) => <label key={field} className="block capitalize">{field}<textarea className={`${control} mt-1 w-full`} maxLength={4000} value={document[field]} onChange={(event) => update({ [field]: event.target.value })} /></label>)}
      <EngineeringProjectDetails document={document} update={update} />
      <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={document.run} onChange={(event) => update({ run: event.target.checked })} />Execute the selected entry file and its tests</label>
      {document.run && <section className="space-y-2 rounded-xl border p-3"><h3 className="font-semibold">Executable test contract · {document.entryFile}</h3>{document.tests.map((test, index) => <div key={index} className="min-w-0 text-sm"><p className="font-semibold">{test.name}</p><pre className="overflow-auto whitespace-pre-wrap break-words">Input: {JSON.stringify(test.input)}{"\n"}Expected: {JSON.stringify(test.expected)}</pre></div>)}<p className="text-sm text-slate-600">These tests run against the resulting source after your queued changes.</p></section>}
      <div className="grid gap-3 sm:grid-cols-2">{(["viewers", "editors"] as const).map((permission) => <fieldset key={permission} className="space-y-2 rounded-xl border p-3"><legend className="font-semibold">Allowed {permission}</legend>{(["owner", "editor", "viewer", "anonymous"] as const).map((role) => <label key={role} className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={document.permissions[permission].includes(role)} onChange={(event) => update({ permissions: { ...document.permissions, [permission]: event.target.checked ? [...document.permissions[permission], role] : document.permissions[permission].filter((item) => item !== role) } })} />{role}</label>)}</fieldset>)}</div>
      <label className="block">Target filename<input className={`${control} mt-1 w-full`} value={filename} maxLength={45} onChange={(event) => setFilename(event.target.value)} /></label>
      <label className="block">Replacement file content<textarea className={`${control} mt-1 min-h-40 w-full font-mono`} value={content} maxLength={8192} onChange={(event) => setContent(event.target.value)} /></label>
      <button type="button" className={control} disabled={document.actions.length >= 30 || !filename} onClick={() => append("edit")}>Queue file change</button>
      <label className="block">Version identifier<input className={`${control} mt-1 w-full`} value={version} maxLength={40} onChange={(event) => setVersion(event.target.value)} /></label>
      <div className="flex flex-wrap gap-2">{(["snapshot", "restore"] as const).map((op) => <button key={op} type="button" className={control} disabled={document.actions.length >= 30} onClick={() => append(op)}>Queue {op}</button>)}</div>
      <ol aria-label="Proposed collaboration actions" className="space-y-2">{document.actions.map((action, index) => <li key={index} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-100 p-3"><span>{index + 1}. {action.op} {action.target} · {action.author}</span><button type="button" className={control} onClick={() => update({ actions: document.actions.filter((_, i) => i !== index) })}>Remove action {index + 1}</button></li>)}</ol>
    </fieldset>
  </section>;
}
