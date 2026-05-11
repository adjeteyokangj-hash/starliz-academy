"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AdminSectionCard from "@/components/admin/AdminSectionCard";

type ParentOption = { id: string; name: string | null; email: string };
type StudentDetail = {
  id: string;
  name: string;
  age: number | null;
  yearGroup: string | null;
  parent: ParentOption;
};

export default function EditStudentPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [parents, setParents] = useState<ParentOption[]>([]);
  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [parentId, setParentId] = useState("");
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [yearGroup, setYearGroup] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/parents")
      .then((r) => r.ok ? r.json() : null)
      .then((payload) => { if (payload) setParents(payload.parents ?? []); });
    fetch(`/api/admin/students/${params.id}`)
      .then((r) => r.ok ? r.json() : null)
      .then((payload) => {
        if (!payload) return;
        if (payload.student) {
          setStudent(payload.student);
          setName(payload.student.name);
          setParentId(payload.student.parent.id);
          setAge(payload.student.age ? String(payload.student.age) : "");
          setYearGroup(payload.student.yearGroup ?? "");
        }
      });
  }, [params.id]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const response = await fetch(`/api/admin/students/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        parentId,
        name,
        age: age ? Number(age) : null,
        yearGroup: yearGroup || null,
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "Unable to update student.");
      return;
    }
    router.replace(`/admin/students/${params.id}`);
  }

  if (!student) {
    return <AdminSectionCard title="Edit Student"><p className="text-sm text-slate-400">Loading student...</p></AdminSectionCard>;
  }

  return (
    <AdminSectionCard title="Edit Student" eyebrow="Learners">
      <form onSubmit={submit} className="max-w-xl space-y-4">
        <label className="block text-sm font-bold text-slate-300">
          Linked parent
          <select value={parentId} onChange={(event) => setParentId(event.target.value)} required className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white">
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
        <button className="rounded-xl bg-indigo-500 px-4 py-3 font-black text-white hover:bg-indigo-400">Save Student</button>
      </form>
    </AdminSectionCard>
  );
}

