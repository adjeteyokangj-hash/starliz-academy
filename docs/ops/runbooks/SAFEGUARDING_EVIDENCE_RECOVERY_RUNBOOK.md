# Safeguarding Evidence Recovery Runbook

Status: Draft operational runbook (Phase 6D).
Owner: Safeguarding Lead
Approvers: Technical Lead, Operations Lead

## Review Frequency

- Quarterly.
- After every safeguarding evidence incident, restore drill, R2 retention setting change, database backup setting change, or safeguarding policy change.

## Purpose
Recover safeguarding evidence and incident timelines while preserving legal and audit integrity.

## Scope
- Safeguarding incidents, workflow events, evidence attachments.
- Related storage objects and metadata links.

## Triggers
- Missing or inaccessible safeguarding evidence files.
- Incident timeline records incomplete or corrupted.
- Unauthorized deletion or modification detected.

## Immediate Containment
1. Lock affected incident records to prevent further mutation.
2. Preserve audit logs and access logs.
3. Restrict recovery access to approved incident team.

## Recovery Procedure
1. Identify affected incidents and evidence IDs.
2. Restore metadata from database backup, snapshot, or PITR side restore, only using controls enabled and evidenced in Phase 6B.
3. Restore evidence files from R2 version history, backup replica, or approved alternate object backup, only using controls enabled and evidenced in Phase 6B.
4. Re-link metadata to recovered object keys/URLs.
5. Validate chronology and escalation records for completeness.

## Verification Checklist
- Incident details load correctly in admin safeguarding views.
- Evidence links resolve and file hashes match expected samples.
- Timeline and audit event continuity confirmed.
- Access controls remain restricted post-recovery.

## Compliance Safeguards
- Maintain chain-of-custody notes.
- Record all recovery actions and approvers.
- Avoid broad data export during investigation.

## Evidence to Collect
- Incident IDs and attachment IDs affected.
- Recovery source timestamps/versions.
- Hash validation samples.
- Safeguarding lead sign-off.
- Phase 6B evidence reference for any database backup/PITR, R2 versioning, replication, lifecycle, or immutability control relied upon.

## Sign-Off

| Role | Name | Decision | Date | Evidence Link |
|---|---|---|---|---|
| Safeguarding Lead |  |  |  |  |
| Technical Lead |  |  |  |  |
| Operations Lead |  |  |  |  |

## Exit Criteria
- Evidence and timeline integrity confirmed.
- Safeguarding lead and technical lead sign-off completed.
- Incident post-mortem scheduled.
