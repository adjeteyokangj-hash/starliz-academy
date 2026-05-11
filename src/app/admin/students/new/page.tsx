"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AdminSectionCard from "@/components/admin/AdminSectionCard";

type ParentOption = { id: string; name: string | null; email: string };

export default function NewStudentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [parents, setParents] = useState<ParentOption[]>([]);
  const [parentId, setParentId] = useState(searchParams.get("parentId") ?? "");
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [yearGroup, setYearGroup] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/parents")
      .then((r) => r.ok ? r.json() : null)
      .then((payload) => { if (payload) setParents(payload.parents ?? []); });
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const response = await fetch("/api/admin/students", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        parentId,
        name,
        age: age ? Number(age) : undefined,
        yearGroup: yearGroup || undefined,
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "Unable to create student.");
      return;
    }
    router.replace(`/admin/students/${payload.student.id}`);
  }

  return (
    <AdminSectionCard title="Add Student" eyebrow="Learners">
      <form onSubmit={submit} className="max-w-xl space-y-4">
        <label className="block text-sm font-bold text-slate-300">
          Linked parent
          <select value={parentId} onChange={(event) => setParentId(event.target.value)} required className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white">
            <option value="">Select parent</option>
            {parents.map((parent) => (
              <option key={parent.id} value={parent.id}>{parent.name ?? parent.email} ({parent.email})</option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-bold text-slate-300">
          Student name
          <input value={name} onChange={(event) => setName(event.target.value)} required className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white" />
        </label>
        <label className="block text-sm font-bold text-slate-300">
          Age
          <input type="number" min={1} max={18} value={age} onChange={(event) => setAge(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white" />
        </label>
        <label className="block text-sm font-bold text-slate-300">
          Year group
          <input value={yearGroup} onChange={(event) => setYearGroup(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white" />
        </label>
        {error ? <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p> : null}
        <button className="rounded-xl bg-indigo-500 px-4 py-3 font-black text-white hover:bg-indigo-400">Create Student</button>
      </form>
    </AdminSectionCard>
  );
}

