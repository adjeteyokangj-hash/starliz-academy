"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import AdminSectionCard from "@/components/admin/AdminSectionCard";
import AdminStatCard from "@/components/admin/AdminStatCard";

type StudentDetail = {
  id: string;
  name: string;
  age: number | null;
  yearGroup: string | null;
  level: number;
  selectedVoice: string;
  studentProfile: {
    dateOfBirth: string | null;
    keyStageLevel: string | null;
    learningLevel: string | null;
    senSupportNeeds: string | null;
    readingLevel: string | null;
    weakAreasText: string | null;
    voiceProfile: string | null;
    curriculumPathway?: string | null;
    examBoard?: string | null;
    gcseSubjects?: string[];
    targetGrades?: Record<string, string>;
    guardianPermissions: string | null;
    schoolInformation: string | null;
    subjectFocus: string | null;
  } | null;
  stars: number;
  xp: number;
  coins: number;
  streak: number;
  accuracy: number | null;
  totalSessions: number;
  recommendedNextActivity: string;
  adaptiveTutor?: {
    enoughHistory?: boolean;
    readinessLabel?: string;
    fallbackMessage?: string | null;
    totalAttempts?: number;
    confidenceTrend?: number;
    frustrationRisk?: number;
    updatedAt?: string;
  };
  recentLevelDecisions: { ts: string; subject: string; previousLevel: number; nextLevel: number; confidenceScore: number; reasons: string[] }[];
  walletSummary: {
    balance: number;
    totalEarned: number;
    totalSpent: number;
    recentActivity: { id: string; type: string; amount: number; source: string; reason: string | null; itemId: string | null; balanceBefore: number; balanceAfter: number; createdAt: string; metadata: { itemName?: string; activityName?: string; category?: string; failureCode?: string } | null }[];
    earnedBySource: { source: string; amount: number }[];
    spentByItem: { itemId: string; amount: number; count: number; itemName: string | null }[];
  };
  ownedItems: { id: string; name: string; category: string; equipped: boolean; purchasedAt: string }[];
  walletTransactions: { id: string; type: string; amount: number; source: string; itemId: string | null; reason: string | null; balanceBefore: number; balanceAfter: number; createdAt: string; metadata: { itemName?: string; activityName?: string; category?: string; failureCode?: string } | null }[];
  parent: { id: string; name: string | null; email: string };
  progressRecords: { id: string; activityType: string; activityName: string; correct: boolean | null; accuracy: number | null; completed: boolean; createdAt: string }[];
  attempts: { id: string; subject: string; spellingMode?: string | null; skillFocus: string; correct: boolean; responseTimeMs: number; hintsUsed: number; difficulty: number; createdAt: string }[];
  modeStruggles: { mode: string; accuracy: number; total: number }[];
  weakAreas: { id: string; subject: string; keyStage: string | null; yearGroup: string | null; skillFocus: string; weaknessType: string; accuracy: number; attemptsCount: number; currentDifficulty: number; status: string; lastDetectedAt: string; interventionLaunchedAt: string | null; interventionCompletedAt: string | null; interventionImprovementPct: number | null }[];
};

export default function StudentDetailPage() {
  const params = useParams<{ id: string }>();
  const showDevAttemptSeeding = process.env.NODE_ENV !== "production";
  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [seedMessage, setSeedMessage] = useState<string | null>(null);
  const [auditFilter, setAuditFilter] = useState<"all" | "earn" | "spend" | "failed" | "equip">("all");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [adjustMessage, setAdjustMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function loadStudent() {
    fetch(`/api/admin/students/${params.id}`)
      .then((r) => r.ok ? r.json() : null)
      .then((payload) => { if (payload) setStudent(payload.student ?? null); });
  }

  useEffect(() => {
    void loadStudent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function seedAttempts(mode: "low" | "high") {
    const response = await fetch(`/api/admin/students/${params.id}/attempts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, skillFocus: "Silent e" }),
    });
    const payload = await response.json();
    setSeedMessage(response.ok ? payload.message : payload.error ?? "Could not seed attempts.");
    await loadStudent();
  }

  async function submitWalletAdjustment() {
    const parsed = parseInt(adjustAmount, 10);
    if (Number.isNaN(parsed) || parsed === 0) {
      setAdjustMessage({ ok: false, text: "Enter a non-zero integer amount (e.g. 10 or -5)." });
      return;
    }
    if (!adjustReason.trim()) {
      setAdjustMessage({ ok: false, text: "Reason is required." });
      return;
    }
    setAdjusting(true);
    setAdjustMessage(null);
    const response = await fetch("/api/admin/wallet/adjust", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ childId: params.id, amount: parsed, reason: adjustReason.trim() }),
    });
    const payload = await response.json();
    setAdjusting(false);
    if (!response.ok) {
      setAdjustMessage({ ok: false, text: payload.error ?? "Adjustment failed." });
      return;
    }
    setAdjustMessage({ ok: true, text: `Done — new balance: ${payload.newBalance} coins.` });
    setAdjustAmount("");
    setAdjustReason("");
    await loadStudent();
  }

  if (!student) {
    return <AdminSectionCard title="Student Profile"><p className="text-sm text-slate-400">Loading student...</p></AdminSectionCard>;
  }

  const filteredWalletTransactions = student.walletTransactions.filter((entry) => auditFilter === "all" ? true : entry.type === auditFilter);

  return (
    <div className="space-y-6">
      <AdminSectionCard
        title={student.name}
        eyebrow="Student profile"
        action={<Link href={`/admin/students/${student.id}/edit`} className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-bold text-white">Edit Student</Link>}
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <AdminStatCard title="Accuracy" value={student.accuracy !== null ? `${student.accuracy}%` : "No data"} icon="%" tone="amber" />
          <AdminStatCard title="Level" value={student.level} icon="L" tone="blue" />
          <AdminStatCard title="AI Difficulty" value={student.weakAreas[0]?.currentDifficulty ?? student.level} icon="D" tone="rose" />
          <AdminStatCard title="Stars" value={student.stars} icon="S" tone="purple" />
          <AdminStatCard title="Sessions" value={student.totalSessions} icon="A" tone="green" />
        </div>
      </AdminSectionCard>

      <div className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <AdminSectionCard title="Linked Parent">
          <p className="font-black text-white">{student.parent.name ?? "Parent"}</p>
          <p className="mt-1 text-sm text-slate-400">{student.parent.email}</p>
          <Link href={`/admin/parents/${student.parent.id}`} className="mt-4 inline-flex rounded-xl border border-slate-700 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-slate-800">
            View Parent
          </Link>
        </AdminSectionCard>

        <AdminSectionCard title="Student Onboarding Profile">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3 text-sm text-slate-300">DOB: {student.studentProfile?.dateOfBirth ? new Date(student.studentProfile.dateOfBirth).toLocaleDateString() : "Not set"}</div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3 text-sm text-slate-300">Voice: {student.studentProfile?.voiceProfile ?? student.selectedVoice}</div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3 text-sm text-slate-300">KS Level: {student.studentProfile?.keyStageLevel ?? "Not set"}</div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3 text-sm text-slate-300">Pathway: {student.studentProfile?.curriculumPathway?.toUpperCase() ?? "Not set"}</div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3 text-sm text-slate-300">Exam Board: {student.studentProfile?.examBoard ?? "Not set"}</div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3 text-sm text-slate-300">Learning Level: {student.studentProfile?.learningLevel ?? "Not set"}</div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3 text-sm text-slate-300">Reading Level: {student.studentProfile?.readingLevel ?? "Not set"}</div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3 text-sm text-slate-300">Subject Focus: {student.studentProfile?.subjectFocus ?? "Not set"}</div>
          </div>
          <div className="mt-3 space-y-2 text-sm text-slate-300">
            <p>GCSE Subjects: {(student.studentProfile?.gcseSubjects ?? []).join(", ") || "Not set"}</p>
            <p>Target Grades: {student.studentProfile?.targetGrades ? JSON.stringify(student.studentProfile.targetGrades) : "Not set"}</p>
            <p>SEN Support: {student.studentProfile?.senSupportNeeds ?? "Not set"}</p>
            <p>Weak Areas: {student.studentProfile?.weakAreasText ?? "Not set"}</p>
            <p>Guardian Permissions: {student.studentProfile?.guardianPermissions ?? "Not set"}</p>
            <p>School Information: {student.studentProfile?.schoolInformation ?? "Not set"}</p>
          </div>
        </AdminSectionCard>

        <AdminSectionCard title="Adaptive Tutor Readiness">
          {student.adaptiveTutor?.enoughHistory ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3 text-sm text-slate-300">Status: {student.adaptiveTutor.readinessLabel ?? "Active"}</div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3 text-sm text-slate-300">Attempts used: {student.adaptiveTutor.totalAttempts ?? 0}</div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3 text-sm text-slate-300">Confidence signal: {student.adaptiveTutor.confidenceTrend ?? 0}%</div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3 text-sm text-slate-300">Frustration risk: {student.adaptiveTutor.frustrationRisk ?? 0}%</div>
            </div>
          ) : (
            <p className="text-sm text-slate-300">{student.adaptiveTutor?.fallbackMessage ?? "Not enough learning history yet. The tutor will adapt as more activities are completed."}</p>
          )}
        </AdminSectionCard>

        {showDevAttemptSeeding ? (
          <AdminSectionCard title="Dev Attempt Seeding">
            <p className="text-sm text-slate-400">Create fake Silent e attempts to test weak-area detection and resolved/improving status.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => void seedAttempts("low")} className="rounded-xl bg-rose-500 px-4 py-2 text-sm font-bold text-white">Seed Low Silent e</button>
              <button onClick={() => void seedAttempts("high")} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white">Seed High Silent e</button>
            </div>
            {seedMessage ? <p className="mt-3 text-sm text-slate-300">{seedMessage}</p> : null}
          </AdminSectionCard>
        ) : null}

        <AdminSectionCard title="Weak Areas & Adaptive Difficulty">
          {student.weakAreas.length === 0 ? (
            <p className="text-sm text-slate-400">No weak areas detected yet.</p>
          ) : (
            <div className="space-y-3">
              {student.weakAreas.map((area) => (
                <div key={area.id} className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-bold text-white">{area.skillFocus}</p>
                      <p className="text-xs text-slate-400">{area.subject} · {area.keyStage ?? "KS"} · {area.yearGroup ?? "Year"} · {area.weaknessType}</p>
                      {area.interventionLaunchedAt ? (
                        <p className="mt-1 text-xs text-cyan-300">
                          Intervention launched: {new Date(area.interventionLaunchedAt).toLocaleString()}
                        </p>
                      ) : null}
                      {area.interventionCompletedAt ? (
                        <p className="text-xs text-emerald-300">
                          Intervention completed: {new Date(area.interventionCompletedAt).toLocaleString()}
                        </p>
                      ) : null}
                    </div>
                    <div className="text-right text-sm">
                      <p className="font-black text-white">{area.accuracy}%</p>
                      <p className="text-xs text-slate-500">Difficulty {area.currentDifficulty} · {area.status}</p>
                      {area.interventionImprovementPct !== null ? (
                        <p className="text-xs font-black text-amber-300">
                          Improvement {area.interventionImprovementPct >= 0 ? "+" : ""}{Math.round(area.interventionImprovementPct)}%
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </AdminSectionCard>

        <AdminSectionCard title="Wallet Summary">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <AdminStatCard title="Balance" value={student.walletSummary.balance} icon="C" tone="green" />
            <AdminStatCard title="Earned" value={student.walletSummary.totalEarned} icon="+" tone="blue" />
            <AdminStatCard title="Spent" value={student.walletSummary.totalSpent} icon="-" tone="rose" />
            <AdminStatCard title="Owned Items" value={student.ownedItems.length} icon="I" tone="purple" />
          </div>
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
              <p className="text-sm font-bold text-white">Earned by source</p>
              <div className="mt-3 space-y-2">
                {student.walletSummary.earnedBySource.map((entry) => (
                  <div key={entry.source} className="flex items-center justify-between gap-3 text-sm text-slate-300">
                    <span className="capitalize">{entry.source.replaceAll("_", " ")}</span>
                    <span className="font-black text-emerald-300">+{entry.amount}</span>
                  </div>
                ))}
                {!student.walletSummary.earnedBySource.length ? <p className="text-sm text-slate-500">No earned transactions yet.</p> : null}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
              <p className="text-sm font-bold text-white">Owned / purchased items</p>
              <div className="mt-3 space-y-2">
                {student.ownedItems.slice(0, 8).map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 text-sm text-slate-300">
                    <span>{item.name} {item.equipped ? "• equipped" : ""}</span>
                    <span className="text-slate-500">{new Date(item.purchasedAt).toLocaleString()}</span>
                  </div>
                ))}
                {!student.ownedItems.length ? <p className="text-sm text-slate-500">No owned items yet.</p> : null}
              </div>
            </div>
          </div>
        </AdminSectionCard>

        <AdminSectionCard title="Manual Wallet Adjustment">
          <p className="mb-4 text-sm text-slate-400">
            Write a <span className="text-white">manual_adjustment</span> ledger entry. Use positive values to add coins and negative to deduct.
          </p>
          {adjustMessage ? (
            <p className={`mb-4 rounded-xl border px-3 py-2 text-sm ${adjustMessage.ok ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100" : "border-rose-400/20 bg-rose-400/10 text-rose-100"}`}>
              {adjustMessage.text}
            </p>
          ) : null}
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs uppercase text-slate-500">Amount (coins)</span>
              <input
                type="number"
                step="1"
                placeholder="e.g. 10 or -5"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                className="w-36 rounded-xl bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-600 ring-1 ring-slate-700 focus:outline-none focus:ring-indigo-500"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 min-w-[14rem]">
              <span className="text-xs uppercase text-slate-500">Reason</span>
              <input
                type="text"
                placeholder="e.g. Bonus for completion"
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                className="rounded-xl bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-600 ring-1 ring-slate-700 focus:outline-none focus:ring-indigo-500"
              />
            </label>
            <button
              type="button"
              disabled={adjusting}
              onClick={() => void submitWalletAdjustment()}
              className="rounded-xl bg-indigo-500 px-5 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {adjusting ? "Saving…" : "Apply"}
            </button>
          </div>
        </AdminSectionCard>

        <AdminSectionCard title="Adaptive Level Decisions">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
            <p className="text-sm font-bold text-white">Recommended next activity</p>
            <p className="mt-2 text-sm text-slate-300">{student.recommendedNextActivity}</p>
          </div>
          <div className="mt-4 space-y-3">
            {student.recentLevelDecisions.map((decision) => (
              <div key={`${decision.subject}-${decision.ts}`} className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-bold text-white capitalize">{decision.subject} level {decision.previousLevel} → {decision.nextLevel}</p>
                  <p className="text-xs text-slate-500">Confidence {decision.confidenceScore}%</p>
                </div>
                <p className="mt-2 text-sm text-slate-300">{decision.reasons[0] ?? "No reason recorded."}</p>
              </div>
            ))}
            {!student.recentLevelDecisions.length ? <p className="text-sm text-slate-500">No level decisions recorded yet.</p> : null}
          </div>
        </AdminSectionCard>

        <AdminSectionCard title="Mode Struggles">
          {student.modeStruggles.length === 0 ? (
            <p className="text-sm text-slate-400">No repeated spelling mode struggles recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {student.modeStruggles.map((item) => (
                <div key={item.mode} className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-bold capitalize text-white">{item.mode.replaceAll("_", " ")}</p>
                    <p className="text-sm text-slate-300">{item.accuracy}% across {item.total} attempts</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </AdminSectionCard>

        <AdminSectionCard title="Recent Progress">
          {student.attempts.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-xs uppercase text-slate-500">
                    <th className="px-3 py-3">Subject</th>
                    <th className="px-3 py-3">Mode</th>
                    <th className="px-3 py-3">Skill</th>
                    <th className="px-3 py-3">Correct</th>
                    <th className="px-3 py-3">Difficulty</th>
                  </tr>
                </thead>
                <tbody>
                  {student.attempts.slice(0, 20).map((attempt) => (
                    <tr key={attempt.id} className="border-b border-slate-800/70 text-slate-300">
                      <td className="px-3 py-3 capitalize">{attempt.subject}</td>
                      <td className="px-3 py-3 capitalize">{attempt.spellingMode ? attempt.spellingMode.replaceAll("_", " ") : "—"}</td>
                      <td className="px-3 py-3">{attempt.skillFocus}</td>
                      <td className="px-3 py-3">{attempt.correct ? "Yes" : "No"}</td>
                      <td className="px-3 py-3">{attempt.difficulty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : student.progressRecords.length === 0 ? (
            <p className="text-sm text-slate-400">No activity yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-xs uppercase text-slate-500">
                    <th className="px-3 py-3">Subject</th>
                    <th className="px-3 py-3">Activity</th>
                    <th className="px-3 py-3">Accuracy</th>
                    <th className="px-3 py-3">Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {student.progressRecords.map((record) => (
                    <tr key={record.id} className="border-b border-slate-800/70 text-slate-300">
                      <td className="px-3 py-3 capitalize">{record.activityType}</td>
                      <td className="px-3 py-3">{record.activityName}</td>
                      <td className="px-3 py-3">{record.accuracy !== null ? `${record.accuracy}%` : "—"}</td>
                      <td className="px-3 py-3">{record.completed ? "Yes" : "No"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdminSectionCard>

        <AdminSectionCard title="Wallet Audit Log">
          <div className="mb-4 flex flex-wrap gap-2">
            {[
              { key: "all", label: "All" },
              { key: "earn", label: "Earned" },
              { key: "spend", label: "Spent" },
              { key: "failed", label: "Failed" },
              { key: "equip", label: "Equipped" },
            ].map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => setAuditFilter(filter.key as typeof auditFilter)}
                className={`rounded-xl px-4 py-2 text-sm font-bold ${auditFilter === filter.key ? "bg-indigo-500 text-white" : "border border-slate-700 text-slate-200 hover:bg-slate-800"}`}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <div className="space-y-3">
            {filteredWalletTransactions.map((entry) => (
              <div key={entry.id} className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="font-bold text-white">
                    {entry.type === "spend" ? `-${Math.abs(entry.amount)} coins` : entry.type === "failed" ? "Failed purchase" : entry.type === "equip" ? "Item equipped" : `+${entry.amount} coins`}
                    {entry.metadata?.itemName ? ` — ${entry.metadata.itemName}` : ""}
                  </p>
                  <span className="text-xs text-slate-500">{new Date(entry.createdAt).toLocaleString()}</span>
                </div>
                <div className="mt-2 grid gap-1 text-sm text-slate-300">
                  <p className="m-0">Source: {entry.source}</p>
                  <p className="m-0">Reason: {entry.reason ?? entry.metadata?.activityName ?? entry.metadata?.failureCode ?? "—"}</p>
                  <p className="m-0">Balance: {entry.balanceBefore} → {entry.balanceAfter}</p>
                </div>
              </div>
            ))}
            {!filteredWalletTransactions.length ? <p className="text-sm text-slate-500">No audit rows for this filter.</p> : null}
          </div>
        </AdminSectionCard>
      </div>
    </div>
  );
}
