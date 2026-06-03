# R2 Failure Runbook

Status: Draft operational runbook (Phase 6D).
Owner: Operations Lead
Approvers: Technical Lead, Safeguarding Lead

## Review Frequency

- Quarterly.
- After every R2 incident, object recovery exercise, bucket setting change, provider durability change, or safeguarding evidence policy change.

## Purpose
Recover platform behavior when object storage is unavailable, degraded, or partially inconsistent.

## Scope
- Media and evidence files in Cloudflare R2.
- Certificate assets and uploaded lesson/support files.

## Triggers
- Sustained upload failures (5xx/timeout).
- Read failures for existing objects.
- Replication lag or integrity mismatch alert.
- Provider-declared outage.

## Severity and Escalation
- SEV1 when safeguarding evidence or core learner media is inaccessible.
- Incident commander assigned.

## Immediate Containment (0 to 15 minutes)
1. Freeze non-essential uploads.
2. Keep critical endpoints in read-only fallback where possible.
3. Log failing object prefixes and affected user journeys.
4. Notify stakeholders with impacted features.

## Recovery Procedure
1. Confirm whether issue is endpoint, credentials, or provider outage.
2. If regional issue, use the evidenced alternate object recovery path from Phase 6B.
   - Use a replicated bucket endpoint only if replication is enabled, tested, and approved.
   - If replication is not proven, keep affected writes contained and continue with provider recovery/reconciliation.
3. Validate object availability for critical prefixes:
   - admin/safeguarding/
   - certificates/
   - lessons/
4. Reconcile failed uploads from logs, application records, and user reports where safe.
5. Reconcile metadata records for failed write windows.

## Verification Checklist
- Safeguarding evidence files resolve from UI/API.
- Certificate exports and verification assets load.
- New uploads succeed for admin and school flows.
- Error rate on storage-dependent routes returns to baseline.

## Evidence to Collect
- Outage start/end times.
- Prefixes impacted.
- Alternate recovery/failover activation timestamp, if an evidenced alternate path was used.
- Recovery validation screenshots/logs.
- Phase 6B evidence reference for any replication, lifecycle, versioning, or immutability control relied upon.

## Sign-Off

| Role | Name | Decision | Date | Evidence Link |
|---|---|---|---|---|
| Operations Lead |  |  |  |  |
| Technical Lead |  |  |  |  |
| Safeguarding Lead |  |  |  |  |

## Exit Criteria
- Critical object reads and writes healthy for 30 minutes.
- Reconciliation completed for failed uploads.
- Incident report and remediation actions logged.
