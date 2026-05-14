"use client";

import type { AssignMode, ContentItem, StudentAssignmentCandidate } from "./types";
import { getContentJsonSummary, getContentMeta } from "./utils";
import StudentAssignmentColumn from "./StudentAssignmentColumn";
import BlockedStudentsTable from "./BlockedStudentsTable";

type Props = {
  selectedContent: ContentItem | null;
  recommended: StudentAssignmentCandidate[];
  eligibleManual: StudentAssignmentCandidate[];
  blocked: StudentAssignmentCandidate[];
  selectedStudentId: string | null;
  assigning: boolean;
  showBlocked: boolean;
  onToggleBlocked: () => void;
  onSelectStudent: (studentId: string) => void;
  onAssignSelected: () => void;
  onAssignByMode: (mode: AssignMode) => void;
};

export default function AssignmentPanel(props: Props) {
  if (!props.selectedContent) {
    return (
      <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5 text-sm text-slate-400">
        No selected content. Select a card and click Assign.
      </section>
    );
  }

  const meta = getContentMeta(props.selectedContent);
  const summary = getContentJsonSummary(props.selectedContent.contentJson);
  const hasEligibleStudents = props.recommended.length > 0 || props.eligibleManual.length > 0;

  return (
    <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
      <div>
        <h3 className="text-lg font-black text-white">Assign Content</h3>
        <p className="mt-1 text-xs text-slate-400">{meta.title} | {meta.yearGroup || "All years"} | {meta.keyStage || "All key stages"} | {meta.subject} | Difficulty {props.selectedContent.level} | {summary.itemCount} item(s)</p>
      </div>

      {!hasEligibleStudents ? (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-black text-amber-200">
          No eligible students for this content.
        </p>
      ) : null}

      <div className="grid gap-3 xl:grid-cols-4">
        <StudentAssignmentColumn
          title="Recommended"
          tone="recommended"
          candidates={props.recommended}
          selectedStudentId={props.selectedStudentId}
          onSelectStudent={props.onSelectStudent}
          disabled={props.assigning}
        />
        <StudentAssignmentColumn
          title="Eligible Manual"
          tone="eligible"
          candidates={props.eligibleManual}
          selectedStudentId={props.selectedStudentId}
          onSelectStudent={props.onSelectStudent}
          disabled={props.assigning}
        />
        <StudentAssignmentColumn
          title="Blocked"
          tone="blocked"
          candidates={props.blocked}
          selectedStudentId={props.selectedStudentId}
          onSelectStudent={props.onSelectStudent}
          disabled
        />

        <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-3">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-300">Quick actions</p>
          <div className="mt-3 space-y-2">
            <button
              type="button"
              onClick={() => props.onAssignByMode("recommended")}
              disabled={props.assigning || props.recommended.length === 0}
              className="w-full rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-black text-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {props.recommended.length === 0 ? "No recommended students" : `Smart assign (${props.recommended.length})`}
            </button>
            <button
              type="button"
              onClick={() => props.onAssignByMode("eligible_manual")}
              disabled={props.assigning || (props.recommended.length + props.eligibleManual.length) === 0}
              className="w-full rounded-xl border border-indigo-500/40 bg-indigo-500/10 px-3 py-2 text-xs font-black text-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Assign all eligible ({props.recommended.length + props.eligibleManual.length})
            </button>
            <button
              type="button"
              onClick={props.onAssignSelected}
              disabled={props.assigning || !props.selectedStudentId}
              className="w-full rounded-xl bg-indigo-500 px-3 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              Assign selected student
            </button>
          </div>
        </div>
      </div>

      <BlockedStudentsTable blocked={props.blocked} expanded={props.showBlocked} onToggleExpanded={props.onToggleBlocked} />

      <div className="grid gap-2 text-xs text-slate-400 md:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <p className="font-bold text-slate-200">Eligibility rules</p>
          <p>Status, key stage, year group, strict age, tenant school and duplicate checks.</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <p className="font-bold text-slate-200">Recommendation rules</p>
          <p>Weak areas, subject focus, difficulty and prior performance guidance only.</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <p className="font-bold text-slate-200">Assignment audit log</p>
          <p>All assignment activity is stored and reviewable in audit logs.</p>
        </div>
      </div>
    </section>
  );
}
