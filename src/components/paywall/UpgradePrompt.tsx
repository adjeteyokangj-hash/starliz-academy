"use client"

export default function UpgradePrompt({
  reason,
}: {
  reason: "trial" | "locked" | "limit"
}) {
  const messageMap = {
    trial: "Great progress so far. Unlock unlimited learning to continue.",
    locked: "This lesson adapts to your child — unlock it to continue.",
    limit: "Add more children and track each child's progress separately.",
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
      <h2 className="mb-2 text-xl font-bold text-slate-900">Unlock Full Learning</h2>
      <p className="mb-4 text-slate-600">{messageMap[reason]}</p>

      <ul className="mb-6 space-y-1 text-sm text-slate-500">
        <li>✔ Unlimited AI-generated learning</li>
        <li>✔ Smart difficulty progression</li>
        <li>✔ Progress tracking for each child</li>
      </ul>

      <button
        onClick={() => (window.location.href = "/pricing")}
        className="rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700"
      >
        Upgrade Now
      </button>
    </div>
  )
}