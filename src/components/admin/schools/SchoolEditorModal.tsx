"use client";

import { useState, type FormEvent } from "react";
import AdminButton from "@/components/admin/ui/AdminButton";
import AdminModal from "@/components/admin/ui/AdminModal";
import {
  AdminFieldLabel,
  AdminInput,
  AdminSelect,
  AdminTextarea,
} from "@/components/admin/ui/AdminInput";
import { postSchoolAction } from "@/components/admin/schools/school-actions";

export type EditableSchool = {
  id: string;
  name: string;
  slug: string;
  status: string;
  type: string;
  contactEmail: string | null;
  contactPhone: string | null;
  notes: string | null;
};

type Mode = "create" | "edit";

type Props = {
  open: boolean;
  mode: Mode;
  school?: EditableSchool | null;
  onClose: () => void;
  onSaved: () => void;
};

type FormState = {
  name: string;
  slug: string;
  status: "pilot" | "active" | "suspended" | "archived";
  type: string;
  contactEmail: string;
  contactPhone: string;
  notes: string;
};

const EMPTY: FormState = {
  name: "",
  slug: "",
  status: "pilot",
  type: "school",
  contactEmail: "",
  contactPhone: "",
  notes: "",
};

function toForm(school?: EditableSchool | null): FormState {
  if (!school) return EMPTY;
  const status = ["pilot", "active", "suspended", "archived"].includes(school.status)
    ? (school.status as FormState["status"])
    : "pilot";
  return {
    name: school.name,
    slug: school.slug,
    status,
    type: school.type || "school",
    contactEmail: school.contactEmail ?? "",
    contactPhone: school.contactPhone ?? "",
    notes: school.notes ?? "",
  };
}

type FormProps = {
  mode: Mode;
  school?: EditableSchool | null;
  onClose: () => void;
  onSaved: () => void;
};

function SchoolEditorForm({ mode, school, onClose, onSaved }: FormProps) {
  const [form, setForm] = useState<FormState>(() => toForm(mode === "edit" ? school : null));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        slug: form.slug.trim() || undefined,
        status: form.status,
        type: form.type.trim() || "school",
        contactEmail: form.contactEmail.trim(),
        contactPhone: form.contactPhone.trim() || undefined,
        notes: form.notes.trim() || undefined,
        ...(mode === "edit" && school ? { schoolId: school.id } : {}),
      };
      const result = await postSchoolAction(mode === "edit" ? "updateSchool" : "createSchool", payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <form id="school-editor-form" className="space-y-3" onSubmit={onSubmit}>
        <AdminFieldLabel>
          School name
          <AdminInput
            required
            minLength={2}
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            className="mt-1.5"
            placeholder="e.g. Riverside Primary"
          />
        </AdminFieldLabel>
        <AdminFieldLabel>
          Slug
          <AdminInput
            value={form.slug}
            onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))}
            className="mt-1.5"
            placeholder="Optional URL slug"
          />
        </AdminFieldLabel>
        <div className="grid gap-3 sm:grid-cols-2">
          <AdminFieldLabel>
            Status
            <AdminSelect
              value={form.status}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  status: event.target.value as FormState["status"],
                }))
              }
              className="mt-1.5"
            >
              <option value="pilot">Pilot</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="archived">Archived</option>
            </AdminSelect>
          </AdminFieldLabel>
          <AdminFieldLabel>
            Type
            <AdminSelect
              value={form.type}
              onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}
              className="mt-1.5"
            >
              <option value="school">School</option>
              <option value="tutoring_centre">Tutoring centre</option>
              <option value="organisation">Organisation</option>
            </AdminSelect>
          </AdminFieldLabel>
        </div>
        <AdminFieldLabel>
          Contact email
          <AdminInput
            type="email"
            value={form.contactEmail}
            onChange={(event) => setForm((current) => ({ ...current, contactEmail: event.target.value }))}
            className="mt-1.5"
            placeholder="admin@school.example"
          />
        </AdminFieldLabel>
        <AdminFieldLabel>
          Contact phone
          <AdminInput
            value={form.contactPhone}
            onChange={(event) => setForm((current) => ({ ...current, contactPhone: event.target.value }))}
            className="mt-1.5"
            placeholder="+44 …"
          />
        </AdminFieldLabel>
        <AdminFieldLabel>
          Notes
          <AdminTextarea
            rows={3}
            value={form.notes}
            onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            className="mt-1.5"
            placeholder="Ops notes for this school"
          />
        </AdminFieldLabel>
        {error ? (
          <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
            {error}
          </p>
        ) : null}
      </form>
      <div className="mt-5 flex flex-wrap gap-2">
        <AdminButton type="button" variant="secondary" onClick={onClose} disabled={saving}>
          Cancel
        </AdminButton>
        <AdminButton type="submit" form="school-editor-form" disabled={saving}>
          {saving ? "Saving…" : mode === "edit" ? "Save changes" : "Create school"}
        </AdminButton>
      </div>
    </>
  );
}

export default function SchoolEditorModal({ open, mode, school, onClose, onSaved }: Props) {
  return (
    <AdminModal
      open={open}
      className="max-w-lg"
      title={mode === "edit" ? "Edit school" : "Add school"}
      description={
        mode === "edit"
          ? "Update school profile, status, and contact details."
          : "Register a school in the platform registry."
      }
      onClose={onClose}
    >
      {open ? (
        <SchoolEditorForm
          key={`${mode}:${school?.id ?? "new"}`}
          mode={mode}
          school={school}
          onClose={onClose}
          onSaved={onSaved}
        />
      ) : null}
    </AdminModal>
  );
}
