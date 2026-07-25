"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useParams } from "next/navigation";
import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";
import { SAFEGUARDING_RISK_LEVELS, SAFEGUARDING_STATUSES } from "../safeguarding-workflow-data";
import SafeguardingGovernanceBanners from "../governance-banners";
import { createIncident, SafeguardingApiError, type ValidationError } from "../api-client";

const STUDENT_OPTIONS = ["A. Robinson", "L. Khan", "M. Stewart", "N. Ahmed"];
const OWNER_OPTIONS = [
  "Head Teacher - A. Morgan",
  "DSL - R. Morgan",
  "Deputy DSL - K. James",
  "Safeguarding Officer - P. Dale",
];

export default function SchoolSafeguardingNewPage() {
  const params = useParams<{ schoolId: string }>();
  const schoolId = params.schoolId;
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [apiUnavailable, setApiUnavailable] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = {
      student: String(formData.get("student") ?? ""),
      concernType: String(formData.get("concernType") ?? ""),
      riskLevel: String(formData.get("riskLevel") ?? "Low"),
      reportedBy: String(formData.get("reportedBy") ?? ""),
      reportedAt: new Date(String(formData.get("reportedAt") ?? "")).toISOString(),
      concernSummary: String(formData.get("concernSummary") ?? ""),
      immediateActionTaken: String(formData.get("immediateActionTaken") ?? ""),
      assignedOwner: String(formData.get("assignedOwner") ?? ""),
      status: String(formData.get("status") ?? "New"),
      nextReviewDate: String(formData.get("nextReviewDate") ?? ""),
      parentContacted: formData.get("parentContacted") === "on",
      externalAgencyInvolved: formData.get("externalAgencyInvolved") === "on",
      chronologyNotes: String(formData.get("chronologyNotes") ?? ""),
      closureSummary: String(formData.get("closureSummary") ?? ""),
      parentContactNotes: String(formData.get("parentContactNotes") ?? ""),
      agencyReferralStatus: String(formData.get("agencyReferralStatus") ?? "Not Referred"),
    };

    setSaving(true);
    setSuccessMessage(null);
    setErrorMessage(null);
    setPermissionDenied(false);
    setApiUnavailable(false);
    setValidationErrors([]);

    try {
      const response = await createIncident(schoolId, payload);
      setSuccessMessage(`Incident ${response.data?.incident.id ?? ""} created successfully.`);
      event.currentTarget.reset();
    } catch (error) {
      if (error instanceof SafeguardingApiError) {
        if (error.code === "FORBIDDEN") setPermissionDenied(true);
        if (error.code === "API_UNAVAILABLE") setApiUnavailable(true);
        setValidationErrors(error.validationErrors);
        setErrorMessage(error.message);
      } else {
        setApiUnavailable(true);
        setErrorMessage("Unexpected error while creating safeguarding incident.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <SchoolDashboardShell
      schoolId={schoolId}
      activeTab="safeguarding"
      title="Create Safeguarding Incident"
      subtitle="Capture concern details, risk level, ownership, chronology, and review actions."
    >
      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
        <SafeguardingGovernanceBanners />

        {saving ? <p className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs text-slate-300">Saving incident...</p> : null}
        {permissionDenied ? <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">Permission denied. You are not authorised to create safeguarding incidents.</p> : null}
        {apiUnavailable ? <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">Safeguarding API unavailable. Please retry shortly.</p> : null}
        {errorMessage && !permissionDenied && !apiUnavailable ? <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{errorMessage}</p> : null}
        {validationErrors.length > 0 ? (
          <ul className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
            {validationErrors.map((item) => <li key={`${item.field}-${item.message}`}>{item.field}: {item.message}</li>)}
          </ul>
        ) : null}
        {successMessage ? <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">{successMessage}</p> : null}

        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-xs text-slate-300">
            Student
            <select required name="student" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white">
              <option value="">Select student</option>
              {STUDENT_OPTIONS.map((student) => <option key={student} value={student}>{student}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-300">
            Concern type
            <input required name="concernType" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white" />
          </label>
          <label className="text-xs text-slate-300">
            Risk level
            <select required name="riskLevel" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white">
              {SAFEGUARDING_RISK_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-300">
            Reported by
            <input required name="reportedBy" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white" />
          </label>
          <label className="text-xs text-slate-300">
            Date/time reported
            <input required type="datetime-local" name="reportedAt" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white" />
          </label>
          <label className="text-xs text-slate-300">
            Assigned DSL/owner
            <select required name="assignedOwner" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white">
              <option value="">Select owner</option>
              {OWNER_OPTIONS.map((owner) => <option key={owner} value={owner}>{owner}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-300">
            Status
            <select required defaultValue="New" name="status" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white">
              {SAFEGUARDING_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-300">
            Next review date
            <input required type="date" name="nextReviewDate" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white" />
          </label>
          <label className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs text-slate-200">
            <input type="checkbox" name="parentContacted" className="h-4 w-4" />
            Parent contacted
          </label>
          <label className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs text-slate-200">
            <input type="checkbox" name="externalAgencyInvolved" className="h-4 w-4" />
            External agency involved
          </label>
        </div>

        <label className="text-xs text-slate-300">
          Concern summary
          <textarea required name="concernSummary" rows={3} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white" />
        </label>

        <label className="text-xs text-slate-300">
          Immediate action taken
          <textarea required name="immediateActionTaken" rows={3} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white" />
        </label>

        <label className="text-xs text-slate-300">
          Chronology notes
          <textarea required name="chronologyNotes" rows={3} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white" />
        </label>

        <label className="text-xs text-slate-300">
          Parent/contact notes
          <textarea name="parentContactNotes" rows={3} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white" />
        </label>

        <label className="text-xs text-slate-300">
          Agency referral status
          <select name="agencyReferralStatus" defaultValue="Not Referred" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white">
            <option value="Not Referred">Not Referred</option>
            <option value="Referral Drafted">Referral Drafted</option>
            <option value="Referred">Referred</option>
            <option value="Agency Response Received">Agency Response Received</option>
          </select>
        </label>

        <label className="text-xs text-slate-300">
          Closure summary
          <textarea name="closureSummary" rows={3} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white" />
        </label>

        <p className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">Audit trail wording: every safeguarding update must record who changed it, when, and why.</p>

        <div className="flex flex-wrap gap-2">
          <button disabled={saving} type="submit" className="rounded-lg border border-sky-500/60 bg-sky-500/15 px-3 py-2 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60">{saving ? "Creating..." : "Create Incident"}</button>
          <Link href={`/admin/schools/${schoolId}/safeguarding`} className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white">Cancel</Link>
        </div>
      </form>
    </SchoolDashboardShell>
  );
}
