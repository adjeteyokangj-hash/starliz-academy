"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import AdminSectionCard from "./AdminSectionCard";

type Field = {
  name: string;
  label: string;
  type?: "text" | "number" | "textarea" | "checkbox" | "select";
  options?: string[];
  /** Empty input maps to null instead of 0. */
  optionalNumber?: boolean;
};

type RecordValue = string | number | boolean | null | undefined;
export type ResourceRecord = Record<string, RecordValue> & { id: string; createdAt?: string; updatedAt?: string };

export type ListColumn = {
  key: string;
  label: string;
  render?: (value: RecordValue, record: ResourceRecord) => string;
};

type Props = {
  title: string;
  description: string;
  resource: string;
  fields: Field[];
  primaryField: string;
  listColumns?: ListColumn[];
  /** Extra action buttons rendered before Edit/Delete. */
  renderRowActions?: (record: ResourceRecord) => ReactNode;
};

function emptyDraft(fields: Field[]) {
  return Object.fromEntries(
    fields.map((field) => {
      if (field.type === "checkbox") return [field.name, true];
      if (field.type === "number" && field.optionalNumber) return [field.name, ""];
      if (field.type === "number") return [field.name, 0];
      return [field.name, field.options?.[0] ?? ""];
    }),
  ) as Record<string, RecordValue>;
}

function normalizeDraftForSave(fields: Field[], draft: Record<string, RecordValue>) {
  const payload: Record<string, RecordValue> = { ...draft };
  for (const field of fields) {
    if (field.type === "number" && field.optionalNumber) {
      const raw = payload[field.name];
      if (raw === "" || raw === undefined || raw === null || Number.isNaN(Number(raw))) {
        payload[field.name] = null;
      } else {
        payload[field.name] = Number(raw);
      }
    }
  }
  return payload;
}

export default function AdminResourceManager({ title, description, resource, fields, primaryField, listColumns, renderRowActions }: Props) {
  const [records, setRecords] = useState<ResourceRecord[]>([]);
  const [draft, setDraft] = useState<Record<string, RecordValue>>(() => emptyDraft(fields));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const activeRecord = useMemo(() => records.find((record) => record.id === editingId) ?? null, [editingId, records]);
  const columns: ListColumn[] = listColumns?.length
    ? listColumns
    : [
        { key: primaryField, label: "Name" },
        {
          key: "status",
          label: "Status",
          render: (value, record) => String(value ?? (record.isActive === false ? "inactive" : "active")),
        },
        {
          key: "updatedAt",
          label: "Updated",
          render: (value) => (typeof value === "string" || typeof value === "number" ? new Date(value).toLocaleString() : "-"),
        },
      ];

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
    setDraft(Object.fromEntries(fields.map((field) => {
      const value = record[field.name];
      if (field.type === "number" && field.optionalNumber && (value === null || value === undefined)) {
        return [field.name, ""];
      }
      return [field.name, value ?? emptyDraft([field])[field.name]];
    })));
  }

  async function save() {
    setBusy(true);
    setMessage(null);
    const response = await fetch(`/api/admin/resources/${resource}${editingId ? `/${editingId}` : ""}`, {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(normalizeDraftForSave(fields, draft)),
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
                <input
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
                  type={field.type ?? "text"}
                  value={String(draft[field.name] ?? "")}
                  onChange={(event) => {
                    if (field.type === "number" && field.optionalNumber) {
                      updateDraft(field.name, event.target.value === "" ? "" : Number(event.target.value));
                      return;
                    }
                    updateDraft(field.name, field.type === "number" ? Number(event.target.value) : event.target.value);
                  }}
                />
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
                {columns.map((column) => (
                  <th key={column.key} className="px-3 py-2">{column.label}</th>
                ))}
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10 text-slate-300">
              {records.map((record) => (
                <tr key={record.id}>
                  {columns.map((column) => {
                    const value = record[column.key];
                    const display = column.render
                      ? column.render(value, record)
                      : column.key === primaryField
                        ? String(value ?? record.id)
                        : String(value ?? "-");
                    return (
                      <td key={column.key} className={`px-3 py-3 ${column.key === primaryField ? "font-semibold text-white" : ""}`}>
                        {display}
                      </td>
                    );
                  })}
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      {renderRowActions?.(record)}
                      <button type="button" onClick={() => startEdit(record)} className="rounded-xl border border-white/10 px-3 py-2 font-bold text-white">Edit</button>
                      <button type="button" onClick={() => void remove(record.id)} className="rounded-xl border border-rose-400/30 px-3 py-2 font-bold text-rose-200">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!records.length ? (
                <tr>
                  <td colSpan={columns.length + 1} className="px-3 py-8 text-center text-slate-500">No records yet. Create the first one above.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </AdminSectionCard>
    </div>
  );
}
