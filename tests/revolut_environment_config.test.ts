import test from "node:test"
import assert from "node:assert/strict"

import { resolveRevolutApiBaseUrl } from "../src/lib/billing/revolut-config"

test("sandbox environment selects sandbox merchant URL", () => {
  const url = resolveRevolutApiBaseUrl({ environment: "sandbox" })
  assert.equal(url, "https://sandbox-merchant.revolut.com/api")
})

test("production environment selects production merchant URL", () => {
  const url = resolveRevolutApiBaseUrl({ environment: "production" })
  assert.equal(url, "https://merchant.revolut.com/api")
})

test("REVOLUT_API_BASE_URL override wins over environment", () => {
  const url = resolveRevolutApiBaseUrl({
    environment: "sandbox",
    apiBaseUrl: "https://custom-revolut-proxy.internal/api/",
  })

  assert.equal(url, "https://custom-revolut-proxy.internal/api")
})

test("missing REVOLUT_ENVIRONMENT defaults safely to sandbox when no override is set", () => {
  const url = resolveRevolutApiBaseUrl({ environment: "" })
  assert.equal(url, "https://sandbox-merchant.revolut.com/api")
})
