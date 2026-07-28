"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useState } from "react";
import AdminStoreItemPreview, { StorePreviewItem } from "@/components/admin/AdminStoreItemPreview";
import {
  getStoreItemImageUrl,
  getStorePreviewEmoji,
  getStorePreviewKind,
} from "@/lib/store_item_preview";

type StoreRecord = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  price: number;
  minAge: number | null;
  maxAge: number | null;
  requiredLevel: number | null;
  rewardType: string;
  approvalMode: string;
  stockTotal: number | null;
  isActive: boolean;
  updatedAt?: string;
};

type Draft = {
  name: string;
  category: string;
  description: string;
  price: string;
  minAge: string;
  maxAge: string;
  requiredLevel: string;
  rewardType: string;
  approvalMode: string;
  stockTotal: string;
  isActive: boolean;
};

const CATEGORIES = ["themes", "avatars", "voices", "pet", "boosts"] as const;

const emptyDraft = (): Draft => ({
  name: "",
  category: "themes",
  description: "",
  price: "0",
  minAge: "",
  maxAge: "",
  requiredLevel: "",
  rewardType: "digital",
  approvalMode: "none",
  stockTotal: "",
  isActive: true,
});

function draftFromRecord(record: StoreRecord): Draft {
  return {
    name: record.name,
    category: record.category,
    description: record.description ?? "",
    price: String(record.price ?? 0),
    minAge: record.minAge == null ? "" : String(record.minAge),
    maxAge: record.maxAge == null ? "" : String(record.maxAge),
    requiredLevel: record.requiredLevel == null ? "" : String(record.requiredLevel),
    rewardType: record.rewardType ?? "digital",
    approvalMode: record.approvalMode ?? "none",
    stockTotal: record.stockTotal == null ? "" : String(record.stockTotal),
    isActive: record.isActive !== false,
  };
}

function payloadFromDraft(draft: Draft) {
  return {
    name: draft.name.trim(),
    category: draft.category,
    description: draft.description.trim() || null,
    price: Number(draft.price || 0),
    minAge: draft.minAge === "" ? null : Number(draft.minAge),
    maxAge: draft.maxAge === "" ? null : Number(draft.maxAge),
    requiredLevel: draft.requiredLevel === "" ? null : Number(draft.requiredLevel),
    rewardType: draft.rewardType,
    approvalMode: draft.approvalMode,
    stockTotal: draft.stockTotal === "" ? null : Number(draft.stockTotal),
    isActive: draft.isActive,
  };
}

const fieldCls =
  "mt-1.5 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/20";

export default function StorePage() {
  const [records, setRecords] = useState<StoreRecord[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [previewItem, setPreviewItem] = useState<StorePreviewItem | null>(null);

  async function loadRecords(nextSearch = search) {
    setLoading(true);
    const params = new URLSearchParams();
    if (nextSearch.trim()) params.set("search", nextSearch.trim());
    const response = await fetch(`/api/admin/resources/store?${params.toString()}`);
    setLoading(false);
    if (!response.ok) return;
    const data = await response.json();
    setRecords((data.records ?? []) as StoreRecord[]);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount; frozen behaviour, advisory only
    void loadRecords("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    return records.filter((record) => {
      if (categoryFilter !== "all" && record.category !== categoryFilter) return false;
      if (statusFilter === "active" && record.isActive === false) return false;
      if (statusFilter === "inactive" && record.isActive !== false) return false;
      return true;
    });
  }, [records, categoryFilter, statusFilter]);

  const stats = useMemo(() => {
    const active = records.filter((r) => r.isActive !== false).length;
    const voices = records.filter((r) => getStorePreviewKind(r.category, r.id) === "voice").length;
    const themes = records.filter((r) => getStorePreviewKind(r.category, r.id) === "theme").length;
    return { total: records.length, active, voices, themes };
  }, [records]);

  function openCreate() {
    setEditingId(null);
    setDraft(emptyDraft());
    setMessage(null);
    setEditorOpen(true);
  }

  function openEdit(record: StoreRecord) {
    setEditingId(record.id);
    setDraft(draftFromRecord(record));
    setMessage(null);
    setEditorOpen(true);
  }

  function openPreview(record: StoreRecord) {
    setPreviewItem({
      id: record.id,
      name: record.name,
      category: record.category,
      description: record.description,
      price: record.price,
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const response = await fetch(`/api/admin/resources/store${editingId ? `/${editingId}` : ""}`, {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payloadFromDraft(draft)),
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setMessage(typeof payload.error === "string" ? payload.error : "Could not save. Check the required fields.");
      return;
    }
    setMessage(editingId ? "Item updated." : "Item created.");
    setEditorOpen(false);
    setEditingId(null);
    setDraft(emptyDraft());
    await loadRecords();
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this store item?")) return;
    setBusy(true);
    await fetch(`/api/admin/resources/store/${id}`, { method: "DELETE" });
    setBusy(false);
    await loadRecords();
  }

  return (
    <div className="relative space-y-8">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-10 -top-16 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-0 top-24 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl"
      />

      <header className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-gradient-to-br from-slate-900 via-slate-950 to-cyan-950/40 p-6 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-300/90">Rewards marketplace</p>
            <h1 className="mt-2 font-heading text-3xl font-black tracking-tight text-white sm:text-4xl">Store / Shop</h1>
            <p className="mt-2 text-sm leading-6 text-slate-300 sm:text-base">
              Curate themes, voices, avatars, and boosts kids can unlock with coins. Preview looks and samples before they go live.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-black text-slate-950 shadow-[0_12px_40px_rgba(34,211,238,0.25)] transition hover:bg-cyan-300"
          >
            New item
          </button>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Catalog SKUs", value: stats.total },
            { label: "Active", value: stats.active },
            { label: "Themes", value: stats.themes },
            { label: "Voice packs", value: stats.voices },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">{stat.label}</p>
              <p className="mt-1 text-2xl font-black text-white">{stat.value}</p>
            </div>
          ))}
        </div>
      </header>

      <section className="relative space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/70 px-3 py-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void loadRecords(search);
              }}
              placeholder="Search items…"
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
            />
            <button
              type="button"
              onClick={() => void loadRecords(search)}
              className="rounded-xl bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/15"
            >
              Search
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCategoryFilter("all")}
              className={`rounded-full px-3.5 py-2 text-xs font-bold transition ${
                categoryFilter === "all" ? "bg-cyan-400 text-slate-950" : "border border-white/10 text-slate-300 hover:bg-white/5"
              }`}
            >
              All
            </button>
            {CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setCategoryFilter(category)}
                className={`rounded-full px-3.5 py-2 text-xs font-bold capitalize transition ${
                  categoryFilter === category ? "bg-cyan-400 text-slate-950" : "border border-white/10 text-slate-300 hover:bg-white/5"
                }`}
              >
                {category}
              </button>
            ))}
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="rounded-2xl border border-white/10 bg-slate-900/70 px-3 py-2.5 text-xs font-bold text-slate-200 outline-none"
          >
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        {message ? <p className="text-sm font-semibold text-cyan-200">{message}</p> : null}

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-72 animate-pulse rounded-[1.5rem] border border-white/5 bg-slate-900/50" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((record) => {
              const kind = getStorePreviewKind(record.category, record.id);
              const imageUrl = getStoreItemImageUrl(record.category, record.id);
              const emoji = getStorePreviewEmoji(record.category, record.id);
              const previewLabel = kind === "voice" ? "Hear" : "See";
              return (
                <article
                  key={record.id}
                  className="group relative overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-900/75 shadow-[0_20px_50px_rgba(2,6,23,0.35)] transition duration-300 hover:-translate-y-1 hover:border-cyan-400/30 hover:shadow-[0_24px_60px_rgba(8,145,178,0.18)]"
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-slate-950">
                    {imageUrl ? (
                      <Image
                        src={imageUrl}
                        alt=""
                        fill
                        className="object-cover transition duration-500 group-hover:scale-105"
                        sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-950 text-6xl">
                        {emoji ?? "✦"}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />
                    <div className="absolute left-3 top-3 flex flex-wrap gap-2">
                      <span className="rounded-full border border-white/15 bg-slate-950/70 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-cyan-100 backdrop-blur">
                        {record.category}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide backdrop-blur ${
                          record.isActive === false
                            ? "border border-rose-400/30 bg-rose-500/20 text-rose-100"
                            : "border border-emerald-400/30 bg-emerald-500/20 text-emerald-100"
                        }`}
                      >
                        {record.isActive === false ? "Inactive" : "Active"}
                      </span>
                    </div>
                    <div className="absolute bottom-3 left-3 right-3">
                      <h2 className="truncate text-lg font-black text-white drop-shadow">{record.name}</h2>
                      <p className="mt-1 text-sm font-bold text-cyan-100/90">{record.price} coins</p>
                    </div>
                  </div>

                  <div className="space-y-3 p-4">
                    <div className="flex flex-wrap gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                      <span className="rounded-lg bg-white/5 px-2 py-1">{record.rewardType}</span>
                      <span className="rounded-lg bg-white/5 px-2 py-1">{record.approvalMode} approval</span>
                      <span className="rounded-lg bg-white/5 px-2 py-1">
                        {record.stockTotal == null ? "Unlimited" : `${record.stockTotal} stock`}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => openPreview(record)}
                        className="rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-3 py-2 text-xs font-black text-cyan-100 transition hover:bg-cyan-400/20"
                      >
                        {previewLabel}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(record)}
                        className="rounded-xl border border-white/10 px-3 py-2 text-xs font-black text-white transition hover:bg-white/5"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void remove(record.id)}
                        className="rounded-xl border border-rose-400/30 px-3 py-2 text-xs font-black text-rose-200 transition hover:bg-rose-500/10 disabled:opacity-60"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {!loading && !filtered.length ? (
          <div className="rounded-[1.5rem] border border-dashed border-white/15 bg-slate-900/40 px-6 py-16 text-center">
            <p className="text-lg font-black text-white">No items match these filters</p>
            <p className="mt-2 text-sm text-slate-400">Try another category, or create a new store SKU.</p>
            <button
              type="button"
              onClick={openCreate}
              className="mt-5 rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-black text-slate-950"
            >
              New item
            </button>
          </div>
        ) : null}
      </section>

      {editorOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 p-4 sm:items-center" role="dialog" aria-modal="true">
          <form
            onSubmit={save}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[1.75rem] border border-white/10 bg-slate-900 p-5 shadow-2xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300/90">
                  {editingId ? "Edit item" : "Create item"}
                </p>
                <h2 className="mt-1 text-2xl font-black text-white">{editingId ? draft.name || "Store item" : "New store item"}</h2>
              </div>
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="rounded-xl border border-white/10 px-3 py-2 text-sm font-bold text-slate-200 hover:bg-white/5"
              >
                Close
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400 sm:col-span-2">
                Item name
                <input required value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} className={fieldCls} />
              </label>
              <label className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                Category
                <select value={draft.category} onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))} className={fieldCls}>
                  {CATEGORIES.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                Coin price
                <input type="number" min={0} required value={draft.price} onChange={(e) => setDraft((d) => ({ ...d, price: e.target.value }))} className={fieldCls} />
              </label>
              <label className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                Type
                <select value={draft.rewardType} onChange={(e) => setDraft((d) => ({ ...d, rewardType: e.target.value }))} className={fieldCls}>
                  <option value="digital">digital</option>
                  <option value="physical">physical</option>
                </select>
              </label>
              <label className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                Approval
                <select value={draft.approvalMode} onChange={(e) => setDraft((d) => ({ ...d, approvalMode: e.target.value }))} className={fieldCls}>
                  <option value="none">none</option>
                  <option value="parent">parent</option>
                  <option value="admin">admin</option>
                </select>
              </label>
              <label className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                Min age
                <input type="number" min={5} max={18} value={draft.minAge} onChange={(e) => setDraft((d) => ({ ...d, minAge: e.target.value }))} placeholder="—" className={fieldCls} />
              </label>
              <label className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                Max age
                <input type="number" min={5} max={18} value={draft.maxAge} onChange={(e) => setDraft((d) => ({ ...d, maxAge: e.target.value }))} placeholder="—" className={fieldCls} />
              </label>
              <label className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                Required level
                <input type="number" min={1} value={draft.requiredLevel} onChange={(e) => setDraft((d) => ({ ...d, requiredLevel: e.target.value }))} placeholder="—" className={fieldCls} />
              </label>
              <label className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                Stock (blank = unlimited)
                <input type="number" min={0} value={draft.stockTotal} onChange={(e) => setDraft((d) => ({ ...d, stockTotal: e.target.value }))} placeholder="Unlimited" className={fieldCls} />
              </label>
              <label className="flex items-center gap-3 text-sm font-bold text-slate-200 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={draft.isActive}
                  onChange={(e) => setDraft((d) => ({ ...d, isActive: e.target.checked }))}
                  className="h-4 w-4 rounded accent-cyan-400"
                />
                Active in student shop
              </label>
              <label className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400 sm:col-span-2">
                Description
                <textarea rows={3} value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} className={fieldCls} />
              </label>
            </div>

            {message ? <p className="mt-4 text-sm text-rose-200">{message}</p> : null}

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={busy}
                className="rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-black text-slate-950 disabled:opacity-60"
              >
                {busy ? "Saving…" : editingId ? "Save changes" : "Create item"}
              </button>
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-bold text-slate-200 hover:bg-white/5"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <AdminStoreItemPreview item={previewItem} onClose={() => setPreviewItem(null)} />
    </div>
  );
}
