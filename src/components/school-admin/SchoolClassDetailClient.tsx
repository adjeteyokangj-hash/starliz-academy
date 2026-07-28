"use client";

import CollapsibleCard from "@/components/school-admin/CollapsibleCard";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Props = { schoolId: string; schoolName: string; classId: string };

type Detail = {
  id: string;
  name: string;
  yearGroup: string | null;
  keyStage: string | null;
  academicYear: string | null;
  status: string;
  teacherId: string | null;
  teacher: { id: string; roleLabel: string; status: string; user: { name: string | null; email: string } } | null;
  studentCount: number;
  teacherCount: number;
  timetablePeriodCount: number;
  capacity: number | null;
  createdAt: string;
  updatedAt: string;
  students: Array<{
    id: string;
    status: string;
    joinedAt: string;
    child: { id: string; name: string; yearGroup: string | null };
    parents: Array<{ id: string; name: string | null; email: string }>;
  }>;
  timetable: Array<{
    id: string;
    dayLabel: string;
    subject: string;
    title: string;
    startsAt: string;
    endsAt: string;
    room: string | null;
    status: string;
    teacherName: string | null;
  }>;
};

type TeacherOption = { id: string; roleLabel: string; user: { name: string | null; email: string } };
type StudentOption = {
  id: string;
  child: { name: string; yearGroup: string | null };
  currentClassroom: { id: string; name: string } | null;
};
type AuditLog = { id: string; action: string; createdAt: string };
type ClassOption = { id: string; name: string };

export default function SchoolClassDetailClient({ schoolId, schoolName, classId }: Props) {
  const [item, setItem] = useState<Detail | null>(null);
  const [eligibleTeachers, setEligibleTeachers] = useState<TeacherOption[]>([]);
  const [assignableStudents, setAssignableStudents] = useState<StudentOption[]>([]);
  const [otherClasses, setOtherClasses] = useState<ClassOption[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [teacherDraft, setTeacherDraft] = useState("");
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [moveTargets, setMoveTargets] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; body: string; run: () => Promise<void> } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [detailRes, listRes] = await Promise.all([
        fetch(`/api/school/classrooms/${encodeURIComponent(classId)}?schoolId=${encodeURIComponent(schoolId)}`, {
          credentials: "include",
        }),
        fetch(`/api/school/classrooms?schoolId=${encodeURIComponent(schoolId)}&status=all`, {
          credentials: "include",
        }),
      ]);
      const detail = await detailRes.json() as {
        item?: Detail;
        eligibleTeachers?: TeacherOption[];
        assignableStudents?: StudentOption[];
        auditLogs?: AuditLog[];
        error?: string;
      };
      if (!detailRes.ok) throw new Error(detail.error ?? "Unable to load class.");
      const list = await listRes.json() as { classrooms?: ClassOption[]; error?: string };
      setItem(detail.item ?? null);
      setEligibleTeachers(detail.eligibleTeachers ?? []);
      setAssignableStudents(detail.assignableStudents ?? []);
      setAuditLogs(detail.auditLogs ?? []);
      setTeacherDraft(detail.item?.teacherId ?? "");
      setOtherClasses((list.classrooms ?? []).filter((c) => c.id !== classId).map((c) => ({ id: c.id, name: c.name })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load class.");
    } finally {
      setLoading(false);
    }
  }, [classId, schoolId]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  async function patch(body: Record<string, unknown>, success: string) {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/school/classrooms/${encodeURIComponent(classId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ schoolId, ...body }),
      });
      const payload = await res.json() as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? "Action failed.");
      setMessage(success);
      setConfirm(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
      setConfirm(null);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-10 text-sm text-foreground/50">Loading class…</div>;
  if (!item) {
    return (
      <div className="p-10">
        <p className="text-sm text-red-700">{error ?? "Class not found."}</p>
        <Link href="/school-admin/day-school/classes" className="mt-3 inline-block text-sm text-primary underline">Back to classes</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-6 lg:p-10">
      <nav className="mb-4 text-sm text-foreground/50">
        <Link href="/school-admin/day-school/classes" className="hover:text-foreground">Classes</Link>
        {" / "}
        <span className="font-medium text-foreground">{item.name}</span>
      </nav>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{item.name}</h1>
          <p className="mt-1 text-sm text-foreground/60">{schoolName}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/school-admin/day-school/classes/${classId}/edit`} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold">
            Edit
          </Link>
          {item.status === "archived" ? (
            <button type="button" disabled={saving} className="rounded-xl border border-border px-4 py-2 text-sm" onClick={() => void patch({ action: "reactivate" }, "Class reactivated.")}>
              Reactivate
            </button>
          ) : (
            <button
              type="button"
              disabled={saving}
              className="rounded-xl border border-border px-4 py-2 text-sm"
              onClick={() =>
                setConfirm({
                  title: `Archive ${item.name}?`,
                  body: `Archiving preserves students, timetable (${item.timetablePeriodCount} periods), lessons, attendance, and audit history. This does not hard-delete the class.`,
                  run: () => patch({ action: "archive" }, "Class archived."),
                })
              }
            >
              Archive
            </button>
          )}
        </div>
      </div>

      {message ? <div className="mb-4 rounded-xl border border-emerald-600/20 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{message}</div> : null}
      {error ? <div className="mb-4 rounded-xl border border-red-600/20 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div> : null}

      <CollapsibleCard title="Class summary" className="mb-6" bodyClassName="grid gap-3 p-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div><span className="text-foreground/55">Year group</span><div className="font-medium">{item.yearGroup ?? "—"}</div></div>
        <div><span className="text-foreground/55">Key stage</span><div className="font-medium">{item.keyStage ?? "—"}</div></div>
        <div><span className="text-foreground/55">Academic year</span><div className="font-medium">{item.academicYear ?? "—"}</div></div>
        <div><span className="text-foreground/55">Status</span><div className="font-medium capitalize">{item.status}</div></div>
        <div><span className="text-foreground/55">Capacity</span><div className="font-medium">Not supported</div></div>
        <div><span className="text-foreground/55">Students</span><div className="font-medium">{item.studentCount}</div></div>
        <div><span className="text-foreground/55">Teachers</span><div className="font-medium">{item.teacherCount}</div></div>
        <div><span className="text-foreground/55">Timetable periods</span><div className="font-medium">{item.timetablePeriodCount}</div></div>
        <div><span className="text-foreground/55">Updated</span><div className="font-medium">{new Date(item.updatedAt).toLocaleString()}</div></div>
      </CollapsibleCard>

      <div className="mb-6 flex flex-wrap gap-3 text-sm">
        <Link href="/school-admin/day-school/timetable" className="rounded-lg border border-border px-3 py-2 font-medium">View class timetable</Link>
        <Link href="/school-admin/day-school/lessons" className="rounded-lg border border-border px-3 py-2 font-medium">View class lessons</Link>
        <Link href="/school-admin/day-school/attendance" className="rounded-lg border border-border px-3 py-2 font-medium">View attendance</Link>
        <Link href="/school-admin/day-school/reports" className="rounded-lg border border-border px-3 py-2 font-medium">View reports</Link>
        <Link href="/school-admin/day-school/students" className="rounded-lg border border-border px-3 py-2 font-medium">Students list</Link>
      </div>

      <CollapsibleCard title="Teachers" className="mb-6" bodyClassName="p-5">
        <p className="mb-3 text-sm text-foreground/70">
          Primary: {item.teacher ? `${item.teacher.user.name ?? item.teacher.user.email} (${item.teacher.roleLabel}, ${item.teacher.status})` : "No teacher assigned"}
        </p>
        <p className="mb-3 text-xs text-foreground/50">Additional teachers are not supported by the current classroom model.</p>
        <div className="flex flex-wrap gap-2">
          <select value={teacherDraft} onChange={(e) => setTeacherDraft(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
            <option value="">Unassigned</option>
            {eligibleTeachers.map((t) => (
              <option key={t.id} value={t.id}>{t.user.name ?? t.user.email} · {t.roleLabel}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={saving}
            className="rounded-lg border border-border px-3 py-2 text-sm"
            onClick={() => {
              if (!teacherDraft) {
                setConfirm({
                  title: "Remove primary teacher?",
                  body: "Removing the primary teacher may affect timetable delivery for this class.",
                  run: () => patch({ action: "unassignTeacher" }, "Primary teacher removed."),
                });
                return;
              }
              void patch({ action: "assignTeacher", teacherId: teacherDraft }, "Primary teacher updated.");
            }}
          >
            {teacherDraft ? "Assign / change primary" : "Unassign primary"}
          </button>
        </div>
      </CollapsibleCard>

      <CollapsibleCard title="Students" count={item.studentCount} className="mb-6" bodyClassName="p-5">
        {item.students.length === 0 ? (
          <p className="mb-4 text-sm text-foreground/50">No students assigned</p>
        ) : (
          <ul className="mb-4 divide-y divide-border text-sm">
            {item.students.map((student) => (
              <li key={student.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <div className="font-medium">{student.child.name}</div>
                  <div className="text-xs text-foreground/55">
                    {student.child.yearGroup ?? "—"} · {student.status} · joined {new Date(student.joinedAt).toLocaleDateString()}
                    {student.parents.length > 0
                      ? ` · ${student.parents.map((p) => p.name ?? p.email).join(", ")}`
                      : ""}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <select
                    value={moveTargets[student.id] ?? ""}
                    onChange={(e) => setMoveTargets((prev) => ({ ...prev, [student.id]: e.target.value }))}
                    className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
                  >
                    <option value="">Move to…</option>
                    {otherClasses.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={saving || !moveTargets[student.id]}
                    className="rounded-lg border border-border px-2 py-1 text-xs"
                    onClick={() =>
                      void patch(
                        { action: "moveStudent", schoolStudentId: student.id, targetClassroomId: moveTargets[student.id] },
                        "Student moved.",
                      )
                    }
                  >
                    Move
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    className="rounded-lg border border-border px-2 py-1 text-xs"
                    onClick={() =>
                      void patch({ action: "removeStudent", schoolStudentId: student.id }, "Student removed from class (enrolment preserved).")
                    }
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <h3 className="mb-2 text-sm font-semibold">Assign students</h3>
        <p className="mb-2 text-xs text-foreground/50">
          Existing school students only. New enrolment stays on the Students page.
        </p>
        <div className="mb-3 max-h-48 overflow-y-auto rounded-lg border border-border p-2 text-sm">
          {assignableStudents.length === 0 ? (
            <p className="text-foreground/50">No other assignable students.</p>
          ) : (
            assignableStudents.map((student) => (
              <label key={student.id} className="flex items-center gap-2 py-1">
                <input
                  type="checkbox"
                  checked={selectedStudents.includes(student.id)}
                  onChange={(e) => {
                    setSelectedStudents((prev) =>
                      e.target.checked ? [...prev, student.id] : prev.filter((id) => id !== student.id),
                    );
                  }}
                />
                <span>
                  {student.child.name}
                  {student.currentClassroom ? ` (from ${student.currentClassroom.name})` : " (unassigned)"}
                </span>
              </label>
            ))
          )}
        </div>
        <button
          type="button"
          disabled={saving || selectedStudents.length === 0}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          onClick={() =>
            void patch({ action: "assignStudents", schoolStudentIds: selectedStudents }, "Students assigned.").then(() =>
              setSelectedStudents([]),
            )
          }
        >
          Assign selected
        </button>
      </CollapsibleCard>

      <CollapsibleCard title="Timetable" count={item.timetable.length} className="mb-6" bodyClassName="p-5">
        <div className="mb-3 flex justify-end">
          <Link href="/school-admin/day-school/timetable" className="text-sm text-primary underline">Open school timetable</Link>
        </div>
        {item.timetable.length === 0 ? (
          <p className="text-sm text-foreground/50">No periods for this class yet. Add periods from the school timetable.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {item.timetable.map((period) => (
              <li key={period.id} className="rounded-lg border border-border px-3 py-2">
                {period.dayLabel} · {period.subject} · {period.startsAt}–{period.endsAt}
                {period.room ? ` · ${period.room}` : ""} · {period.teacherName ?? "No teacher"} · {period.status}
              </li>
            ))}
          </ul>
        )}
      </CollapsibleCard>

      <CollapsibleCard title="Recent class events" count={auditLogs.length} bodyClassName="p-5">
        {auditLogs.length === 0 ? (
          <p className="text-sm text-foreground/50">No recent class-management events.</p>
        ) : (
          <ul className="space-y-2 text-xs text-foreground/70">
            {auditLogs.map((log) => (
              <li key={log.id} className="rounded-lg border border-border px-3 py-2">
                <div className="font-medium text-foreground">{log.action}</div>
                <div>{new Date(log.createdAt).toLocaleString()}</div>
              </li>
            ))}
          </ul>
        )}
      </CollapsibleCard>

      {confirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-xl">
            <h3 className="text-lg font-semibold">{confirm.title}</h3>
            <p className="mt-2 text-sm text-foreground/70">{confirm.body}</p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" className="rounded-xl border border-border px-4 py-2 text-sm" onClick={() => setConfirm(null)}>Cancel</button>
              <button type="button" disabled={saving} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground" onClick={() => void confirm.run()}>Confirm</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}