import { getTrialStorageKey, getTrialUsage, incrementTrialUsage } from "@/lib/trial"

export type AccessState = {
  hasAccess: boolean
  reason?: "trial" | "locked" | "limit"
  trialSessionsLeft: number
}

export function getLocalTrialUsage() {
  return getTrialUsage()
}

export function useTrialSession() {
  if (typeof window === "undefined") return
  const markerBase = `starliz_trial_mark_${window.location.pathname}`
  const lastMark = Number(sessionStorage.getItem(markerBase) || "0")
  const now = Date.now()

  // Guard against duplicate increments in React strict-mode remounts.
  if (now - lastMark < 2000) return

  incrementTrialUsage()
  sessionStorage.setItem(markerBase, String(now))
}

export function getClientAccess(hasSubscription: boolean): AccessState {
  const used = getLocalTrialUsage()
  const trialLimit = 3

  if (hasSubscription) {
    return {
      hasAccess: true,
      trialSessionsLeft: trialLimit,
    }
  }

  if (used < trialLimit) {
    return {
      hasAccess: true,
      trialSessionsLeft: trialLimit - used,
    }
  }

  return {
    hasAccess: false,
    reason: "trial",
    trialSessionsLeft: 0,
  }
}

export function clearLocalTrialUsage() {
  if (typeof window === "undefined") return
  localStorage.removeItem(getTrialStorageKey())
}