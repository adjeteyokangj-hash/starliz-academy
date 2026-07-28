"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Version = {
  id: string;
  version: string;
  status: string;
  effectiveDate: string | null;
  lastUpdatedAt: string;
  authorId: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  publishedAt: string | null;
  changeLog: string | null;
  approvalHistory: Array<{ action: string; actorUserId: string; at: string; note?: string }>;
  body: { title: string; summary: string; sections: Array<{ heading: string; body: string[] }> };
};

export default function AdminPolicyDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const [versions, setVersions] = useState<Version[]>([]);
  const [title, setTitle] = useState(slug);
  const [visibility, setVisibility] = useState("public");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  async function load() {
    setError(null);
    const res = await fetch(`/api/admin/policies/${encodeURIComponent(slug)}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Unable to load policy.");
      return;
    }
    setTitle(data.document.title);
    setVisibility(data.document.visibility);
    setVersions(data.document.versions ?? []);
    setSelectedId(data.document.currentVersionId ?? data.document.versions?.[0]?.id ?? null);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount/slug change; frozen behaviour, advisory only
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  async function run(action: string, extra?: Record<string, unknown>) {
    setMessage(null);
    setError(null);
    const res = await fetch(`/api/admin/policies/${encodeURIComponent(slug)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Action failed.");
      return;
    }
    setMessage(`${action} succeeded.`);
    await load();
  }

  const selected = versions.find((v) => v.id === selectedId) ?? versions[0];
  const compare = versions.find((v) => v.id !== selected?.id);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-10 text-slate-100">
      <Link href="/admin/policy-library" className="text-sm text-blue-300 hover:text-blue-200">
        ← Policy centre
      </Link>
      <div>
        <h1 className="text-3xl font-black">{title}</h1>
        <p className="mt-1 text-sm text-slate-400">
          {slug} · visibility: {visibility}
        </p>
      </div>

      {error ? <p role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">{error}</p> : null}
      {message ? <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{message}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold" onClick={() => void run("submit")}>
          Submit for review
        </button>
        <button type="button" className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold" onClick={() => void run("approve")}>
          Approve
        </button>
        <button type="button" className="rounded-xl bg-violet-500 px-3 py-2 text-xs font-bold text-white" onClick={() => void run("publish")}>
          Publish
        </button>
        <button type="button" className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold" onClick={() => void run("archive")}>
          Archive
        </button>
        <button
          type="button"
          className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold"
          onClick={() => void run("set_visibility", { visibility: visibility === "public" ? "internal" : "public" })}
        >
          Toggle visibility
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-800 p-4">
          <h2 className="text-lg font-bold">Versions</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {versions.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  className={`w-full rounded-lg px-3 py-2 text-left ${selected?.id === v.id ? "bg-violet-500/20" : "hover:bg-white/5"}`}
                  onClick={() => setSelectedId(v.id)}
                >
                  <span className="font-semibold">v{v.version}</span> · {v.status}
                  <span className="block text-xs text-slate-400">{v.changeLog}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-slate-800 p-4">
          <h2 className="text-lg font-bold">Selected version</h2>
          {selected ? (
            <div className="mt-3 space-y-2 text-sm text-slate-300">
              <p>Status: {selected.status}</p>
              <p>Author: {selected.authorId ?? "—"}</p>
              <p>Approver: {selected.approvedBy ?? "—"}</p>
              <p>Effective: {selected.effectiveDate ? new Date(selected.effectiveDate).toLocaleDateString("en-GB") : "—"}</p>
              <p>Published: {selected.publishedAt ? new Date(selected.publishedAt).toLocaleDateString("en-GB") : "—"}</p>
              <h3 className="pt-3 font-bold text-white">Approval history</h3>
              <ul className="space-y-1 text-xs">
                {selected.approvalHistory.map((entry, index) => (
                  <li key={`${entry.at}-${index}`}>
                    {entry.action} by {entry.actorUserId} at {new Date(entry.at).toLocaleString("en-GB")}
                    {entry.note ? ` — ${entry.note}` : ""}
                  </li>
                ))}
              </ul>
              <h3 className="pt-3 font-bold text-white">Summary</h3>
              <p>{selected.body.summary}</p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-400">No versions.</p>
          )}
        </section>
      </div>

      {selected && compare ? (
        <section className="rounded-xl border border-slate-800 p-4">
          <h2 className="text-lg font-bold">Compare with previous</h2>
          <p className="mt-2 text-sm text-slate-400">
            Selected v{selected.version} ({selected.status}) vs v{compare.version} ({compare.status})
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2 text-sm">
            <div>
              <p className="font-bold">Selected sections: {selected.body.sections.length}</p>
              <p className="text-slate-400">{selected.changeLog}</p>
            </div>
            <div>
              <p className="font-bold">Other sections: {compare.body.sections.length}</p>
              <p className="text-slate-400">{compare.changeLog}</p>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
