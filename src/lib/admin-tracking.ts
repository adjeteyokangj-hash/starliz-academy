type UsageEventPayload = {
  type: string
  area: string
  game?: string
  feature?: string
  reason?: string
  trialSessionsLeft?: number
}

export async function trackUsageEvent(payload: UsageEventPayload) {
  try {
    await fetch("/api/admin/usage-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  } catch {
    // Non-blocking analytics hook.
  }
}