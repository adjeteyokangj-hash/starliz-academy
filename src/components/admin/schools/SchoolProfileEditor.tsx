"use client";

import { useCallback, useEffect, useState } from "react";
import SchoolEditorModal, {
  type EditableSchool,
} from "@/components/admin/schools/SchoolEditorModal";
import AdminButton from "@/components/admin/ui/AdminButton";

type Props = {
  schoolId: string;
};

export default function SchoolProfileEditor({ schoolId }: Props) {
  const [school, setSchool] = useState<EditableSchool | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const loadSchool = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/schools", {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) {
        setError("Unable to load school profile.");
        return;
      }
      const payload = (await response.json()) as { schools?: EditableSchool[] };
      const match = (payload.schools ?? []).find((row) => row.id === schoolId) ?? null;
      if (!match) {
        setError("School not found.");
        setSchool(null);
        return;
      }
      setSchool(match);
    } catch {
      setError("Unable to load school profile.");
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSchool();
  }, [loadSchool]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("mode") !== "edit") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEditorOpen(true);
    window.history.replaceState({}, "", `/admin/schools/${schoolId}/profile`);
  }, [schoolId]);

  return (
    <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
      <h2 className="text-sm font-semibold text-white">School Profile</h2>
      <p className="mt-1 text-xs text-slate-400">Name, status, contact profile, and school metadata controls.</p>

      {loading ? <p className="mt-3 text-xs text-slate-400">Loading profile…</p> : null}
      {error ? <p className="mt-3 text-xs text-rose-200">{error}</p> : null}

      {school && !loading ? (
        <dl className="mt-3 space-y-1.5 text-xs text-slate-300">
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 text-slate-500">Name</dt>
            <dd className="text-slate-100">{school.name}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 text-slate-500">Status</dt>
            <dd className="capitalize text-slate-100">{school.status}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 text-slate-500">Type</dt>
            <dd className="text-slate-100">{school.type}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 text-slate-500">Email</dt>
            <dd className="text-slate-100">{school.contactEmail ?? "—"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 text-slate-500">Phone</dt>
            <dd className="text-slate-100">{school.contactPhone ?? "—"}</dd>
          </div>
          {school.notes ? (
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-slate-500">Notes</dt>
              <dd className="text-slate-100">{school.notes}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      <AdminButton
        type="button"
        size="sm"
        variant="secondary"
        className="mt-3"
        disabled={!school}
        onClick={() => setEditorOpen(true)}
      >
        Edit Profile
      </AdminButton>

      <SchoolEditorModal
        open={editorOpen}
        mode="edit"
        school={school}
        onClose={() => setEditorOpen(false)}
        onSaved={() => {
          void loadSchool();
        }}
      />
    </article>
  );
}
