"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AdminButtonLink, AdminPageHeader } from "@/components/admin/ui";

type JourneyRow = {
  id: string;
  subject: string;
  yearGroup: string;
  durationMinutes: number;
  status: string;
  topic: string;
  school?: { id: string; name: string };
  createdAt: string;
};

export default function ShortLearningJourneysPage() {
  const searchParams = useSearchParams();
  const status = searchParams.get("status") ?? "";
  const schoolId = searchParams.get("schoolId") ?? "";
  const [journeys, setJourneys] = useState<JourneyRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = new URLSearchParams();
    if (status) q.set("status", status);
    if (schoolId) q.set("schoolId", schoolId);
    fetch(`/api/admin/short-learning/journeys?${q.toString()}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load journeys");
        setJourneys(data.journeys ?? []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, [status, schoolId]);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Short Learning"
        title="Content journeys"
        subtitle="Generate → review → publish. Students only receive published journeys."
        actions={
          <>
            <AdminButtonLink href="/admin/ai-generator?deliveryMode=SHORT_LEARNING">
              Create Short Learning Content
            </AdminButtonLink>
            <AdminButtonLink href="/admin/short-learning" variant="secondary">
              Operations
            </AdminButtonLink>
          </>
        }
      />

      <div className="flex flex-wrap gap-2 text-sm">
        {[
          ["", "All"],
          ["draft", "Drafts"],
          ["generating", "Generating"],
          ["awaiting_review", "Awaiting Review"],
          ["changes_requested", "Changes Requested"],
          ["approved", "Approved"],
          ["published", "Published"],
          ["failed", "Failed"],
          ["legacy_generated", "Legacy Generated"],
        ].map(([value, label]) => {
          const active = status === value;
          return (
            <Link
              key={value || "all"}
              href={`/admin/short-learning/journeys${value ? `?status=${value}` : ""}`}
              className={`rounded-full border px-3 py-1 font-semibold ${
                active
                  ? "border-[var(--admin-primary)]/50 bg-[var(--admin-primary-muted)] text-[var(--admin-text)]"
                  : "border-[var(--admin-border)] text-[var(--admin-muted)] hover:text-[var(--admin-text)]"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </div>

      <p className="text-xs text-[var(--admin-muted)]">
        Generation success does not equal publication. Students only receive journeys with status{" "}
        <span className="font-semibold text-[var(--admin-text)]">published</span>.
      </p>

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}

      <div
        className="overflow-hidden rounded-[var(--admin-radius-lg)] border border-[var(--admin-border)]"
        style={{ background: "var(--admin-surface)", boxShadow: "var(--admin-shadow-sm)" }}
      >
        <table className="min-w-full text-left text-sm text-[var(--admin-text)]">
          <thead
            className="border-b border-[var(--admin-border)] text-xs uppercase tracking-[0.08em] text-[var(--admin-muted)]"
            style={{ background: "var(--admin-rail)" }}
          >
            <tr>
              <th className="px-4 py-3">School</th>
              <th className="px-4 py-3">Subject</th>
              <th className="px-4 py-3">Year</th>
              <th className="px-4 py-3">Duration</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Topic</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {journeys.map((j) => (
              <tr key={j.id} className="border-t border-[var(--admin-border)]">
                <td className="px-4 py-3">{j.school?.name ?? "—"}</td>
                <td className="px-4 py-3">{j.subject}</td>
                <td className="px-4 py-3">{j.yearGroup}</td>
                <td className="px-4 py-3">{j.durationMinutes}m</td>
                <td className="px-4 py-3">{j.status}</td>
                <td className="px-4 py-3">{j.topic || "—"}</td>
                <td className="px-4 py-3 text-right">
                  <Link
                    className="font-semibold text-[var(--admin-primary-hover)] underline underline-offset-2"
                    href={`/admin/short-learning/journeys/${j.id}`}
                  >
                    Review
                  </Link>
                </td>
              </tr>
            ))}
            {journeys.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-[var(--admin-muted)]" colSpan={7}>
                  No journeys found for this filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
