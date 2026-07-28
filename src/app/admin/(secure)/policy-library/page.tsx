"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type PolicyRow = {
  id: string;
  slug: string;
  title: string;
  category: string;
  visibility: string;
  current: {
    version: string;
    status: string;
    effectiveDate: string | null;
    lastUpdatedAt: string;
    authorId: string | null;
    approvedBy: string | null;
    changeLog: string | null;
  } | null;
};

export default function AdminPolicyLibraryPage() {
  const [rows, setRows] = useState<PolicyRow[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [can, setCan] = useState({ manage: false, approve: false, publish: false });

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const me = await fetch("/api/admin/me", { cache: "no-store" });
      if (me.ok) {
        const data = await me.json();
        setCan({
          manage: Boolean(data.can?.managePolicies || data.isSuperAdmin),
          approve: Boolean(data.can?.approvePolicies || data.isSuperAdmin),
          publish: Boolean(data.can?.publishPolicies || data.isSuperAdmin),
        });
      }
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (status) params.set("status", status);
      const res = await fetch(`/api/admin/policies?${params.toString()}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Unable to load policies.");
      setRows(Array.isArray(data.documents) ? data.documents : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load policies.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void load();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-10 text-slate-100">
      <div>
        <h1 className="text-3xl font-black">Policy & Knowledge Centre</h1>
        <p className="mt-2 text-sm text-slate-400">
          Version-controlled policies with draft → review → approve → publish. Drafts never appear publicly.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          aria-label="Search policies"
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm"
          placeholder="Search title or slug"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          aria-label="Filter by status"
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm [color-scheme:dark]"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Any status</option>
          <option value="draft">Draft</option>
          <option value="in_review">In review</option>
          <option value="approved">Approved</option>
          <option value="published">Published</option>
          <option value="superseded">Superseded</option>
          <option value="archived">Archived</option>
        </select>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-xl bg-violet-500 px-4 py-2 text-sm font-bold text-white"
        >
          {loading ? "Loading…" : "Apply filters"}
        </button>
        <Link
          href="/admin/policy-library/help"
          className="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-white/5"
        >
          Help articles
        </Link>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-900 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3" scope="col">Title</th>
              <th className="px-4 py-3" scope="col">Version</th>
              <th className="px-4 py-3" scope="col">Status</th>
              <th className="px-4 py-3" scope="col">Visibility</th>
              <th className="px-4 py-3" scope="col">Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-800">
                <td className="px-4 py-3">
                  <Link href={`/admin/policy-library/${row.slug}`} className="font-semibold text-blue-300 hover:text-blue-200">
                    {row.title}
                  </Link>
                  <p className="text-xs text-slate-500">{row.slug} · {row.category}</p>
                </td>
                <td className="px-4 py-3">{row.current?.version ?? "—"}</td>
                <td className="px-4 py-3">{row.current?.status ?? "—"}</td>
                <td className="px-4 py-3">{row.visibility === "internal" ? "Internal" : "Public"}</td>
                <td className="px-4 py-3 text-xs text-slate-400">
                  {row.current?.lastUpdatedAt
                    ? new Date(row.current.lastUpdatedAt).toLocaleDateString("en-GB")
                    : "—"}
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  No CMS policies yet. Run the Gate 5 backfill to import code-managed drafts, then approve and publish.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500" role="status" aria-live="polite">
        Permissions: manage={can.manage ? "yes" : "no"}, approve={can.approve ? "yes" : "no"}, publish={can.publish ? "yes" : "no"}
      </p>
    </div>
  );
}
