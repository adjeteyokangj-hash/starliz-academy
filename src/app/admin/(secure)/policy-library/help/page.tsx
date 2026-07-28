"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type HelpRow = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: string;
  visibility: string;
  status: string;
  relatedPolicySlug: string | null;
};

export default function AdminHelpArticlesPage() {
  const [rows, setRows] = useState<HelpRow[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    setError(null);
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    const res = await fetch(`/api/admin/help-articles?${params.toString()}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Unable to load help articles.");
      return;
    }
    setRows(Array.isArray(data.articles) ? data.articles : []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount; frozen behaviour, advisory only
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function publish(slug: string) {
    setMessage(null);
    const res = await fetch("/api/admin/help-articles", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "publish", slug }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Publish failed.");
      return;
    }
    setMessage(`Published ${slug}`);
    await load();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-10 text-slate-100">
      <Link href="/admin/policy-library" className="text-sm text-blue-300 hover:text-blue-200">
        ← Policy centre
      </Link>
      <h1 className="text-3xl font-black">Help Centre articles</h1>
      <p className="text-sm text-slate-400">Internal and public help articles. Only published public articles appear on /knowledge-centre.</p>

      <div className="flex flex-wrap gap-3">
        <input
          aria-label="Search help articles"
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search"
        />
        <button type="button" className="rounded-xl bg-violet-500 px-4 py-2 text-sm font-bold" onClick={() => void load()}>
          Search
        </button>
      </div>

      {error ? <p role="alert" className="text-amber-100">{error}</p> : null}
      {message ? <p role="status" className="text-emerald-100">{message}</p> : null}

      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-900 text-xs uppercase text-slate-400">
            <tr>
              <th className="px-4 py-3" scope="col">Title</th>
              <th className="px-4 py-3" scope="col">Status</th>
              <th className="px-4 py-3" scope="col">Visibility</th>
              <th className="px-4 py-3" scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-800">
                <td className="px-4 py-3">
                  <p className="font-semibold">{row.title}</p>
                  <p className="text-xs text-slate-500">{row.category} · {row.relatedPolicySlug ?? "no policy link"}</p>
                </td>
                <td className="px-4 py-3">{row.status}</td>
                <td className="px-4 py-3">{row.visibility}</td>
                <td className="px-4 py-3">
                  {row.status !== "published" ? (
                    <button type="button" className="rounded-lg bg-violet-500 px-3 py-1 text-xs font-bold" onClick={() => void publish(row.slug)}>
                      Publish
                    </button>
                  ) : (
                    <span className="text-xs text-emerald-300">Live</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
