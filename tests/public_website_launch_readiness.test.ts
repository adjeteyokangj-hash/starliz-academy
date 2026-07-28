import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { getPublicCompanyIdentity } from "../src/lib/public-company"
import { getPolicyBySlug } from "../src/lib/policies/registry"

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8")
}

test("UK homepage discloses the frozen Short Learning offer and trust boundaries", () => {
  const uk = source("src/app/uk/page.tsx")
  assert.match(uk, /SHORT_LEARNING_PROMISE/)
  assert.match(uk, /90- or 120-minute/)
  assert.match(uk, /Support desk/)
  assert.match(uk, /not private one-to-one tutoring/)
  assert.match(uk, /Subscription cancellation takes effect at the end of the current billing period/)
})

test("public launch CTAs do not hard-link disabled trial or roadmap routes", () => {
  const uk = source("src/app/uk/page.tsx")
  const pricing = source("src/components/pricing/PublicPricingSection.tsx")
  const roadmap = source("src/app/roadmap/page.tsx")
  assert.doesNotMatch(uk, /<Link\s+href="\/trial"/)
  assert.doesNotMatch(pricing, /href=\{plan\.ctaHref\s*\|\|\s*"\/trial"\}/)
  assert.match(pricing, /configuredHref === "\/trial" && !trialEnabled/)
  assert.doesNotMatch(roadmap, /<Link\s+href="\/trial"/)
  assert.match(roadmap, /showTrialCta \? "\/trial" : "\/signup"/)

  const middleware = source("middleware.ts")
  assert.match(middleware, /isPublicTrialCtaEnabled\(\) \? \["\/trial"\]/)
  assert.match(middleware, /isRoadmapPublicEnabled\(\) \? \["\/roadmap"\]/)
})

test("public footers expose payment-grade trust links", () => {
  for (const file of [
    "src/app/uk/page.tsx",
    "src/components/layout/PublicShell.tsx",
  ]) {
    const text = source(file)
    for (const href of ["/privacy", "/terms", "/cookies", "/ai-use", "/safeguarding-policy", "/policies", "/faq", "/contact"]) {
      assert.match(text, new RegExp(`href="${href}"`), `${file} missing ${href}`)
    }
  }
})

test("public FAQ uses parent-facing wording and names the Support desk boundary", () => {
  const faq = source("src/app/faq/page.tsx")
  assert.doesNotMatch(faq, /StudentLearningBooking/)
  assert.match(faq, /Short Learning Support desk/)
  assert.match(faq, /separate from the Day School Live Classroom/)
})

test("pricing fallback CTAs stay on public signup when trial is off by default", () => {
  const fallback = source("src/lib/pricing/fallback.ts")
  assert.doesNotMatch(fallback, /ctaHref:\s*"\/trial"/)
  assert.match(fallback, /ctaHref:\s*"\/signup"/)
})

test("cookie policy matches the shipped essential-only notice", () => {
  const cookies = getPolicyBySlug("cookies")
  assert.ok(cookies)
  const text = cookies.sections.flatMap((section) => section.body).join("\n")
  assert.match(text, /currently uses essential cookies/i)
  assert.match(text, /does not currently set optional advertising cookies/i)
  assert.match(text, /starliz_cookie_notice_v1/)
  assert.match(source("src/app/layout.tsx"), /<CookieNotice \/>/)
  const notice = source("src/components/public/CookieNotice.tsx")
  assert.match(notice, /document\.cookie/)
  assert.match(notice, /COOKIE_NOTICE_KEY/)
  assert.match(notice, /Understood/)
})

test("company identity never invents registration details", () => {
  const names = [
    "STARLIZ_LEGAL_NAME",
    "STARLIZ_COMPANY_NUMBER",
    "STARLIZ_REGISTERED_OFFICE",
    "STARLIZ_VAT_NUMBER",
  ] as const
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]))

  try {
    for (const name of names) delete process.env[name]
    const missing = getPublicCompanyIdentity()
    assert.equal(missing.completeForPayments, false)
    assert.equal(missing.legalName, null)
    assert.equal(missing.companyNumber, null)

    process.env.STARLIZ_LEGAL_NAME = "Example Learning Ltd"
    process.env.STARLIZ_COMPANY_NUMBER = "12345678"
    process.env.STARLIZ_REGISTERED_OFFICE = "1 Example Street, London"
    const configured = getPublicCompanyIdentity()
    assert.equal(configured.completeForPayments, true)
    assert.equal(configured.legalName, "Example Learning Ltd")
  } finally {
    for (const name of names) {
      const value = previous[name]
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
})

test("key public marketing pages define route-specific metadata", () => {
  for (const file of [
    "src/app/uk/page.tsx",
    "src/app/short-learning/page.tsx",
    "src/app/pricing/page.tsx",
    "src/app/faq/page.tsx",
    "src/app/about/page.tsx",
    "src/app/contact/page.tsx",
  ]) {
    assert.match(source(file), /export const metadata/, `${file} missing metadata`)
  }
})
