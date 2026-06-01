# Release Operations Checklist

Status: Phase 7 checklist draft.

## Pre-Release
- Validate environment separation (staging vs production).
- Confirm migrations are reviewed and rollback path is documented.
- Confirm health endpoint and safe logging controls are active.
- Confirm job and webhook monitors are reviewed.

## Release Window
1. Freeze unrelated changes.
2. Deploy approved artifact.
3. Run smoke checks for auth, subscription gating, and parent/admin critical paths.
4. Verify no sensitive data leaks in logs or error responses.

## Post-Release
1. Monitor health, job status, and webhook failure summaries.
2. Confirm weekly homework generation pipeline health.
3. Record release outcome and follow-up actions.

## Rollback Readiness
- Rollback trigger and owner confirmed.
- Last known good artifact identified.
- Stakeholder communication template prepared.
