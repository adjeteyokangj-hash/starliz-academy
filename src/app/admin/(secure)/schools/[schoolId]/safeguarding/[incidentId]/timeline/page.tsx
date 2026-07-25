"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";
import SafeguardingGovernanceBanners from "../../governance-banners";
import {
  fetchAuditFeed,
  fetchIncident,
  postTimelineUpdate,
  type AuditEvent,
  type IncidentRecord,
  type TimelineEvent,
  type ValidationError,
  SafeguardingApiError,
} from "../../api-client";

export default function SchoolSafeguardingTimelinePage() {
  const params = useParams<{ schoolId: string; incidentId: string }>();
  const schoolId = params.schoolId;
  const incidentId = params.incidentId;

  const [incident, setIncident] = useState<IncidentRecord | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [auditFeed, setAuditFeed] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [apiUnavailable, setApiUnavailable] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);

  const handleApiError = useCallback((error: unknown, fallbackMessage: string) => {
    if (error instanceof SafeguardingApiError) {
      if (error.code === "FORBIDDEN") setPermissionDenied(true);
      if (error.code === "API_UNAVAILABLE") setApiUnavailable(true);
      setValidationErrors(error.validationErrors);
      setErrorMessage(error.message);
      return;
    }
    setApiUnavailable(true);
    setErrorMessage(fallbackMessage);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setPermissionDenied(false);
    setApiUnavailable(false);
    setErrorMessage(null);
    setValidationErrors([]);

    try {
      const [incidentEnvelope, auditEnvelope] = await Promise.all([
        fetchIncident(schoolId, incidentId),
        fetchAuditFeed(schoolId, incidentId),
      ]);
      setIncident(incidentEnvelope.data?.incident ?? null);
      setAuditFeed(auditEnvelope.data?.audit ?? []);
    } catch (error) {
      handleApiError(error, "Unexpected error while loading incident timeline data.");
    } finally {
      setLoading(false);
    }
  }, [handleApiError, incidentId, schoolId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadAll();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadAll]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setSaving(true);
    setSuccessMessage(null);
    setErrorMessage(null);
    setValidationErrors([]);
    setPermissionDenied(false);
    setApiUnavailable(false);

    try {
      const eventTimestampRaw = String(formData.get("timestamp") ?? "");
      const eventTimestamp = eventTimestampRaw ? new Date(eventTimestampRaw).toISOString() : undefined;
      const envelope = await postTimelineUpdate(schoolId, incidentId, {
        action: String(formData.get("action") ?? "Case note"),
        note: String(formData.get("note") ?? ""),
        timestamp: eventTimestamp,
      });
      setTimelineEvents(envelope.data?.timeline ?? []);
      const nextAudit = await fetchAuditFeed(schoolId, incidentId);
      setAuditFeed(nextAudit.data?.audit ?? []);
      setSuccessMessage("Timeline update saved successfully.");
      event.currentTarget.reset();
    } catch (error) {
      handleApiError(error, "Unexpected error while saving timeline update.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <SchoolDashboardShell schoolId={schoolId} activeTab="safeguarding" title="Safeguarding Timeline" subtitle="Loading timeline data.">
        <p className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs text-slate-300">Loading timeline...</p>
      </SchoolDashboardShell>
    );
  }

  if (!incident) {
    return (
      <SchoolDashboardShell schoolId={schoolId} activeTab="safeguarding" title="Safeguarding Timeline" subtitle="Incident not found.">
        <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">Incident record not found.</p>
        <div className="mt-3">
          <Link href={`/admin/schools/${schoolId}/safeguarding`} className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-200">Return to register</Link>
        </div>
      </SchoolDashboardShell>
    );
  }

  return (
    <SchoolDashboardShell
      schoolId={schoolId}
      activeTab="safeguarding"
      title={`Incident Timeline ${incident.id}`}
      subtitle="Add chronology updates and preserve safeguarding event history."
    >
      <div className="space-y-4">
        <SafeguardingGovernanceBanners />

        {saving ? <p className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs text-slate-300">Saving timeline update...</p> : null}
        {permissionDenied ? <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">Permission denied for timeline updates.</p> : null}
        {apiUnavailable ? <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">Safeguarding API unavailable.</p> : null}
        {errorMessage && !permissionDenied && !apiUnavailable ? <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{errorMessage}</p> : null}
        {validationErrors.length > 0 ? (
          <ul className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
            {validationErrors.map((item) => <li key={`${item.field}-${item.message}`}>{item.field}: {item.message}</li>)}
          </ul>
        ) : null}
        {successMessage ? <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">{successMessage}</p> : null}

        <section className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Recorded Timeline Events</h2>
          {timelineEvents.length === 0 ? (
            <p className="mt-2 rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs text-slate-300">No timeline events created in this session yet. Submit an update below.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {timelineEvents.map((event) => (
                <article key={event.id} className="rounded-lg border border-slate-700 bg-slate-900/70 p-3 text-xs text-slate-200">
                  <p className="font-semibold text-white">{event.action}</p>
                  <p className="text-slate-400">{new Date(event.timestamp).toLocaleString()} by {event.actor}</p>
                  <p className="mt-1">{event.note}</p>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-cyan-500/35 bg-cyan-500/10 p-4 text-xs text-cyan-100">
          <h2 className="text-sm font-semibold text-cyan-100">Audit Feed</h2>
          {auditFeed.length === 0 ? <p className="mt-2">No audit events yet.</p> : null}
          <ul className="mt-2 space-y-1">
            {auditFeed.map((entry) => (
              <li key={entry.id}>{new Date(entry.timestamp).toLocaleString()} | {entry.actor} | {entry.actionType} | {entry.notes}</li>
            ))}
          </ul>
        </section>

        <form onSubmit={onSubmit} className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Step 4: Add Timeline Updates</h2>
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            <label className="text-xs text-slate-300">
              Update type
              <select name="action" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white">
                <option value="Case note">Case note</option>
                <option value="Home contact">Home contact</option>
                <option value="Internal meeting">Internal meeting</option>
                <option value="Safeguarding review">Safeguarding review</option>
                <option value="Agency communication">Agency communication</option>
              </select>
            </label>
            <label className="text-xs text-slate-300">
              Event timestamp
              <input name="timestamp" type="datetime-local" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white" />
            </label>
          </div>

          <label className="mt-3 block text-xs text-slate-300">
            Timeline note
            <textarea name="note" required rows={4} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white" />
          </label>

          <div className="mt-3 flex flex-wrap gap-2">
            <button disabled={saving} type="submit" className="rounded-lg border border-sky-500/60 bg-sky-500/15 px-3 py-2 text-sm font-semibold text-sky-100 disabled:opacity-60">{saving ? "Saving..." : "Save Timeline Update"}</button>
            <Link href={`/admin/schools/${schoolId}/safeguarding/${incident.id}`} className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-200">Back to Incident</Link>
          </div>
        </form>
      </div>
    </SchoolDashboardShell>
  );
}
