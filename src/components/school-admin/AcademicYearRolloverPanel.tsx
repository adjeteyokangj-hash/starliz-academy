"use client";

import { FormEvent, useEffect, useState } from "react";

type AcademicYearConfig = {
  id: string;
  schoolId: string;
  currentAcademicYear: string;
  nextAcademicYear: string;
  promotionDate: string;
  status: "waiting" | "ready" | "applied";
  appliedAt: string | null;
  updatedAt: string;
};

type PreviewRow = {
  schoolStudentId: string;
  childName: string;
  fromYearGroup: string | null;
  toYearGroup: string | null;
  action: string;
  holdBack: boolean;
};

export default function AcademicYearRolloverPanel() {
  const [config, setConfig] = useState<AcademicYearConfig | null>(null);
  const [currentAcademicYear, setCurrent] = useState("");
  const [nextAcademicYear, setNext] = useState("");
  const [promotionDate, setPromotionDate] = useState("");
  const [status, setStatus] = useState<"waiting" | "ready">("waiting");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<PreviewRow[] | null>(null);
  const [previewSummary, setPreviewSummary] = useState<{ promote: number; hold: number; skip: number } | null>(null);
  const [history, setHistory] = useState<Array<{
    id: string;
    childName: string;
    fromYearGroup: string | null;
    toYearGroup: string;
    reason: string;
    createdAt: string;
  }>>([]);

  async function load() {
    const [cfgRes, histRes] = await Promise.all([
      fetch("/api/school-admin/academic-year"),
      fetch("/api/school-admin/academic-year/history"),
    ]);
    const cfgData = await cfgRes.json().catch(() => ({}));
    const histData = await histRes.json().catch(() => ({}));
    if (cfgRes.ok && cfgData.config) {
      setConfig(cfgData.config);
      setCurrent(cfgData.config.currentAcademicYear);
      setNext(cfgData.config.nextAcademicYear);
      setPromotionDate(cfgData.config.promotionDate);
      setStatus(cfgData.config.status === "ready" ? "ready" : "waiting");
    }
    if (histRes.ok && Array.isArray(histData.changes)) {
      setHistory(histData.changes.slice(0, 20));
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, []);

  async function onSave(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/school-admin/academic-year", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          currentAcademicYear,
          nextAcademicYear,
          promotionDate,
          status,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error ?? "Unable to save academic year settings.");
        return;
      }
      setConfig(data.config);
      setMessage("Academic year settings saved.");
    } finally {
      setBusy(false);
    }
  }

  async function onPreview() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/school-admin/academic-year/preview", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error ?? "Unable to preview rollover.");
        return;
      }
      setPreviewRows(data.preview?.rows ?? []);
      setPreviewSummary({
        promote: data.preview?.promoteCount ?? 0,
        hold: data.preview?.holdCount ?? 0,
        skip: data.preview?.skipCount ?? 0,
      });
      setMessage("Preview ready. Review the list, then confirm promotion.");
    } finally {
      setBusy(false);
    }
  }

  async function onApply() {
    if (!window.confirm("Apply academic-year rollover for all eligible students? This updates official year groups.")) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/school-admin/academic-year/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error ?? "Unable to apply rollover.");
        return;
      }
      setMessage(
        `Rollover applied: ${data.result?.promoted ?? 0} promoted, ${data.result?.held ?? 0} held, ${data.result?.skipped ?? 0} skipped.`,
      );
      setPreviewRows(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 p-5">
      <p className="text-sm text-foreground/70">
        Official year groups are school-controlled. Students are not promoted from birthdays or mid-summer dates alone.
        Set status to Ready to schedule automatic apply on the promotion date, or leave Waiting and confirm manually
        (delay allowed). Preview before applying.
      </p>

      <form onSubmit={onSave} className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-foreground/60">Current academic year</span>
          <input
            className="w-full rounded-lg border border-border bg-background px-3 py-2"
            value={currentAcademicYear}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder="2025/26"
            required
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-foreground/60">Next academic year</span>
          <input
            className="w-full rounded-lg border border-border bg-background px-3 py-2"
            value={nextAcademicYear}
            onChange={(e) => setNext(e.target.value)}
            placeholder="2026/27"
            required
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-foreground/60">Promotion date</span>
          <input
            type="date"
            className="w-full rounded-lg border border-border bg-background px-3 py-2"
            value={promotionDate}
            onChange={(e) => setPromotionDate(e.target.value)}
            required
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-foreground/60">Status</span>
          <select
            className="w-full rounded-lg border border-border bg-background px-3 py-2"
            value={status}
            onChange={(e) => setStatus(e.target.value as "waiting" | "ready")}
          >
            <option value="waiting">Waiting</option>
            <option value="ready">Ready</option>
          </select>
        </label>
        <div className="sm:col-span-2 flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            Save settings
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onPreview()}
            className="rounded-xl border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            Preview promotion
          </button>
          <button
            type="button"
            disabled={busy || !previewRows}
            onClick={() => void onApply()}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            Confirm &amp; apply rollover
          </button>
        </div>
      </form>

      {config ? (
        <p className="text-xs text-foreground/55">
          Last updated {new Date(config.updatedAt).toLocaleString("en-GB")}
          {config.appliedAt ? ` · Applied ${new Date(config.appliedAt).toLocaleString("en-GB")}` : ""}
          {` · Cycle status: ${config.status}`}
        </p>
      ) : null}

      {message ? <p className="text-sm text-foreground/80">{message}</p> : null}

      {previewSummary ? (
        <p className="text-sm font-medium text-foreground">
          Preview: {previewSummary.promote} to promote, {previewSummary.hold} held back, {previewSummary.skip} skipped.
        </p>
      ) : null}

      {previewRows && previewRows.length > 0 ? (
        <div className="max-h-64 overflow-auto rounded-xl border border-border">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 text-foreground/60">
              <tr>
                <th className="px-3 py-2">Student</th>
                <th className="px-3 py-2">From</th>
                <th className="px-3 py-2">To</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row) => (
                <tr key={row.schoolStudentId} className="border-t border-border">
                  <td className="px-3 py-2">{row.childName}</td>
                  <td className="px-3 py-2">{row.fromYearGroup ?? "—"}</td>
                  <td className="px-3 py-2">{row.toYearGroup ?? "—"}</td>
                  <td className="px-3 py-2 capitalize">{row.action.replaceAll("_", " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {history.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold text-foreground">Recent year-change history</h3>
          <ul className="mt-2 space-y-1 text-xs text-foreground/70">
            {history.map((h) => (
              <li key={h.id}>
                {new Date(h.createdAt).toLocaleString("en-GB")} · {h.childName}: {h.fromYearGroup ?? "—"} → {h.toYearGroup} ({h.reason})
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}