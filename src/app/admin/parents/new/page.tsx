"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import AdminSectionCard from "@/components/admin/AdminSectionCard";

export default function NewParentPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const response = await fetch("/api/admin/parents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "Unable to create parent.");
      return;
    }
    router.replace(`/admin/parents/${payload.parent.id}`);
  }

  return (
    <AdminSectionCard title="Add Parent" eyebrow="Accounts">
      <form onSubmit={submit} className="max-w-xl space-y-4">
        <label className="block text-sm font-bold text-slate-300">
          Parent name
          <input value={name} onChange={(event) => setName(event.target.value)} required className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white" />
        </label>
        <label className="block text-sm font-bold text-slate-300">
          Email
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white" />
        </label>
        <label className="block text-sm font-bold text-slate-300">
          Temporary password
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white" />
        </label>
        {error ? <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p> : null}
        <button className="rounded-xl bg-indigo-500 px-4 py-3 font-black text-white hover:bg-indigo-400">Create Parent</button>
      </form>
    </AdminSectionCard>
  );
}

