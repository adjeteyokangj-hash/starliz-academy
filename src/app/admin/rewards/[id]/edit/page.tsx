"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AdminSectionCard from "@/components/admin/AdminSectionCard";

type RewardRule = { id: string; name: string; trigger: string; points: number; isActive: boolean };

const inputCls = "w-full rounded-xl border border-slate-700/80 bg-slate-950 px-3.5 py-3 text-sm text-white placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/40 transition";

export default function EditRewardRulePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [rule, setRule] = useState<RewardRule | null>(null);
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("");
  const [points, setPoints] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/resources/rewards`)
      .then((r) => r.ok ? r.json() : null)
      .then((payload) => {
        const found = (payload?.records ?? []).find((r: RewardRule) => r.id === id);
        if (found) { setRule(found); setName(found.name); setTrigger(found.trigger); setPoints(String(found.points)); setIsActive(found.isActive); }
      });
  }, [id]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const res = await fetch(`/api/admin/resources/rewards/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, trigger, points: Number(points), isActive }),
    });
    setSaving(false);
    const payload = await res.json();
    if (!res.ok) { setError(payload.error ?? "Unable to save."); return; }
    router.replace("/admin/rewards");
  }

  if (!rule) return <AdminSectionCard title="Edit Reward Rule"><p className="text-sm text-slate-400">Loading…</p></AdminSectionCard>;

  return (
    <AdminSectionCard title="Edit Reward Rule" eyebrow="Rewards">
      <form onSubmit={submit} className="max-w-xl space-y-4">
        <label className="block text-sm font-bold text-slate-300">Rule name<input value={name} onChange={(e) => setName(e.target.value)} required className={`mt-1.5 ${inputCls}`} /></label>
        <label className="block text-sm font-bold text-slate-300">Trigger (e.g. lesson_complete)<input value={trigger} onChange={(e) => setTrigger(e.target.value)} required className={`mt-1.5 ${inputCls}`} /></label>
        <label className="block text-sm font-bold text-slate-300">Points<input type="number" min={0} value={points} onChange={(e) => setPoints(e.target.value)} required className={`mt-1.5 ${inputCls}`} /></label>
        <label className="flex items-center gap-3 text-sm font-bold text-slate-300 cursor-pointer">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 rounded" />
          Active
        </label>
        {error && <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}
        <div className="flex gap-3">
          <button disabled={saving} className="rounded-xl bg-indigo-600 px-5 py-3 font-black text-white hover:bg-indigo-500 disabled:opacity-60 transition">{saving ? "Saving…" : "Save Changes"}</button>
          <button type="button" onClick={() => router.push("/admin/rewards")} className="rounded-xl border border-slate-700 px-5 py-3 text-sm font-bold text-slate-300 hover:bg-slate-800 transition">Cancel</button>
        </div>
      </form>
    </AdminSectionCard>
  );
}
