"use client"

import Image from "next/image"
import { ChangeEvent, FormEvent, useEffect, useState } from "react"
import AdminSectionCard from "@/components/admin/AdminSectionCard"
import Logo from "@/components/Logo"
import { defaultBranding, type BrandingSettingsPayload } from "@/lib/branding"

function readImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ""))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function AdminBrandingPage() {
  const [form, setForm] = useState<BrandingSettingsPayload>(defaultBranding)
  const [status, setStatus] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch("/api/admin/branding")
      .then(async (response) => {
        if (!response.ok) return null
        return response.json() as Promise<{ branding?: BrandingSettingsPayload }>
      })
      .then((payload) => {
        if (payload?.branding) setForm(payload.branding)
      })
      .catch(() => setStatus("Unable to load branding settings."))
  }, [])

  function setField(field: keyof BrandingSettingsPayload, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function onUpload(field: keyof Pick<BrandingSettingsPayload, "logoUrl" | "iconUrl" | "faviconUrl">, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith("image/")) {
      setStatus("Please upload an image file.")
      return
    }

    const dataUrl = await readImageFile(file)
    setField(field, dataUrl)
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setStatus(null)

    try {
      const response = await fetch("/api/admin/branding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const payload = await response.json().catch(() => null) as { error?: string; branding?: BrandingSettingsPayload } | null
      if (!response.ok) {
        setStatus(payload?.error ?? "Unable to save branding.")
        return
      }
      if (payload?.branding) setForm(payload.branding)
      setStatus("Branding saved.")
    } catch {
      setStatus("Unable to save branding.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-white">Branding</h1>
        <p className="mt-1 text-slate-400">Manage the public logo, favicon, site name and tagline.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <AdminSectionCard title="Brand Settings" eyebrow="Identity">
          <form onSubmit={onSubmit} className="space-y-5">
            <label className="block">
              <span className="text-sm font-bold text-slate-300">Site name</span>
              <input
                value={form.siteName}
                onChange={(event) => setField("siteName", event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white outline-none"
              />
            </label>

            <label className="block">
              <span className="text-sm font-bold text-slate-300">Tagline</span>
              <input
                value={form.tagline}
                onChange={(event) => setField("tagline", event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white outline-none"
              />
            </label>

            {(["logoUrl", "iconUrl", "faviconUrl"] as const).map((field) => (
              <div key={field} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <label className="block">
                  <span className="text-sm font-bold text-slate-300">
                    {field === "logoUrl" ? "Full logo" : field === "iconUrl" ? "Icon logo" : "Favicon"}
                  </span>
                  <input
                    value={form[field]}
                    onChange={(event) => setField(field, event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm text-white outline-none"
                  />
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => void onUpload(field, event)}
                  className="mt-3 block w-full text-sm text-slate-400 file:mr-4 file:rounded-xl file:border-0 file:bg-indigo-500 file:px-4 file:py-2 file:text-sm file:font-bold file:text-white hover:file:bg-indigo-400"
                />
              </div>
            ))}

            {status ? <p className="text-sm font-bold text-blue-200">{status}</p> : null}

            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-indigo-500 px-5 py-3 text-sm font-black text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save branding"}
            </button>
          </form>
        </AdminSectionCard>

        <AdminSectionCard title="Preview" eyebrow="Dark and light">
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-700 bg-slate-950 p-5">
              <p className="mb-4 text-xs font-bold uppercase text-slate-500">Dark navigation</p>
              <Logo variant="wordmark" size={34} />
              <p className="mt-3 text-sm text-slate-400">{form.tagline}</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="mb-4 text-xs font-bold uppercase text-slate-500">Light surface</p>
              <Logo variant="wordmark" size={34} textClassName="text-slate-900" />
              <p className="mt-3 text-sm text-slate-600">{form.tagline}</p>
            </div>

            <div className="rounded-2xl border border-slate-700 bg-slate-950 p-5">
              <p className="mb-4 text-xs font-bold uppercase text-slate-500">Current uploaded assets</p>
              <div className="flex flex-wrap items-center gap-5">
                <Image src={form.iconUrl} alt="Icon preview" width={56} height={56} unoptimized className="rounded-lg bg-slate-900 object-contain" />
                <Image src={form.logoUrl} alt="Logo preview" width={220} height={70} unoptimized className="object-contain" />
                <Image src={form.faviconUrl} alt="Favicon preview" width={32} height={32} unoptimized className="rounded bg-slate-900 object-contain" />
              </div>
            </div>
          </div>
        </AdminSectionCard>
      </div>
    </div>
  )
}
