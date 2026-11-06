# Verified Coding release candidate — 3 November 2026

Checkout byte preservation is recorded in [checkout-bytes.json](checkout-bytes.json) and `.gitattributes`. Explicit line endings preserve all 363 hash-bound source files across checkouts, including existing mixed-ending files. A clean staged checkout passed Next.js route type generation and full shipped-code TypeScript checking, and reproduced both the practical executor and complete curriculum runtime fingerprints without rerunning activities or weakening either guard. See [Git's attribute documentation](https://git-scm.com/docs/gitattributes).

The approved Coding Studio and all 440 authored activities are preserved as a development checkpoint. This branch is not production-approved and does not publish the expanded curriculum.

## Verification

- 440/440 activities and 6,162 practical checks against the current dependency fingerprint.
- 349 regression tests; 2,590 Blockly round trips; 15 responsive Edge samples.
- Authenticated current/legacy native lessons, independent replay and exact database save/resume passed.
- Full npm prebuild, Prisma regeneration, production compilation/type checking and six anonymous production HTTP checks passed.
- All 68 local migrations match the authorised database; no migration was applied.

[Summary](summary.json), [all 440 activity results](activity-index.json), and [evidence provenance](provenance.json). The practical JSONL files contain only freshly executed authored curriculum reference/variation programs. Their hashes match retained local evidence. Private authenticated QA logs, account identifiers, saved QA explanations, model payloads, credentials and screenshots remain local.

## Initial failures retained

The initial sweep had 435 passes, four failures and one unavailable activity. Y6.05 and P-Y7-1 exceeded a runtime budget; Y11.01 encountered a job-local HTTP deadline; Y10.20 returned infrastructure-error without diagnostic text; C-Y8-1-2 could not complete independent page inspection. All five passed full reruns with unchanged code, dependencies, isolation and budgets. Their original rows are retained. Root causes are not fully established; passing reruns do not demonstrate sustained production reliability.

## Deployment protection

The branch-specific git.deploymentEnabled entry in vercel.json disables Vercel deployments for codex/coding-release-candidate-2026-11-03. Existing CI accepts pushes only on main (or pull requests/manual dispatch); this checkpoint creates no pull request. The commit also carries [skip ci]. This branch must not be merged or deployed without separate approval.

See [Vercel's branch configuration](https://vercel.com/docs/project-configuration/git-configuration) and [GitHub's workflow skip instructions](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs).

## Release gates

ZDR remains unverified; under-13 and unknown-age personal context stays excluded from model requests. Current runner adversarial security acceptance remains pending under the existing platform restrictions. Dependency advisories require review (3 high, 16 moderate, 1 low affected package entries). Hosted permissions/private media/gateway journeys, operational capacity/recovery, broader physical-device/screen-reader/cross-browser acceptance, curriculum publication and deployment remain separate requirements. No paid hosting was provisioned.

These are author practical proofs, representative UI journeys and local acceptance results. They are not 440 authenticated seven-stage mastery journeys or production approval. The Coding Studio design is the approved local baseline; no redesign is part of this checkpoint.

The 28 shared route-helper extractions preserve the required Next.js route-export compatibility. The existing applied migration history is preserved as files only; install/build scripts generate Prisma Client and do not apply migrations. Unrelated local child-login UI edits, duplicate copies, machine-specific diagnostics, caches and private raw QA records are excluded.
