"use client";

import { useEffect, useMemo, useState } from "react";
import AdminSectionCard from "./AdminSectionCard";

type Field = {
  name: string;
  label: string;
  type?: "text" | "number" | "textarea" | "checkbox" | "select";
  options?: string[];
};

type RecordValue = string | number | boolean | null | undefined;
type ResourceRecord = Record<string, RecordValue> & { id: string; createdAt?: string; updatedAt?: string };

type Props = {
  title: string;
  description: string;
  resource: string;
  fields: Field[];
  primaryField: string;
};

function emptyDraft(fields: Field[]) {
  return Object.fromEntries(
    fields.map((field) => [field.name, field.type === "number" ? 0 : field.type === "checkbox" ? true : field.options?.[0] ?? ""]),
  ) as Record<string, RecordValue>;
}

export default function AdminResourceManager({ title, description, resource, fields, primaryField }: Props) {
  const [records, setRecords] = useState<ResourceRecord[]>([]);
  const [draft, setDraft] = useState<Record<string, RecordValue>>(() => emptyDraft(fields));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const activeRecord = useMemo(() => records.find((record) => record.id === editingId) ?? null, [editingId, records]);

  async function loadRecords(nextSearch = search) {
    const params = new URLSearchParams();
    if (nextSearch.trim()) params.set("search", nextSearch.trim());
    const response = await fetch(`/api/admin/resources/${resource}?${params.toString()}`);
    if (!response.ok) return;
    const data = await response.json();
    setRecords(data.records ?? []);
  }

  function updateDraft(name: string, value: RecordValue) {
    setDraft((current) => ({ ...current, [name]: value }));
  }

  function startEdit(record: ResourceRecord) {
    setEditingId(record.id);
    setDraft(Object.fromEntries(fields.map((field) => [field.name, record[field.name] ?? emptyDraft([field])[field.name]])));
  }

  async function save() {
    setBusy(true);
    setMessage(null);
    const response = await fetch(`/api/admin/resources/${resource}${editingId ? `/${editingId}` : ""}`, {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    setBusy(false);
    if (!response.ok) {
      setMessage("Could not save. Check the required fields.");
      return;
    }
    setMessage(editingId ? "Updated." : "Created.");
    setEditingId(null);
    setDraft(emptyDraft(fields));
    await loadRecords();
  }

  async function remove(id: string) {
    setBusy(true);
    await fetch(`/api/admin/resources/${resource}/${id}`, { method: "DELETE" });
    setBusy(false);
    await loadRecords();
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadRecords("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black text-white">{title}</h1>
          <p className="mt-1 text-slate-400">{description}</p>
        </div>
        <div className="flex gap-2">
          <input
            className="w-64 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
            placeholder="Search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <button type="button" onClick={() => void loadRecords()} className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-bold text-white">
            Search
          </button>
        </div>
      </div>

      <AdminSectionCard title={editingId ? `Edit ${activeRecord?.[primaryField] ?? "Record"}` : `Add ${title}`}>
        <div className="grid gap-3 md:grid-cols-2">
          {fields.map((field) => (
            <label key={field.name} className={field.type === "textarea" ? "md:col-span-2" : ""}>
              <span className="mb-1 block text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{field.label}</span>
              {field.type === "textarea" ? (
                <textarea className="min-h-28 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none" value={String(draft[field.name] ?? "")} onChange={(event) => updateDraft(field.name, event.target.value)} />
              ) : field.type === "checkbox" ? (
                <input className="h-5 w-5 accent-violet-500" type="checkbox" checked={Boolean(draft[field.name])} onChange={(event) => updateDraft(field.name, event.target.checked)} />
              ) : field.type === "select" ? (
                <select className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none" value={String(draft[field.name] ?? "")} onChange={(event) => updateDraft(field.name, event.target.value)}>
                  {(field.options ?? []).map((option) => <option key={option}>{option}</option>)}
                </select>
              ) : (
                <input className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none" type={field.type ?? "text"} value={String(draft[field.name] ?? "")} onChange={(event) => updateDraft(field.name, field.type === "number" ? Number(event.target.value) : event.target.value)} />
              )}
            </label>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => void save()} disabled={busy} className="rounded-2xl bg-violet-500 px-5 py-3 font-bold text-white disabled:opacity-60">
            {editingId ? "Update" : "Create"}
          </button>
          {editingId ? (
            <button type="button" onClick={() => { setEditingId(null); setDraft(emptyDraft(fields)); }} className="rounded-2xl border border-white/10 px-5 py-3 font-bold text-slate-200">
              Cancel
            </button>
          ) : null}
          {message ? <span className="text-sm text-slate-400">{message}</span> : null}
        </div>
      </AdminSectionCard>

      <AdminSectionCard title={`${title} Records`}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.18em] text-slate-500">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Updated</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10 text-slate-300">
              {records.map((record) => (
                <tr key={record.id}>
                  <td className="px-3 py-3 font-semibold text-white">{String(record[primaryField] ?? record.id)}</td>
                  <td className="px-3 py-3">{String(record.status ?? (record.isActive === false ? "inactive" : "active"))}</td>
                  <td className="px-3 py-3">{record.updatedAt ? new Date(record.updatedAt).toLocaleString() : "-"}</td>
                  <td className="px-3 py-3">
                    <div className="flex gap-2">
                      <button type="button" onClick={() => startEdit(record)} className="rounded-xl border border-white/10 px-3 py-2 font-bold text-white">Edit</button>
                      <button type="button" onClick={() => void remove(record.id)} className="rounded-xl border border-rose-400/30 px-3 py-2 font-bold text-rose-200">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!records.length ? (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-slate-500">No records yet. Create the first one above.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </AdminSectionCard>
    </div>
  );
}
