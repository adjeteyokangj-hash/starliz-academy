const TRIAL_KEY = "starliz_trial_usage"

export function getTrialUsage() {
  if (typeof window === "undefined") return 0
  return Number(localStorage.getItem(TRIAL_KEY) || "0")
}

export function incrementTrialUsage() {
  if (typeof window === "undefined") return 0
  const current = getTrialUsage()
  const next = current + 1
  localStorage.setItem(TRIAL_KEY, String(next))
  return next
}

export function getTrialStorageKey() {
  return TRIAL_KEY
}