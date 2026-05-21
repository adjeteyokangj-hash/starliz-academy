export const TRIAL_EMAIL_STORAGE_KEY = "starliz_trial_email"

type RestoreResponse = {
  status?: "restored" | "expired"
  signupUrl?: string
  trial?: { email?: string }
}

export function storeTrialEmail(email: string) {
  if (typeof window === "undefined") return
  const normalized = email.trim().toLowerCase()
  if (!normalized) return
  window.localStorage.setItem(TRIAL_EMAIL_STORAGE_KEY, normalized)
}

export function readStoredTrialEmail(): string | null {
  if (typeof window === "undefined") return null
  const value = window.localStorage.getItem(TRIAL_EMAIL_STORAGE_KEY)
  if (!value) return null
  const normalized = value.trim().toLowerCase()
  return normalized || null
}

export async function restoreTrialSessionFromStorage(): Promise<{
  restored: boolean
  expired: boolean
  email: string | null
  signupUrl?: string
}> {
  const email = readStoredTrialEmail()
  if (!email) {
    return { restored: false, expired: false, email: null }
  }

  try {
    const response = await fetch("/api/trial/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    })

    const payload = (await response.json().catch(() => ({}))) as RestoreResponse
    if (!response.ok) {
      return { restored: false, expired: false, email }
    }

    if (payload.status === "restored") {
      if (payload.trial?.email) {
        storeTrialEmail(payload.trial.email)
      }
      return { restored: true, expired: false, email: payload.trial?.email ?? email }
    }

    if (payload.status === "expired") {
      return {
        restored: false,
        expired: true,
        email: payload.trial?.email ?? email,
        signupUrl: payload.signupUrl,
      }
    }

    return { restored: false, expired: false, email }
  } catch {
    return { restored: false, expired: false, email }
  }
}
