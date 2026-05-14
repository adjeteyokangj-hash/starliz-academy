"use client";

import Link from "next/link";
import type { StudentAssignmentCandidate } from "./types";

type Props = {
  blocked: StudentAssignmentCandidate[];
  expanded: boolean;
  onToggleExpanded: () => void;
  onExport: () => void;
  contentTitle: string;
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
}: Props) {
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
        <h3 className="text-sm font-black text-white">Blocked Students ({blocked.length})</h3>
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
              {blocked.map((entry) => (
                <tr key={entry.student.id} className="border-b border-slate-900">
                  <td className="py-2">{entry.student.name} | {entry.student.yearGroup || "No year"}</td>
                  <td className="py-2">{entry.hardBlockReason || "Blocked"}</td>
                  <td className="py-2">Content cannot be assigned until hard safety checks pass.</td>
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
