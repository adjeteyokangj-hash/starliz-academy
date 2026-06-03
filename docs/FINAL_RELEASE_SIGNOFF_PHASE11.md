# Final Release Signoff (Phase 11)

Status: Final consolidation layer for launch readiness.
Scope: Centralizes the blocking commands and reference docs added across the production-readiness phases.

## Report Command

```bash
npm run report:release-readiness
```

Primary release gate command:

```bash
npm run verify:release
```

## Blocking Gates
- Unified release verification: `npm run verify:release`
- Route smoke baseline: `npm run smoke:routes`
- Release QA pack: opt-in with `E2E_RELEASE_QA=1`
- Final smoke pack: opt-in with `E2E_FINAL_SMOKE=1`
- Launch environment audit: `npm run audit:launch-env`
- Release operations checklist review: `docs/ops/RELEASE_OPERATIONS_CHECKLIST.md`

## Signoff Rule
- Do not mark a release candidate ready until every blocking gate above has either passed or been explicitly waived by the release owner with written rationale.