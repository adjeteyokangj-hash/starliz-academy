"use client"

import UpgradePrompt from "./UpgradePrompt"

export default function LockedPreview({
  children,
  reason = "locked",
}: {
  children: React.ReactNode
  reason?: "trial" | "locked" | "limit"
}) {
  return (
    <div className="relative">
      <div className="pointer-events-none blur-sm opacity-60">{children}</div>
      <div className="absolute inset-0 flex items-center justify-center bg-white/70 p-4">
        <UpgradePrompt reason={reason} />
      </div>
    </div>
  )
}