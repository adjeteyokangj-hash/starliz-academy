# Accidental Data Deletion Runbook

Status: Draft operational runbook (Phase 6D).
Owner: Operations Lead
Approvers: Technical Lead, Data Protection Owner

## Review Frequency

- Quarterly.
- After every deletion incident, restore drill, backup setting change, R2 retention setting change, or data protection policy change.

## Purpose
Recover deleted records or assets with minimal user impact and controlled data handling.

## Scope
- Database record deletion.
- Object storage deletion.

## Triggers
- Human error in admin tooling or scripts.
- Automated process deleting valid records unexpectedly.

## Immediate Containment
1. Stop deletion source (job, script, or endpoint).
2. Capture actor, time window, and scope.
3. Preserve audit logs and incident evidence.

## Recovery Procedure
1. Identify deletion window and affected entities.
2. Select recovery method:
   - PITR restore to side environment and selective replay, only if PITR is enabled and evidenced in Phase 6B.
   - Provider snapshot/manual database restore to side environment, if PITR is unavailable or not approved.
   - R2 object version restore for deleted objects, only if versioning is enabled and evidenced in Phase 6B.
   - Approved alternate object backup/replica restore, if R2 versioning is unavailable or not approved.
3. Validate recovered data against pre-incident counts/samples.
4. Apply selective restore to production with change control.

## Verification Checklist
- Affected accounts/entities restored.
- Referential integrity checks pass.
- Safeguarding and subscription records consistent.
- No duplicate/conflicting records introduced.

## Evidence to Collect
- Affected entity IDs.
- Recovery source backup/version IDs.
- Restore scripts/queries used.
- Pre/post row counts and spot checks.
- Phase 6B evidence reference for any PITR, snapshot, R2 versioning, replication, or backup control relied upon.

## Sign-Off

| Role | Name | Decision | Date | Evidence Link |
|---|---|---|---|---|
| Operations Lead |  |  |  |  |
| Technical Lead |  |  |  |  |
| Data Protection Owner |  |  |  |  |

## Exit Criteria
- Restored data validated by owner.
- Incident report includes root cause and guardrail actions.
