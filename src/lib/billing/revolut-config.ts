const REVOLUT_SANDBOX_API_BASE_URL = "https://sandbox-merchant.revolut.com/api"
const REVOLUT_PRODUCTION_API_BASE_URL = "https://merchant.revolut.com/api"

function normalizeOverride(value: string | null | undefined): string | null {
  const normalized = (value ?? "").trim()
  if (!normalized) return null
  return normalized.replace(/\/+$/, "")
}

function normalizeEnvironment(value: string | null | undefined): "sandbox" | "production" {
  return (value ?? "").trim().toLowerCase() === "production" ? "production" : "sandbox"
}

export function resolveRevolutApiBaseUrl(options?: {
  apiBaseUrl?: string | null
  environment?: string | null
}): string {
  const override = normalizeOverride(options?.apiBaseUrl ?? process.env.REVOLUT_API_BASE_URL)
  if (override) return override

  const environment = normalizeEnvironment(options?.environment ?? process.env.REVOLUT_ENVIRONMENT)
  return environment === "production" ? REVOLUT_PRODUCTION_API_BASE_URL : REVOLUT_SANDBOX_API_BASE_URL
}
