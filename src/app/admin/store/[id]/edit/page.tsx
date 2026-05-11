"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AdminSectionCard from "@/components/admin/AdminSectionCard";

type StoreItem = { id: string; name: string; category: string; description: string | null; price: number; minAge: number | null; maxAge: number | null; requiredLevel: number | null; isActive: boolean };

const inputCls = "w-full rounded-xl border border-slate-700/80 bg-slate-950 px-3.5 py-3 text-sm text-white placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/40 transition";
const CATEGORIES = ["themes", "avatars", "voices", "pet", "boosts"];

export default function EditStoreItemPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<StoreItem | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("themes");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("0");
  const [minAge, setMinAge] = useState("");
  const [maxAge, setMaxAge] = useState("");
  const [requiredLevel, setRequiredLevel] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/resources/store`)
      .then((r) => r.ok ? r.json() : null)
      .then((payload) => {
        const found = (payload?.records ?? []).find((s: StoreItem) => s.id === id);
        if (found) {
          setItem(found);
          setName(found.name);
          setCategory(found.category);
          setDescription(found.description ?? "");
          setPrice(String(found.price));
          setMinAge(found.minAge ? String(found.minAge) : "");
          setMaxAge(found.maxAge ? String(found.maxAge) : "");
          setRequiredLevel(found.requiredLevel ? String(found.requiredLevel) : "");
          setIsActive(found.isActive);
        }
      });
  }, [id]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const res = await fetch(`/api/admin/resources/store/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name, category,
        description: description || null,
        price: Number(price),
        minAge: minAge ? Number(minAge) : null,
        maxAge: maxAge ? Number(maxAge) : null,
        requiredLevel: requiredLevel ? Number(requiredLevel) : null,
        isActive,
      }),
    });
    setSaving(false);
    const payload = await res.json();
    if (!res.ok) { setError(payload.error ?? "Unable to save."); return; }
    router.replace("/admin/store");
  }

  if (!item) return <AdminSectionCard title="Edit Store Item"><p className="text-sm text-slate-400">Loading…</p></AdminSectionCard>;

  return (
    <AdminSectionCard title="Edit Store Item" eyebrow="Store / Shop">
      <form onSubmit={submit} className="max-w-xl space-y-4">
        <label className="block text-sm font-bold text-slate-300">Item name<input value={name} onChange={(e) => setName(e.target.value)} required className={`mt-1.5 ${inputCls}`} /></label>
        <label className="block text-sm font-bold text-slate-300">
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={`mt-1.5 ${inputCls}`}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="block text-sm font-bold text-slate-300">Description<textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={`mt-1.5 ${inputCls}`} /></label>
        <label className="block text-sm font-bold text-slate-300">Coin price<input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} required className={`mt-1.5 ${inputCls}`} /></label>
        <div className="grid grid-cols-3 gap-3">
          <label className="block text-sm font-bold text-slate-300">Min age<input type="number" min={5} max={18} value={minAge} onChange={(e) => setMinAge(e.target.value)} placeholder="—" className={`mt-1.5 ${inputCls}`} /></label>
          <label className="block text-sm font-bold text-slate-300">Max age<input type="number" min={5} max={18} value={maxAge} onChange={(e) => setMaxAge(e.target.value)} placeholder="—" className={`mt-1.5 ${inputCls}`} /></label>
          <label className="block text-sm font-bold text-slate-300">Req. level<input type="number" min={1} value={requiredLevel} onChange={(e) => setRequiredLevel(e.target.value)} placeholder="—" className={`mt-1.5 ${inputCls}`} /></label>
        </div>
        <label className="flex items-center gap-3 text-sm font-bold text-slate-300 cursor-pointer">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 rounded" />
          Active (visible in shop)
        </label>
        {error && <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}
        <div className="flex gap-3">
          <button disabled={saving} className="rounded-xl bg-indigo-600 px-5 py-3 font-black text-white hover:bg-indigo-500 disabled:opacity-60 transition">{saving ? "Saving…" : "Save Changes"}</button>
          <button type="button" onClick={() => router.push("/admin/store")} className="rounded-xl border border-slate-700 px-5 py-3 text-sm font-bold text-slate-300 hover:bg-slate-800 transition">Cancel</button>
        </div>
      </form>
    </AdminSectionCard>
  );
}
