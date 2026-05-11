"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AdminSectionCard from "@/components/admin/AdminSectionCard";

type ParentDetail = {
  id: string;
  name: string | null;
  email: string;
};

export default function EditParentPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [parent, setParent] = useState<ParentDetail | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/parents/${params.id}`)
      .then((r) => r.ok ? r.json() : null)
      .then((payload) => {
        if (!payload) return;
        if (payload.parent) {
          setParent(payload.parent);
          setName(payload.parent.name ?? "");
          setEmail(payload.parent.email);
        }
      });
  }, [params.id]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const response = await fetch(`/api/admin/parents/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "Unable to update parent.");
      return;
    }
    router.replace(`/admin/parents/${params.id}`);
  }

  if (!parent) {
    return <AdminSectionCard title="Edit Parent"><p className="text-sm text-slate-400">Loading parent...</p></AdminSectionCard>;
  }

  return (
    <AdminSectionCard title="Edit Parent" eyebrow="Accounts">
      <form onSubmit={submit} className="max-w-xl space-y-4">
        <label className="block text-sm font-bold text-slate-300">
          Parent name
          <input value={name} onChange={(event) => setName(event.target.value)} required className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white" />
        </label>
        <label className="block text-sm font-bold text-slate-300">
          Email
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white" />
        </label>
        {error ? <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p> : null}
        <button className="rounded-xl bg-indigo-500 px-4 py-3 font-black text-white hover:bg-indigo-400">Save Parent</button>
      </form>
    </AdminSectionCard>
  );
}

