"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";
import SafeguardingGovernanceBanners from "../../governance-banners";
import {
  fetchAuditFeed,
  fetchIncident,
  postEscalationUpdate,
  type AuditEvent,
  type IncidentRecord,
  type ValidationError,
  SafeguardingApiError,
} from "../../api-client";

export default function SchoolSafeguardingEscalationPage() {
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
      handleApiError(error, "Unexpected error while loading escalation data.");
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setSaving(true);
    setSuccessMessage(null);
    setErrorMessage(null);
    setValidationErrors([]);
    setPermissionDenied(false);
    setApiUnavailable(false);

    try {
      const envelope = await postEscalationUpdate(schoolId, incidentId, {
        escalationLevel: String(formData.get("escalationLevel") ?? "Internal DSL Review"),
        rationale: String(formData.get("rationale") ?? ""),
        actionPlan: String(formData.get("actionPlan") ?? ""),
        agencyReferralStatus: String(formData.get("agencyReferralStatus") ?? "Not Referred"),
        escalatedBy: String(formData.get("escalatedBy") ?? ""),
        nextReviewDate: String(formData.get("nextReviewDate") ?? "") || null,
        status: String(formData.get("status") ?? "Escalated"),
      });
      setIncident(envelope.data?.incident ?? null);
      const nextAudit = await fetchAuditFeed(schoolId, incidentId);
      setAuditFeed(nextAudit.data?.audit ?? []);
      setSuccessMessage("Escalation update saved successfully.");
    } catch (error) {
      handleApiError(error, "Unexpected error while saving escalation update.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <SchoolDashboardShell schoolId={schoolId} activeTab="safeguarding" title="Escalation Workflow" subtitle="Loading escalation workflow.">
        <p className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs text-slate-300">Loading escalation workflow...</p>
      </SchoolDashboardShell>
    );
  }

  if (!incident) {
    return (
      <SchoolDashboardShell schoolId={schoolId} activeTab="safeguarding" title="Escalation Workflow" subtitle="Incident not found.">
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
      title={`Escalation Workflow ${incident.id}`}
      subtitle="Escalate concerns, capture agency referral status, and set review checkpoints."
    >
      <div className="space-y-4">
        <SafeguardingGovernanceBanners />

        {saving ? <p className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs text-slate-300">Saving escalation update...</p> : null}
        {permissionDenied ? <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">Permission denied for escalation updates.</p> : null}
        {apiUnavailable ? <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">Safeguarding API unavailable.</p> : null}
        {errorMessage && !permissionDenied && !apiUnavailable ? <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{errorMessage}</p> : null}
        {validationErrors.length > 0 ? (
          <ul className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
            {validationErrors.map((item) => <li key={`${item.field}-${item.message}`}>{item.field}: {item.message}</li>)}
          </ul>
        ) : null}
        {successMessage ? <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">{successMessage}</p> : null}

        <section className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4 text-xs text-slate-200">
          <h2 className="text-sm font-semibold text-white">Current Incident Context</h2>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <p><span className="text-slate-400">Student:</span> {incident.student}</p>
            <p><span className="text-slate-400">Concern:</span> {incident.concernType}</p>
            <p><span className="text-slate-400">Current Status:</span> {incident.status}</p>
            <p><span className="text-slate-400">Current Risk:</span> {incident.riskLevel}</p>
          </div>
        </section>

        <form onSubmit={handleSubmit} className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Step 5 and 8: Escalation and Agency Referral</h2>
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            <label className="text-xs text-slate-300">
              Escalation level
              <select name="escalationLevel" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white">
                <option value="Internal DSL Review">Internal DSL Review</option>
                <option value="Head Teacher Review">Head Teacher Review</option>
                <option value="Trust Safeguarding Lead">Trust Safeguarding Lead</option>
                <option value="External Agency Referral">External Agency Referral</option>
                <option value="Emergency Services">Emergency Services</option>
              </select>
            </label>

            <label className="text-xs text-slate-300">
              Agency referral status
              <select name="agencyReferralStatus" defaultValue={incident.agencyReferralStatus} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white">
                <option value="Not Referred">Not Referred</option>
                <option value="Referral Drafted">Referral Drafted</option>
                <option value="Referred">Referred</option>
                <option value="Agency Response Received">Agency Response Received</option>
              </select>
            </label>

            <label className="text-xs text-slate-300">
              Escalated by
              <input name="escalatedBy" required className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white" />
            </label>

            <label className="text-xs text-slate-300">
              Next review date
              <input name="nextReviewDate" type="date" defaultValue={incident.nextReviewDate ?? ""} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white" />
            </label>

            <label className="text-xs text-slate-300">
              New status
              <select name="status" defaultValue="Escalated" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white">
                <option value="Escalated">Escalated</option>
                <option value="Referred">Referred</option>
              </select>
            </label>
          </div>

          <label className="mt-3 block text-xs text-slate-300">
            Escalation rationale
            <textarea name="rationale" required rows={4} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white" />
          </label>

          <label className="mt-3 block text-xs text-slate-300">
            Immediate safeguarding action plan
            <textarea name="actionPlan" required rows={4} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white" />
          </label>

          <div className="mt-3 flex flex-wrap gap-2">
            <button disabled={saving} type="submit" className="rounded-lg border border-amber-500/60 bg-amber-500/15 px-3 py-2 text-sm font-semibold text-amber-100 disabled:opacity-60">{saving ? "Saving..." : "Save Escalation Update"}</button>
            <Link href={`/admin/schools/${schoolId}/safeguarding/${incident.id}`} className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-200">Back to Incident</Link>
          </div>
        </form>

        <section className="rounded-xl border border-cyan-500/35 bg-cyan-500/10 p-4 text-xs text-cyan-100">
          <p className="font-semibold">Audit Feed</p>
          {auditFeed.length === 0 ? <p className="mt-1">No audit events yet.</p> : null}
          <ul className="mt-2 space-y-1">
            {auditFeed.map((entry) => (
              <li key={entry.id}>{new Date(entry.timestamp).toLocaleString()} | {entry.actor} | {entry.actionType} | {entry.notes}</li>
            ))}
          </ul>
        </section>
      </div>
    </SchoolDashboardShell>
  );
}
