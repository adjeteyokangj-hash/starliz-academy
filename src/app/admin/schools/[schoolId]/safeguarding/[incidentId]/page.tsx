"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";
import SafeguardingGovernanceBanners from "../governance-banners";
import {
  fetchAuditFeed,
  fetchIncident,
  patchIncident,
  type AuditEvent,
  type IncidentRecord,
  type ValidationError,
  SafeguardingApiError,
} from "../api-client";
import { SAFEGUARDING_STATUSES, SAFEGUARDING_RISK_LEVELS } from "../safeguarding-workflow-data";

const OWNER_OPTIONS = [
  "Head Teacher - A. Morgan",
  "DSL - R. Morgan",
  "Deputy DSL - K. James",
  "Safeguarding Officer - P. Dale",
];

const NEXT_STATUS_OPTIONS: Record<string, string[]> = {
  "New": ["Triage Required"],
  "Triage Required": ["Assigned"],
  "Assigned": ["Monitoring", "Escalated", "Referred"],
  "Monitoring": ["Resolved"],
  "Escalated": ["Resolved"],
  "Referred": ["Resolved"],
  "Resolved": ["Closed"],
  "Closed": [],
};

export default function SchoolSafeguardingIncidentPage() {
  const params = useParams<{ schoolId: string; incidentId: string }>();
  const schoolId = params.schoolId;
  const incidentId = params.incidentId;

  const [incident, setIncident] = useState<IncidentRecord | null>(null);
  const [auditFeed, setAuditFeed] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [apiUnavailable, setApiUnavailable] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);

  const nextStatuses = useMemo(() => NEXT_STATUS_OPTIONS[incident?.status ?? "Closed"] ?? [], [incident?.status]);

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
      handleApiError(error, "Unexpected error while loading safeguarding incident details.");
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

  async function savePatch(label: string, payload: Record<string, unknown>) {
    setSaving(true);
    setSuccessMessage(null);
    setErrorMessage(null);
    setValidationErrors([]);
    setPermissionDenied(false);
    setApiUnavailable(false);
    try {
      const envelope = await patchIncident(schoolId, incidentId, payload);
      setIncident(envelope.data?.incident ?? null);
      const nextAudit = await fetchAuditFeed(schoolId, incidentId);
      setAuditFeed(nextAudit.data?.audit ?? []);
      setSuccessMessage(`${label} saved successfully.`);
    } catch (error) {
      handleApiError(error, "Unexpected error while updating incident.");
    } finally {
      setSaving(false);
    }
  }

  function onTriageSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    void savePatch("Triage", {
      status: "Triage Required",
      riskLevel: String(formData.get("riskLevel") ?? incident?.riskLevel ?? "Low"),
      nextReviewDate: String(formData.get("nextReviewDate") ?? "") || null,
      chronologyNotes: String(formData.get("chronologyNotes") ?? ""),
      notes: "Triage updated from incident detail screen.",
    });
  }

  function onOwnerSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    void savePatch("Owner assignment", {
      status: "Assigned",
      assignedOwner: String(formData.get("assignedOwner") ?? ""),
      notes: "Owner assignment updated from incident detail screen.",
    });
  }

  function onActionsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    void savePatch("Actions taken", {
      immediateActionTaken: String(formData.get("immediateActionTaken") ?? ""),
      notes: "Actions taken updated.",
    });
  }

  function onContactsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    void savePatch("Parent/contact notes", {
      parentContactNotes: String(formData.get("parentContactNotes") ?? ""),
      parentContacted: formData.get("parentContacted") === "on",
      notes: "Parent/contact notes updated.",
    });
  }

  function onReferralSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    void savePatch("Agency referral status", {
      agencyReferralStatus: String(formData.get("agencyReferralStatus") ?? "Not Referred"),
      notes: "Agency referral status updated.",
    });
  }

  function onStatusSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    void savePatch("Incident status", {
      status: String(formData.get("status") ?? incident?.status ?? "New"),
      closureSummary: String(formData.get("closureSummary") ?? ""),
      notes: "Incident status updated.",
    });
  }

  if (loading) {
    return (
      <SchoolDashboardShell schoolId={schoolId} activeTab="safeguarding" title="Safeguarding Incident" subtitle="Loading incident details.">
        <p className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs text-slate-300">Loading safeguarding incident...</p>
      </SchoolDashboardShell>
    );
  }

  if (!incident) {
    return (
      <SchoolDashboardShell schoolId={schoolId} activeTab="safeguarding" title="Safeguarding Incident" subtitle="Incident not found in register.">
        <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">Incident not found.</p>
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
      title={`Safeguarding Incident ${incident.id}`}
      subtitle="Triage, ownership, actions, contacts, referrals, status transitions, and audit feed."
    >
      <div className="space-y-4">
        <SafeguardingGovernanceBanners />

        {saving ? <p className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs text-slate-300">Saving incident update...</p> : null}
        {permissionDenied ? <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">Permission denied for this safeguarding action.</p> : null}
        {apiUnavailable ? <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">Safeguarding API unavailable. Retry shortly.</p> : null}
        {errorMessage && !permissionDenied && !apiUnavailable ? <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{errorMessage}</p> : null}
        {validationErrors.length > 0 ? (
          <ul className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
            {validationErrors.map((item) => <li key={`${item.field}-${item.message}`}>{item.field}: {item.message}</li>)}
          </ul>
        ) : null}
        {successMessage ? <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">{successMessage}</p> : null}

        <section className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4 text-xs text-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">Incident Summary</h2>
            <button onClick={() => void loadAll()} type="button" className="rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs">Refresh</button>
          </div>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <p><span className="text-slate-400">Student:</span> {incident.student}</p>
            <p><span className="text-slate-400">Concern Type:</span> {incident.concernType}</p>
            <p><span className="text-slate-400">Risk Level:</span> {incident.riskLevel}</p>
            <p><span className="text-slate-400">Status:</span> {incident.status}</p>
            <p><span className="text-slate-400">Assigned Owner:</span> {incident.assignedOwner ?? "Unassigned"}</p>
            <p><span className="text-slate-400">Reported By:</span> {incident.reportedBy}</p>
            <p><span className="text-slate-400">Parent Contacted:</span> {incident.parentContacted ? "Yes" : "No"}</p>
            <p><span className="text-slate-400">Agency Referral:</span> {incident.agencyReferralStatus}</p>
          </div>
        </section>

        <form onSubmit={onTriageSubmit} className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h3 className="text-sm font-semibold text-white">Step 2: Triage Incident</h3>
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            <label className="text-xs text-slate-300">
              Confirm risk level
              <select name="riskLevel" defaultValue={incident.riskLevel} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white">
                {SAFEGUARDING_RISK_LEVELS.map((risk) => <option key={risk} value={risk}>{risk}</option>)}
              </select>
            </label>
            <label className="text-xs text-slate-300">
              Next review date
              <input name="nextReviewDate" type="date" defaultValue={incident.nextReviewDate ?? ""} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white" />
            </label>
          </div>
          <label className="mt-3 block text-xs text-slate-300">
            Triage notes
            <textarea name="chronologyNotes" rows={3} defaultValue={incident.chronologyNotes} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white" />
          </label>
          <button disabled={saving} type="submit" className="mt-3 rounded-lg border border-sky-500/60 bg-sky-500/15 px-3 py-2 text-sm font-semibold text-sky-100 disabled:opacity-60">Save Triage</button>
        </form>

        <form onSubmit={onOwnerSubmit} className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h3 className="text-sm font-semibold text-white">Step 3: Assign Owner</h3>
          <label className="mt-2 block text-xs text-slate-300">
            Assigned safeguarding owner
            <select name="assignedOwner" defaultValue={incident.assignedOwner ?? ""} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white">
              <option value="">Select owner</option>
              {OWNER_OPTIONS.map((owner) => <option key={owner} value={owner}>{owner}</option>)}
            </select>
          </label>
          <button disabled={saving} type="submit" className="mt-3 rounded-lg border border-sky-500/60 bg-sky-500/15 px-3 py-2 text-sm font-semibold text-sky-100 disabled:opacity-60">Save Owner</button>
        </form>

        <form onSubmit={onActionsSubmit} className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h3 className="text-sm font-semibold text-white">Step 6: Add Actions Taken</h3>
          <label className="mt-2 block text-xs text-slate-300">
            Actions taken log
            <textarea name="immediateActionTaken" rows={3} defaultValue={incident.immediateActionTaken} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white" />
          </label>
          <button disabled={saving} type="submit" className="mt-3 rounded-lg border border-sky-500/60 bg-sky-500/15 px-3 py-2 text-sm font-semibold text-sky-100 disabled:opacity-60">Save Actions</button>
        </form>

        <form onSubmit={onContactsSubmit} className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h3 className="text-sm font-semibold text-white">Step 7: Record Parent/Contact Notes</h3>
          <label className="mt-2 block text-xs text-slate-300">
            Parent/contact notes
            <textarea name="parentContactNotes" rows={3} defaultValue={incident.parentContactNotes} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white" />
          </label>
          <label className="mt-2 inline-flex items-center gap-2 text-xs text-slate-300">
            <input name="parentContacted" type="checkbox" defaultChecked={incident.parentContacted} className="h-4 w-4" />
            Parent contacted
          </label>
          <button disabled={saving} type="submit" className="mt-3 rounded-lg border border-sky-500/60 bg-sky-500/15 px-3 py-2 text-sm font-semibold text-sky-100 disabled:opacity-60">Save Contact Notes</button>
        </form>

        <form onSubmit={onReferralSubmit} className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h3 className="text-sm font-semibold text-white">Step 8: Record Agency Referral Status</h3>
          <label className="mt-2 block text-xs text-slate-300">
            Agency referral status
            <select name="agencyReferralStatus" defaultValue={incident.agencyReferralStatus} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white">
              <option value="Not Referred">Not Referred</option>
              <option value="Referral Drafted">Referral Drafted</option>
              <option value="Referred">Referred</option>
              <option value="Agency Response Received">Agency Response Received</option>
            </select>
          </label>
          <button disabled={saving} type="submit" className="mt-3 rounded-lg border border-sky-500/60 bg-sky-500/15 px-3 py-2 text-sm font-semibold text-sky-100 disabled:opacity-60">Save Referral Status</button>
        </form>

        <form onSubmit={onStatusSubmit} className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h3 className="text-sm font-semibold text-white">Step 9: Mark Resolved/Closed</h3>
          <label className="mt-2 block text-xs text-slate-300">
            Next status
            <select name="status" defaultValue={nextStatuses[0] ?? incident.status} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white">
              {nextStatuses.length === 0 ? <option value={incident.status}>{incident.status}</option> : nextStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
              {SAFEGUARDING_STATUSES.filter((status) => status === incident.status).map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
          <label className="mt-2 block text-xs text-slate-300">
            Closure summary
            <textarea name="closureSummary" rows={3} defaultValue={incident.closureSummary} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white" />
          </label>
          <button disabled={saving} type="submit" className="mt-3 rounded-lg border border-emerald-500/60 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-100 disabled:opacity-60">Save Status</button>
        </form>

        <section className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h3 className="text-sm font-semibold text-white">Step 4 and 5 Routes</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link href={`/admin/schools/${schoolId}/safeguarding/${incident.id}/timeline`} className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200">Open Timeline Updates</Link>
            <Link href={`/admin/schools/${schoolId}/safeguarding/${incident.id}/escalation`} className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-100">Open Escalation Workflow</Link>
          </div>
        </section>

        <section className="rounded-xl border border-cyan-500/35 bg-cyan-500/10 p-4 text-xs text-cyan-100">
          <p className="font-semibold">Audit Feed</p>
          {auditFeed.length === 0 ? <p className="mt-1">No audit events yet.</p> : null}
          <ul className="mt-2 space-y-1">
            {auditFeed.map((entry) => (
              <li key={entry.id} className="rounded border border-cyan-500/20 bg-slate-900/50 px-2 py-1">
                {new Date(entry.timestamp).toLocaleString()} | {entry.actor} | {entry.actionType} | {entry.previousStatus ?? "-"} to {entry.newStatus ?? "-"} | {entry.notes}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </SchoolDashboardShell>
  );
}
