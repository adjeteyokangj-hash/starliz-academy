"use client";

import Link from "next/link";
import type { StudentAssignmentCandidate } from "./types";

type Props = {
  blocked: StudentAssignmentCandidate[];
  expanded: boolean;
  onToggleExpanded: () => void;
  onExport: () => void;
  contentTitle: string;
  onOverrideAssign?: (studentId: string) => void;
  overrideAssigning?: boolean;
};

function escapeCsvField(field: string): string {
  if (field.includes(",") || field.includes('"') || field.includes("\n")) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

export default function BlockedStudentsTable({
  blocked,
  expanded,
  onToggleExpanded,
  onExport,
  contentTitle,
  onOverrideAssign,
  overrideAssigning,
}: Props) {
  const overrideEligible = blocked.filter((entry) => entry.overrideEligible);
  const hardBlocked = blocked.filter((entry) => !entry.overrideEligible);

  const handleExport = () => {
    const headers = ["Student", "Year Group", "Key Stage", "Reason", "Content"];
    const rows = blocked.map((entry) => [
      entry.student.name,
      entry.student.yearGroup || "Unknown",
      entry.student.keyStageLevel || "Unknown",
      entry.hardBlockReason || "Blocked",
      contentTitle,
    ]);

    const csv = [
      headers.map(escapeCsvField).join(","),
      ...rows.map((row) => row.map(escapeCsvField).join(",")),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `blocked-students-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onExport();
  };

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-black text-white">
          Blocked Students ({blocked.length})
          {overrideEligible.length > 0 && (
            <span className="ml-2 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-200">
              {overrideEligible.length} override-eligible
            </span>
          )}
        </h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onToggleExpanded}
            className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-black text-slate-200 hover:bg-slate-800"
          >
            {expanded ? "Hide blocked students" : "View blocked students"}
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-black text-slate-200 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={blocked.length === 0}
          >
            Export blocked list
          </button>
          <Link
            href="/admin/assignments"
            className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-black text-slate-200 hover:bg-slate-800"
          >
            Audit log
          </Link>
        </div>
      </div>

      {!expanded ? null : blocked.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">No blocked students.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          {overrideEligible.length > 0 && (
            <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
              <p className="text-xs font-black text-amber-200">
                Override-eligible students — year/key-stage/age mismatch only
              </p>
              <p className="mt-0.5 text-xs text-amber-300/70">
                Admin can assign reviewed/published content to these students despite curriculum mismatch. An override reason is required and stored in the audit log.
              </p>
            </div>
          )}
          <table className="w-full min-w-[520px] text-left text-xs text-slate-300">
            <thead>
              <tr className="border-b border-slate-800 text-slate-500">
                <th className="py-2">Student</th>
                <th className="py-2">Reason</th>
                <th className="py-2">Details</th>
                <th className="py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {overrideEligible.map((entry) => (
                <tr key={entry.student.id} className="border-b border-amber-900/30 bg-amber-900/10">
                  <td className="py-2">{entry.student.name} | {entry.student.yearGroup || "No year"}</td>
                  <td className="py-2 font-bold text-amber-300">{entry.overrideBlockReason || entry.hardBlockReason || "Mismatch"}</td>
                  <td className="py-2 text-amber-200/70">Override-eligible. Admin can assign with reason.</td>
                  <td className="py-2">
                    <div className="flex gap-1">
                      {onOverrideAssign ? (
                        <button
                          type="button"
                          disabled={overrideAssigning}
                          onClick={() => onOverrideAssign(entry.student.id)}
                          className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs font-bold text-amber-200 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {overrideAssigning ? "Assigning..." : "Override assign"}
                        </button>
                      ) : null}
                      <Link
                        href={`/admin/students/${entry.student.id}`}
                        className="rounded-lg border border-slate-700 px-2 py-1 text-xs font-bold text-slate-200 hover:bg-slate-800"
                      >
                        View student
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
              {hardBlocked.map((entry) => (
                <tr key={entry.student.id} className="border-b border-slate-900">
                  <td className="py-2">{entry.student.name} | {entry.student.yearGroup || "No year"}</td>
                  <td className="py-2 text-rose-300">{entry.hardBlockReason || "Blocked"}</td>
                  <td className="py-2 text-slate-400">
                    {entry.hardBlockReason === "Draft or unreviewed content"
                      ? "Requires review before assignment. Use the Review to assign button on the content card."
                      : "Content cannot be assigned until hard safety checks pass."}
                  </td>
                  <td className="py-2">
                    <Link
                      href={`/admin/students/${entry.student.id}`}
                      className="rounded-lg border border-slate-700 px-2 py-1 text-xs font-bold text-slate-200 hover:bg-slate-800"
                    >
                      View student
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
