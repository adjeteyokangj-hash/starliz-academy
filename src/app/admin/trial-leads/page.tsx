"use client"

import { useEffect, useState } from "react"

type TrialLead = {
  id: string
  email: string
  activitiesRemaining: number
  trialStartedAt: string
  trialExpiresAt: string
  lastActiveAt: string
  convertedToAccount: boolean
  emailConsent: boolean
}

function formatDate(value: string) {
  return new Date(value).toLocaleString()
}

export default function AdminTrialLeadsPage() {
  const [leads, setLeads] = useState<TrialLead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/admin/trial-leads", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) {
          window.location.replace("/admin/login?next=/admin/trial-leads")
          return null
        }
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null
          throw new Error(payload?.error ?? `Unable to load trial leads (${response.status}).`)
        }
        return response.json() as Promise<{ leads: TrialLead[] }>
      })
      .then((payload) => {
        if (payload?.leads) {
          setLeads(payload.leads)
        }
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : "Unable to load trial leads.")
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-700/70 bg-slate-900/60 p-6">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">Trial Funnel</p>
        <h1 className="mt-2 text-3xl font-black text-white">Trial Leads</h1>
        <p className="mt-3 text-sm text-slate-300">
          Read-only visibility for trial emails and conversion readiness.
        </p>
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-4 sm:p-6">
        {loading ? <p className="text-sm text-slate-300">Loading trial leads...</p> : null}
        {error ? <p className="text-sm font-semibold text-rose-300">{error}</p> : null}

        {!loading && !error ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-widest text-slate-400">
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Activities Remaining</th>
                  <th className="px-3 py-2">Trial Started</th>
                  <th className="px-3 py-2">Trial Expires</th>
                  <th className="px-3 py-2">Last Active</th>
                  <th className="px-3 py-2">Converted</th>
                  <th className="px-3 py-2">Email Consent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {leads.map((lead) => (
                  <tr key={lead.id} className="text-slate-200">
                    <td className="px-3 py-2 font-medium text-white">{lead.email}</td>
                    <td className="px-3 py-2">{lead.activitiesRemaining}</td>
                    <td className="px-3 py-2">{formatDate(lead.trialStartedAt)}</td>
                    <td className="px-3 py-2">{formatDate(lead.trialExpiresAt)}</td>
                    <td className="px-3 py-2">{formatDate(lead.lastActiveAt)}</td>
                    <td className="px-3 py-2">{lead.convertedToAccount ? "Yes" : "No"}</td>
                    <td className="px-3 py-2">{lead.emailConsent ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  )
}
