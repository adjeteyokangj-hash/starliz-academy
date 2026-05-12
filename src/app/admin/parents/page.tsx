"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminSectionCard from "@/components/admin/AdminSectionCard";

type ParentRow = {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  status: string;
  profileStatus: "complete" | "incomplete";
  childrenCount: number;
  subscriptionStatus: string;
  lastLogin: string;
  createdAt: string;
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.floor(diff / 60000));
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function ParentsPage() {
  const [parents, setParents] = useState<ParentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyParentId, setBusyParentId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [subscriptionFilter, setSubscriptionFilter] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  async function removeParent(parent: ParentRow) {
    if (!window.confirm(`Archive ${parent.name ?? parent.email}? Linked students will be archived, not permanently deleted.`)) return;
    setBusyParentId(parent.id);
    try {
      const response = await fetch(`/api/admin/parents/${parent.id}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        window.alert(payload?.error ?? "Unable to archive parent.");
        return;
      }
      setParents((current) => current.filter((entry) => entry.id !== parent.id));
    } finally {
      setBusyParentId(null);
    }
  }

  useEffect(() => {
    fetch("/api/admin/parents")
      .then((r) => { if (r.status === 401) { window.location.replace("/admin/login?next=/admin/parents"); return null; } return r.ok ? r.json() : null; })
      .then((payload) => { if (payload) setParents(payload.parents ?? []); })
      .finally(() => setLoading(false));
  }, []);

  const filtered = parents.filter((parent) => {
    const query = search.toLowerCase();
    const matchesSearch = (parent.name ?? "").toLowerCase().includes(query) || parent.email.toLowerCase().includes(query);
    const matchesSubscription = subscriptionFilter === "all" || parent.subscriptionStatus.toLowerCase() === subscriptionFilter;
    return matchesSearch && matchesSubscription;
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <AdminSectionCard
      title="Parent Accounts"
      eyebrow="Accounts"
      action={<Link href="/admin/parents/new" className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-bold text-white">Add Parent</Link>}
    >
      {loading ? <p className="text-sm text-slate-400">Loading parents...</p> : null}
      <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_14rem]">
        <input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Search parents by name or email"
          className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white placeholder:text-slate-600"
        />
        <select
          value={subscriptionFilter}
          onChange={(event) => {
            setSubscriptionFilter(event.target.value);
            setPage(1);
          }}
          className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white"
        >
          <option value="all">All subscriptions</option>
          <option value="free">Free</option>
          <option value="active">Active</option>
          <option value="past due">Past due</option>
        </select>
      </div>
      {!loading && parents.length === 0 ? (
        <AdminEmptyState
          title="No parent accounts yet"
          description="Create a parent account before adding students. Each student must belong to one parent."
          actionLabel="Add Parent"
        />
      ) : null}
      {parents.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs uppercase text-slate-500">
                <th className="px-3 py-3">Parent</th>
                <th className="px-3 py-3">Email</th>
                <th className="px-3 py-3">Phone</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Profile</th>
                <th className="px-3 py-3">Children</th>
                <th className="px-3 py-3">Subscription</th>
                <th className="px-3 py-3">Last Login</th>
                <th className="px-3 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((parent) => (
                <tr key={parent.id} className="border-b border-slate-800/70 text-slate-300">
                  <td className="px-3 py-3 font-bold text-white">{parent.name ?? "Parent"}</td>
                  <td className="px-3 py-3">{parent.email}</td>
                  <td className="px-3 py-3">{parent.phone ?? "Not set"}</td>
                  <td className="px-3 py-3">
                    <span className="rounded-full bg-slate-800 px-2 py-1 text-xs font-bold text-slate-200 capitalize">{parent.status}</span>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-bold capitalize ${parent.profileStatus === "complete" ? "bg-emerald-900 text-emerald-200" : "bg-yellow-900 text-yellow-200"}`}>
                      {parent.profileStatus === "incomplete" && "⚠ "}{parent.profileStatus}
                    </span>
                  </td>
                  <td className="px-3 py-3">{parent.childrenCount}</td>
                  <td className="px-3 py-3">
                    <span className="rounded-full bg-slate-800 px-2 py-1 text-xs font-bold text-slate-200">{parent.subscriptionStatus}</span>
                  </td>
                  <td className="px-3 py-3">{timeAgo(parent.lastLogin)}</td>
                  <td className="px-3 py-3">
                    <Link href={`/admin/parents/${parent.id}`} className="mr-2 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-800">
                      View Account
                    </Link>
                    <Link href={`/admin/parents/${parent.id}/edit`} className="rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-400">
                      Edit
                    </Link>
                    <button
                      type="button"
                      onClick={() => removeParent(parent)}
                      disabled={busyParentId === parent.id}
                      className="ml-2 rounded-lg border border-rose-500/40 px-3 py-1.5 text-xs font-bold text-rose-200 hover:bg-rose-500/10 disabled:opacity-50"
                    >
                      {busyParentId === parent.id ? "Archiving..." : "Archive"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t border-slate-800 px-3 py-3 text-sm text-slate-400">
            <span>Showing {visible.length} of {filtered.length}</span>
            <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="rounded-lg border border-slate-700 px-3 py-1.5 disabled:opacity-40">Previous</button>
              <span className="px-2 py-1.5">Page {page} of {pageCount}</span>
              <button disabled={page === pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))} className="rounded-lg border border-slate-700 px-3 py-1.5 disabled:opacity-40">Next</button>
            </div>
          </div>
        </div>
      ) : null}
    </AdminSectionCard>
  );
}
