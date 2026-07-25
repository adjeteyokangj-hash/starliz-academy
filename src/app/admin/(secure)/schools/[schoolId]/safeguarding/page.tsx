"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";
import SafeguardingGovernanceBanners from "./governance-banners";
import { fetchIncidents, type IncidentRecord, SafeguardingApiError } from "./api-client";

function statusBadgeClass(status: string) {
  if (status === "Critical" || status === "Escalated") return "border-rose-500/40 bg-rose-500/10 text-rose-100";
  if (status === "Referred" || status === "Triage Required") return "border-amber-500/40 bg-amber-500/10 text-amber-100";
  if (status === "Resolved" || status === "Closed") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-100";
  return "border-sky-500/40 bg-sky-500/10 text-sky-100";
}

export default function SchoolSafeguardingPage() {
  const params = useParams<{ schoolId: string }>();
  const schoolId = params.schoolId;
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [apiUnavailable, setApiUnavailable] = useState(false);

  const loadIncidents = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    setPermissionDenied(false);
    setApiUnavailable(false);
    try {
      const envelope = await fetchIncidents(schoolId);
      setIncidents(envelope.data?.incidents ?? []);
      setInfoMessage("Incident register loaded from safeguarding API.");
    } catch (error) {
      if (error instanceof SafeguardingApiError) {
        if (error.code === "FORBIDDEN") {
          setPermissionDenied(true);
        } else if (error.code === "API_UNAVAILABLE") {
          setApiUnavailable(true);
        }
        setErrorMessage(error.message);
      } else {
        setApiUnavailable(true);
        setErrorMessage("Unexpected error while loading safeguarding incidents.");
      }
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadIncidents();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadIncidents]);

  return (
    <SchoolDashboardShell
      schoolId={schoolId}
      activeTab="safeguarding"
      title="Safeguarding Case Register"
      subtitle="Safeguarding incidents, case register, overrides, and emergency pathways."
    >
      <div className="space-y-4">
        <SafeguardingGovernanceBanners />

        <section className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">Safeguarding Workflow</h2>
            <div className="flex gap-2">
              <button onClick={() => void loadIncidents()} type="button" className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white">Refresh</button>
              <Link href={`/admin/schools/${schoolId}/safeguarding/new`} className="rounded-lg border border-sky-500/60 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-100 transition hover:bg-sky-500/20">Create Incident</Link>
            </div>
          </div>
          <ol className="mt-2 grid gap-1 text-xs text-slate-300 md:grid-cols-2">
            <li>1. Create incident</li>
            <li>2. Triage incident</li>
            <li>3. Assign owner</li>
            <li>4. Add timeline updates</li>
            <li>5. Escalate incident</li>
            <li>6. Add actions taken</li>
            <li>7. Record parent/contact notes</li>
            <li>8. Record agency referral status</li>
            <li>9. Mark resolved/closed</li>
            <li>10. Preserve audit trail wording</li>
          </ol>
        </section>

        {loading ? <p className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs text-slate-300">Loading safeguarding incidents...</p> : null}
        {permissionDenied ? <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">Permission denied. Only authorised safeguarding leadership can access this register.</p> : null}
        {apiUnavailable ? <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">Safeguarding API unavailable. Please retry shortly.</p> : null}
        {errorMessage && !permissionDenied && !apiUnavailable ? <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{errorMessage}</p> : null}
        {infoMessage && !loading ? <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">{infoMessage}</p> : null}

        <section className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Incident Register</h2>
          {!loading && incidents.length === 0 ? (
            <p className="mt-3 rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs text-slate-300">No incidents found. Create the first safeguarding incident to begin workflow tracking.</p>
          ) : null}
          {incidents.length > 0 ? (
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-left text-xs text-slate-200">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-400">
                    <th className="px-2 py-2">Incident</th>
                    <th className="px-2 py-2">Student</th>
                    <th className="px-2 py-2">Concern Type</th>
                    <th className="px-2 py-2">Risk</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Owner</th>
                    <th className="px-2 py-2">SLA</th>
                    <th className="px-2 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {incidents.map((incident) => (
                    <tr key={incident.id} className="border-b border-slate-800/70">
                      <td className="px-2 py-2 font-semibold text-white">{incident.id}</td>
                      <td className="px-2 py-2">{incident.student}</td>
                      <td className="px-2 py-2">{incident.concernType}</td>
                      <td className="px-2 py-2">
                        <span className={`inline-flex rounded-full border px-2 py-1 ${statusBadgeClass(incident.riskLevel)}`}>{incident.riskLevel}</span>
                      </td>
                      <td className="px-2 py-2">
                        <span className={`inline-flex rounded-full border px-2 py-1 ${statusBadgeClass(incident.status)}`}>{incident.status}</span>
                      </td>
                      <td className="px-2 py-2">{incident.assignedOwner ?? "Unassigned"}</td>
                      <td className="px-2 py-2 text-[11px] text-slate-300">
                        {incident.sla.overdueTriage ? "Triage overdue" : null}
                        {incident.sla.overdueReview ? "Review overdue" : null}
                        {!incident.sla.overdueTriage && !incident.sla.overdueReview ? "Within SLA" : null}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap gap-1">
                          <Link href={`/admin/schools/${schoolId}/safeguarding/${incident.id}`} className="rounded border border-slate-600 bg-slate-900 px-2 py-1">Open</Link>
                          <Link href={`/admin/schools/${schoolId}/safeguarding/${incident.id}/timeline`} className="rounded border border-slate-600 bg-slate-900 px-2 py-1">Timeline</Link>
                          <Link href={`/admin/schools/${schoolId}/safeguarding/${incident.id}/escalation`} className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-amber-100">Escalation</Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </div>
    </SchoolDashboardShell>
  );
}
