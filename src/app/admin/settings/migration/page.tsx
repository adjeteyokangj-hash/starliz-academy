"use client";

import { useEffect, useState } from "react";

type MigrationCountRow = {
  total: number;
  created: number;
  updated: number;
  skipped: number;
};

type MigrationReport = {
  dryRun: boolean;
  summary: {
    parents: MigrationCountRow;
    children: MigrationCountRow;
    lessons: MigrationCountRow;
    contentLibrary: MigrationCountRow;
    assignments: MigrationCountRow;
  };
  warnings: string[];
  errors: Array<{ entity: string; reason: string; reference?: string }>;
};

type MigrationDump = {
  version: "starliz-migration-v1";
  exportedAt: string;
  source?: { environment?: string; note?: string };
  data: {
    parents: unknown[];
    lessons: unknown[];
    contentLibrary: unknown[];
    assignments: unknown[];
  };
};

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function MigrationPage() {
  const [migrationDumpText, setMigrationDumpText] = useState("");
  const [migrationReport, setMigrationReport] = useState<MigrationReport | null>(null);
  const [migrationStatus, setMigrationStatus] = useState<string | null>(null);
  const [migrationBusy, setMigrationBusy] = useState<"export" | "dry-run" | "apply" | null>(null);
  const [confirmApplyText, setConfirmApplyText] = useState("");
  const [confirmProductionHost, setConfirmProductionHost] = useState("");
  const [requiredProductionHost, setRequiredProductionHost] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/admin/migration/import");
        const payload = await response.json();
        if (response.ok) {
          setRequiredProductionHost(payload.requiredHost ?? null);
        }
      } catch {
        // ignore host hint fetch failures
      }
    })();
  }, []);

  async function exportMigrationDump() {
    setMigrationBusy("export");
    setMigrationStatus(null);
    setMigrationReport(null);
    try {
      const response = await fetch("/api/admin/migration/export");
      const payload = await response.json();
      if (!response.ok || !payload?.dump) {
        setMigrationStatus(payload.error ?? "Migration export failed.");
        return;
      }

      const dump = payload.dump as MigrationDump;
      setMigrationDumpText(JSON.stringify(dump, null, 2));
      downloadJson(`migration-${new Date().toISOString().slice(0, 10)}.json`, dump);
      setMigrationStatus("Migration dump exported and loaded into editor.");
    } catch {
      setMigrationStatus("Migration export failed.");
    } finally {
      setMigrationBusy(null);
    }
  }

  function parseDumpFromEditor(): MigrationDump | null {
    try {
      return JSON.parse(migrationDumpText) as MigrationDump;
    } catch {
      return null;
    }
  }

  async function runMigration(dryRun: boolean) {
    const dump = parseDumpFromEditor();
    if (!dump) {
      setMigrationStatus("Migration JSON is invalid.");
      return;
    }

    if (!dryRun) {
      if (confirmApplyText !== "YES_I_UNDERSTAND") {
        setMigrationStatus("Type YES_I_UNDERSTAND before applying to production.");
        return;
      }
      if (requiredProductionHost && confirmProductionHost.trim() !== requiredProductionHost) {
        setMigrationStatus(`Type production host exactly: ${requiredProductionHost}`);
        return;
      }
    }

    setMigrationBusy(dryRun ? "dry-run" : "apply");
    setMigrationStatus(null);
    try {
      const response = await fetch("/api/admin/migration/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dryRun,
          confirmProductionHost: dryRun ? undefined : confirmProductionHost.trim(),
          dump,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setMigrationStatus(payload.error ?? "Migration request failed.");
        return;
      }
      setMigrationReport(payload.report as MigrationReport);
      setMigrationStatus(dryRun ? "Dry-run complete." : "Migration applied.");
    } catch {
      setMigrationStatus("Migration request failed.");
    } finally {
      setMigrationBusy(null);
    }
  }

  async function loadDumpFromFile(file: File | null) {
    if (!file) return;
    const text = await file.text();
    setMigrationDumpText(text);
    setMigrationStatus(`Loaded dump file: ${file.name}`);
    setMigrationReport(null);
  }

  const applyDisabled =
    !migrationDumpText.trim()
    || migrationBusy !== null
    || confirmApplyText !== "YES_I_UNDERSTAND"
    || (requiredProductionHost ? confirmProductionHost.trim() !== requiredProductionHost : confirmProductionHost.trim().length === 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-16">
      <div>
        <p className="mb-1 text-xs font-black uppercase tracking-widest text-indigo-400">Platform control</p>
        <h1 className="text-2xl font-black text-white">Migration Console</h1>
        <p className="mt-1 text-sm text-slate-400">
          Controlled one-way migration for Parents, Lessons, Content Library, and Assignments.
        </p>
      </div>

      <div className="space-y-4 rounded-2xl border border-indigo-800/40 bg-indigo-950/15 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-indigo-300">Export</p>
            <p className="mt-1 text-xs text-slate-400">Generate migration JSON from current environment.</p>
          </div>
          <button
            type="button"
            onClick={() => void exportMigrationDump()}
            disabled={migrationBusy === "export"}
            className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-black text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            {migrationBusy === "export" ? "Exporting..." : "Export Migration JSON"}
          </button>
        </div>

        <div className="rounded-xl border border-slate-700/70 bg-slate-950/70 p-3">
          <label className="block text-xs font-bold uppercase tracking-widest text-slate-400">Load dump file</label>
          <input
            type="file"
            accept="application/json,.json"
            onChange={(event) => void loadDumpFromFile(event.target.files?.[0] ?? null)}
            className="mt-2 w-full text-xs text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-xs file:font-bold file:text-slate-200"
          />
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-widest text-slate-400">Migration JSON</label>
          <textarea
            value={migrationDumpText}
            onChange={(event) => setMigrationDumpText(event.target.value)}
            placeholder='Paste migration JSON here (version: "starliz-migration-v1")'
            className="mt-2 min-h-64 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 font-mono text-xs text-slate-200 placeholder:text-slate-600"
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-amber-700/40 bg-amber-950/20 p-3">
            <label className="block text-xs font-bold uppercase tracking-widest text-amber-300">Apply confirmation</label>
            <input
              value={confirmApplyText}
              onChange={(event) => setConfirmApplyText(event.target.value)}
              placeholder="Type YES_I_UNDERSTAND"
              className="mt-2 w-full rounded-xl border border-amber-700/50 bg-slate-950 px-3 py-2.5 text-xs text-amber-100 placeholder:text-amber-800"
            />
          </div>

          <div className="rounded-xl border border-rose-700/40 bg-rose-950/20 p-3">
            <label className="block text-xs font-bold uppercase tracking-widest text-rose-300">
              Confirm production database host
            </label>
            <input
              value={confirmProductionHost}
              onChange={(event) => setConfirmProductionHost(event.target.value)}
              placeholder={requiredProductionHost ?? "Production host"}
              className="mt-2 w-full rounded-xl border border-rose-700/50 bg-slate-950 px-3 py-2.5 text-xs text-rose-100 placeholder:text-rose-800"
            />
            {requiredProductionHost ? (
              <p className="mt-2 text-xs text-rose-200">Required host: {requiredProductionHost}</p>
            ) : (
              <p className="mt-2 text-xs text-rose-200">Host hint unavailable. Enter production host manually.</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void runMigration(true)}
            disabled={!migrationDumpText.trim() || migrationBusy !== null}
            className="rounded-xl border border-indigo-600 px-4 py-2.5 text-xs font-black text-indigo-200 hover:bg-indigo-900/30 disabled:opacity-50"
          >
            {migrationBusy === "dry-run" ? "Running Dry-Run..." : "Run Dry-Run"}
          </button>
          <button
            type="button"
            onClick={() => void runMigration(false)}
            disabled={applyDisabled}
            className="rounded-xl bg-red-600 px-4 py-2.5 text-xs font-black text-white hover:bg-red-500 disabled:opacity-50"
          >
            {migrationBusy === "apply" ? "Applying..." : "Apply Migration"}
          </button>
        </div>

        {migrationStatus ? (
          <p className="rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs font-semibold text-slate-300">{migrationStatus}</p>
        ) : null}

        {migrationReport ? (
          <div className="space-y-3 rounded-xl border border-slate-700 bg-slate-950/80 p-4">
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">
              Report {migrationReport.dryRun ? "(Dry-Run)" : "(Applied)"}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {Object.entries(migrationReport.summary).map(([key, value]) => (
                <div key={key} className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-300">
                  <p className="font-black capitalize text-white">{key}</p>
                  <p className="mt-1">Total: {value.total} | Created: {value.created} | Updated: {value.updated} | Skipped: {value.skipped}</p>
                </div>
              ))}
            </div>

            {migrationReport.warnings.length ? (
              <div>
                <p className="text-xs font-black text-amber-300">Warnings</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-amber-100">
                  {migrationReport.warnings.map((warning, index) => (
                    <li key={`${warning}-${index}`}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {migrationReport.errors.length ? (
              <div>
                <p className="text-xs font-black text-rose-300">Errors</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-rose-100">
                  {migrationReport.errors.map((error, index) => (
                    <li key={`${error.entity}-${error.reference ?? index}`}>
                      [{error.entity}] {error.reason}{error.reference ? ` (${error.reference})` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
