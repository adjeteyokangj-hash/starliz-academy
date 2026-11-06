# Coding tutor provider privacy

The account owner has confirmed that Zero Data Retention is **not enabled or is unverified**. Keep `CODING_AI_ZERO_DATA_RETENTION_VERIFIED` unset or `false`. No provider account setting has been changed or verified by this implementation.

`store:false` prevents response storage for the relevant API feature; it does not establish the provider project's Zero Data Retention status. See OpenAI's [data controls](https://developers.openai.com/api/docs/guides/your-data) and [under-18 guidance](https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance).

## Current behaviour

- For learners under 13, and learners whose age is unknown, model requests contain approved curriculum context only. Questions, code, execution output and explanations stay out of those requests.
- Practical execution and deterministic checks remain available. When personalised explanation review is unavailable, practical progress and the explanation draft are retained. A pending review does not award mastery or count as an assessment failure.
- For learners with a server-recorded age of 13 or above, the existing consent and access checks still apply. Permitted project context is redacted before sending. Redaction reduces exposure; it is not a guarantee that arbitrary text contains no personal information.
- Author previews use a separately authorised author context. A learner request cannot supply its own age, author scope or provider-verification flag.
- Curriculum-only replies are labelled as lesson guidance and do not claim that the saved project has been inspected.

## Before enabling personalised review for younger learners

Verify approval and activation of Zero Data Retention for the **actual OpenAI project used by the server** through the provider's account controls. Retain the verification date and responsible operator in the organisation's operational records, without committing credentials or account evidence containing secrets. Only then may the authorised operator configure `CODING_AI_ZERO_DATA_RETENTION_VERIFIED=true` for that environment. The flag records verification; it cannot enable the provider feature.

Provider verification alone does not certify the complete safeguarding, consent or release process. Keep the curriculum release gate closed until the required functional and end-to-end verification also passes.

## Synthetic integration evidence — 3 November 2026

`scripts/coding/verify-synthetic-ai.ts` made five actual requests through the existing model transport using approved curriculum and fictional author work. Evidence: `artifacts/coding-ai-verification/90670d49-b366-4aa6-a10b-fb2f1c25128e/result.json`.

The checks passed for curriculum-only teaching with protected context excluded, author-example teaching, non-revealing independent strategy selection, grounded explanation acceptance and generic explanation rejection. A protected younger-learner explanation remained pending without a provider review. All five requests used `store:false`. The verifier looked up the existing configured key read-only; it did not change account configuration, write learner records, or set the retention-verification flag.

This verifies synthetic integration behaviour only. It does **not** verify Zero Data Retention, an authenticated learner journey, the educational reliability of arbitrary model replies, or release readiness.
