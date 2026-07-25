"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import GaHubAccordionSection from "@/components/admin/GaHubAccordionSection";

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
  isArchived: boolean;
  usedByWordBank: boolean;
  usedByLessons: boolean;
  wordCount: number;
  lessonCount: number;
  source: "database" | "fallback";
  createdAt: string;
  updatedAt: string;
};

type CategoryForm = {
  name: string;
  description: string;
  isActive: boolean;
  usedByWordBank: boolean;
  usedByLessons: boolean;
};

const defaultForm: CategoryForm = {
  name: "",
  description: "",
  isActive: true,
  usedByWordBank: true,
  usedByLessons: true,
};

export default function AdminGaCategoriesPage() {
  const [items, setItems] = useState<CategoryRow[]>([]);
  const [form, setForm] = useState(defaultForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const editingItem = useMemo(() => items.find((item) => item.id === editingId) ?? null, [items, editingId]);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/ga/categories");
    if (response.status === 401) {
      window.location.replace("/admin/login?next=/admin/ga-categories");
      return;
    }
    const payload = await response.json().catch(() => null) as { items?: CategoryRow[]; error?: string } | null;
    if (!response.ok) {
      setMessage(payload?.error ?? "Unable to load Ga categories.");
      return;
    }
    setItems(payload?.items ?? []);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function resetForm() {
    setEditingId(null);
    setForm(defaultForm);
  }

  function edit(item: CategoryRow) {
    setEditingId(item.id);
    setForm({
      name: item.name,
      description: item.description ?? "",
      isActive: item.isActive,
      usedByWordBank: item.usedByWordBank,
      usedByLessons: item.usedByLessons,
    });
    setMessage(null);
    document.getElementById("ga-category-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function saveCategory() {
    if (!form.usedByWordBank && !form.usedByLessons) {
      setMessage("Category must be enabled for Word Bank, Lessons, or both.");
      return;
    }

    setSaving(true);
    try {
      const request = editingId
        ? { url: `/api/admin/ga/categories/${editingId}`, method: "PATCH" as const }
        : { url: "/api/admin/ga/categories", method: "POST" as const };
      const response = await fetch(request.url, {
        method: request.method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          description: form.description || null,
          isActive: form.isActive,
          usedByWordBank: form.usedByWordBank,
          usedByLessons: form.usedByLessons,
        }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setMessage(payload?.error ?? "Unable to save category.");
        return;
      }
      setMessage(editingId ? "Category updated." : "Category created.");
      resetForm();
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function archiveCategory(item: CategoryRow, nextArchived: boolean) {
    const confirmationText = nextArchived
      ? `Archive ${item.name}? Archived categories are hidden from new selections.`
      : `Restore ${item.name} to active categories?`;
    if (!window.confirm(confirmationText)) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/admin/ga/categories/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isArchived: nextArchived, isActive: nextArchived ? false : true, force: true }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setMessage(payload?.error ?? "Unable to update category archive state.");
        return;
      }
      setMessage(nextArchived ? "Category archived." : "Category restored.");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function deleteCategory(item: CategoryRow) {
    if (!window.confirm(`Delete ${item.name} permanently? This is only allowed when there is no word or lesson usage.`)) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/admin/ga/categories/${item.id}`, { method: "DELETE" });
      const payload = await response.json().catch(() => null) as { error?: string; usage?: { wordCount?: number; lessonCount?: number } } | null;
      if (!response.ok) {
        if (payload?.usage) {
          setMessage(`Cannot delete category: words ${payload.usage.wordCount ?? 0}, lessons ${payload.usage.lessonCount ?? 0}.`);
          return;
        }
        setMessage(payload?.error ?? "Unable to delete category.");
        return;
      }
      setMessage("Category deleted permanently.");
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 pb-24">
      <section className="rounded-3xl border border-slate-800/80 bg-linear-to-br from-emerald-500/15 via-slate-950 to-cyan-500/10 p-6">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">Ga Learning Hub</p>
        <h1 className="mt-2 text-3xl font-black text-white">Ga Categories Governance</h1>
        <p className="mt-3 max-w-3xl text-sm text-slate-300">Create and manage categories used by Ga Word Bank and Ga Lessons. Inactive categories are hidden from new selections but remain available on existing records.</p>
      </section>

      {message ? <p className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-100">{message}</p> : null}

      <GaHubAccordionSection title={editingId ? "Edit Category" : "Create Category"} eyebrow="Admin-managed" defaultOpen={true}>
        <div id="ga-category-editor" />
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-xs font-bold uppercase text-slate-400">Category name
            <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
          </label>
          <label className="text-xs font-bold uppercase text-slate-400">Description
            <input value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
          </label>
          <label className="flex items-center gap-2 text-sm font-bold text-slate-300"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} /> Active</label>
          <label className="flex items-center gap-2 text-sm font-bold text-slate-300"><input type="checkbox" checked={form.usedByWordBank} onChange={(event) => setForm((current) => ({ ...current, usedByWordBank: event.target.checked }))} /> Used by Word Bank</label>
          <label className="flex items-center gap-2 text-sm font-bold text-slate-300"><input type="checkbox" checked={form.usedByLessons} onChange={(event) => setForm((current) => ({ ...current, usedByLessons: event.target.checked }))} /> Used by Lessons</label>
        </div>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={() => void saveCategory()} disabled={saving} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-black text-white disabled:opacity-50">{editingId ? "Update category" : "Create category"}</button>
          {editingId ? <button type="button" onClick={resetForm} className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-black text-slate-200">Cancel edit</button> : null}
        </div>
      </GaHubAccordionSection>

      <GaHubAccordionSection
        title={`Categories (${items.length})`}
        eyebrow="Word Bank + Lessons coverage"
        defaultOpen={true}
        helperText="Coverage table shows category slugs with live word/lesson counts."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-260 text-left text-xs">
            <thead className="uppercase text-slate-500">
              <tr>
                <th className="px-2 py-2">Name</th>
                <th className="px-2 py-2">Slug</th>
                <th className="px-2 py-2">Active</th>
                <th className="px-2 py-2">Word Bank</th>
                <th className="px-2 py-2">Lessons</th>
                <th className="px-2 py-2">Words</th>
                <th className="px-2 py-2">Lessons count</th>
                <th className="px-2 py-2">Source</th>
                <th className="px-2 py-2">Updated</th>
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className={`border-t border-slate-800 text-slate-300 ${editingItem?.id === item.id ? "bg-cyan-500/10" : ""}`}>
                  <td className="px-2 py-2 font-bold text-white">{item.name}</td>
                  <td className="px-2 py-2">{item.slug}</td>
                  <td className="px-2 py-2">{item.isActive && !item.isArchived ? "Active" : "Inactive"}</td>
                  <td className="px-2 py-2">{item.usedByWordBank ? "Yes" : "No"}</td>
                  <td className="px-2 py-2">{item.usedByLessons ? "Yes" : "No"}</td>
                  <td className="px-2 py-2">{item.wordCount}</td>
                  <td className="px-2 py-2">{item.lessonCount}</td>
                  <td className="px-2 py-2">{item.source}</td>
                  <td className="px-2 py-2">{new Date(item.updatedAt).toLocaleString()}</td>
                  <td className="px-2 py-2">
                    <div className="flex gap-2">
                      {item.source === "database" ? (
                        <>
                          <button type="button" onClick={() => edit(item)} className="rounded-lg border border-slate-700 px-3 py-1 font-bold text-slate-100">Edit</button>
                          {!item.isArchived ? (
                            <button type="button" onClick={() => void archiveCategory(item, true)} disabled={saving} className="rounded-lg border border-amber-600/70 px-3 py-1 font-bold text-amber-100 disabled:opacity-50">Archive</button>
                          ) : (
                            <>
                              <button type="button" onClick={() => void archiveCategory(item, false)} disabled={saving} className="rounded-lg border border-slate-700 px-3 py-1 font-bold text-slate-100 disabled:opacity-50">Restore</button>
                              <button type="button" onClick={() => void deleteCategory(item)} disabled={saving} className="rounded-lg border border-rose-600/70 px-3 py-1 font-bold text-rose-100 disabled:opacity-50">Delete</button>
                            </>
                          )}
                        </>
                      ) : <span className="px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">Fallback only</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GaHubAccordionSection>
    </div>
  );
}
