"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import AdminSectionCard from "@/components/admin/AdminSectionCard";

type ContentDetail = {
  id: string;
  contentType: string;
  level: number;
  topic: string;
  contentJson: string;
  usedCount: number;
  status: "generated" | "reviewed" | "approved" | "published" | "rejected";
  createdAt: string;
  createdBy: string;
};

const statuses: ContentDetail["status"][] = ["generated", "reviewed", "approved", "published", "rejected"];

function getJsonValidationError(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.length ? null : "JSON array must contain at least one item.";
    }
    if (parsed && typeof parsed === "object") {
      return null;
    }
    return "JSON must be an object or array.";
  } catch {
    return "JSON is invalid.";
  }
}

export default function ContentDetailPage() {
  const params = useParams<{ id: string }>();
  const [item, setItem] = useState<ContentDetail | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editJson, setEditJson] = useState("");
  const [savingJson, setSavingJson] = useState(false);

  const loadItem = useCallback(async () => {
    const response = await fetch(`/api/admin/content/${params.id}`);
    const payload = await response.json();
    const nextItem = payload.item ?? null;
    setItem(nextItem);
    if (nextItem?.contentJson) {
      setEditJson(nextItem.contentJson);
    }
  }, [params.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadItem();
  }, [loadItem]);

  async function updateStatus(status: ContentDetail["status"]) {
    const response = await fetch(`/api/admin/content/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setMessage(payload.error ?? "Unable to update status.");
      return;
    }
    setMessage(`Content moved to ${status}.`);
    await loadItem();
  }

  async function saveContentJson() {
    const validationError = getJsonValidationError(editJson);
    if (validationError) {
      setMessage(validationError);
      return;
    }

    setSavingJson(true);
    const response = await fetch(`/api/admin/content/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentJson: editJson }),
    });
    const payload = await response.json();
    setSavingJson(false);
    if (!response.ok) {
      setMessage(payload.error ?? "Unable to save content JSON.");
      return;
    }
    setMessage("Content JSON updated successfully.");
    await loadItem();
  }

  if (!item) {
    return <AdminSectionCard title="Content Item"><p className="text-sm text-slate-400">Loading content...</p></AdminSectionCard>;
  }

  return (
    <div className="space-y-6">
      <AdminSectionCard title={`${item.contentType} content`} eyebrow="Content detail">
        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl bg-slate-950/45 p-4">
            <p className="text-xs uppercase text-slate-500">Status</p>
            <p className="mt-2 font-black capitalize text-white">{item.status}</p>
          </div>
          <div className="rounded-2xl bg-slate-950/45 p-4">
            <p className="text-xs uppercase text-slate-500">Level</p>
            <p className="mt-2 font-black text-white">{item.level}</p>
          </div>
          <div className="rounded-2xl bg-slate-950/45 p-4">
            <p className="text-xs uppercase text-slate-500">Topic</p>
            <p className="mt-2 font-black text-white">{item.topic || "None"}</p>
          </div>
          <div className="rounded-2xl bg-slate-950/45 p-4">
            <p className="text-xs uppercase text-slate-500">Used</p>
            <p className="mt-2 font-black text-white">{item.usedCount}x</p>
          </div>
        </div>
      </AdminSectionCard>

      <AdminSectionCard title="Approval Workflow" eyebrow="Draft to published">
        {message ? <p className="mb-4 rounded-xl border border-blue-400/20 bg-blue-400/10 p-3 text-sm text-blue-100">{message}</p> : null}
        <div className="flex flex-wrap gap-2">
          {statuses.map((status) => (
            <button
              key={status}
              onClick={() => void updateStatus(status)}
              className={`rounded-xl px-4 py-2 text-sm font-black capitalize ${item.status === status ? "bg-indigo-500 text-white" : "border border-slate-700 text-slate-200 hover:bg-slate-800"}`}
            >
              {status}
            </button>
          ))}
        </div>
      </AdminSectionCard>

      <AdminSectionCard title="Content JSON">
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              try {
                setEditJson(JSON.stringify(JSON.parse(editJson), null, 2));
                setMessage("JSON formatted.");
              } catch {
                setMessage("JSON is invalid.");
              }
            }}
            className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-black text-slate-200 hover:bg-slate-800"
          >
            Format JSON
          </button>
          <button
            type="button"
            onClick={() => setMessage(getJsonValidationError(editJson) ?? "JSON is valid.")}
            className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-black text-slate-200 hover:bg-slate-800"
          >
            Validate JSON
          </button>
          <button
            type="button"
            onClick={() => void saveContentJson()}
            disabled={savingJson}
            className="rounded-xl bg-indigo-500 px-3 py-2 text-xs font-black text-white disabled:opacity-50"
          >
            {savingJson ? "Saving..." : "Save JSON"}
          </button>
        </div>
        <textarea
          value={editJson}
          onChange={(event) => setEditJson(event.target.value)}
          className="min-h-[24rem] w-full rounded-2xl bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-300"
        />
      </AdminSectionCard>
    </div>
  );
}
