# Canonical Completion Reconciliation Plan (Read-Only)

## Scope

This plan identifies historical records that may be inaccurate under the canonical rule:

> A session is complete only when all required items are resolved by either:
> - answered outcome, or
> - approved skipped outcome.

No data changes are performed by this plan.

## Potentially Inaccurate Historical Data

1. Progress records created with `completed=true` where resolved count was lower than required count.
2. Assignments marked `completed` from legacy index-based session flow.
3. Certificate eligibility/issuance decisions that included these records.
4. Mastery and HEART BEAT summaries derived during those periods.

## Read-Only Detection Queries (Design)

1. Find progress records with canonical mismatch signals in notes JSON:
   - `requiredQuestionCount`
   - `answeredCount`
   - `approvedSkippedCount`
   - `completionDowngraded`
2. Find historical progress records without canonical counters and infer probable mismatch when:
   - `attempts` is low for known session denominator,
   - `completed=true` and unresolved skip signals are present,
   - assignment transitioned to completed without enough correct/approved skipped evidence.
3. Join mismatched sessions to affected assignment IDs, students, and certificate windows.
4. Produce impact report tables:
   - affected assignments
   - affected certificates
   - affected mastery snapshots
   - affected heartbeat windows

## Safe Reconciliation Sequence (Future Execution)

1. Build an immutable audit snapshot table/file of all candidate mismatches.
2. Recompute canonical completion per candidate using deterministic replay logic.
3. Classify each mismatch:
   - false completion
   - false incomplete
   - ambiguous (manual review)
4. Dry-run downstream impact:
   - certificate eligibility delta
   - mastery status delta
   - heartbeat decision delta
5. Manual review queue for high-risk student outcomes.
6. Apply non-destructive compensating updates only (no reset/no destructive rewrite).
7. Re-run eligibility/mastery/heartbeat recomputation for impacted students.
8. Generate signed post-reconciliation report.

## Guardrails

1. No Prisma reset.
2. No migration reset.
3. No db push reset.
4. No destructive deletes/overwrites of source history.
5. Every reconciliation action must be idempotent and logged.

## Success Criteria

1. All newly written completion events obey canonical resolution checks.
2. No assignment can be marked completed with unresolved required items.
3. Certificate, mastery, heartbeat, and catch-up consumers read canonical completion outcomes.
4. Historical mismatch impact is fully reported before any data mutation.
