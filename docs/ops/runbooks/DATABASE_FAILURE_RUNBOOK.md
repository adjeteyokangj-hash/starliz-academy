# Database Failure Runbook

Status: Draft operational runbook (Phase 6D).
Owner: Operations Lead
Approvers: Technical Lead, Safeguarding Lead

## Review Frequency

- Quarterly.
- After every database incident, restore validation exercise, Supabase plan change, backup setting change, or RTO/RPO policy change.

## Purpose
Recover platform service after production database outage, corruption, or inaccessible primary endpoint.

## Scope
- PostgreSQL primary database and related application access paths.
- Parent, student, admin, safeguarding, assignment, and subscription flows.

## Triggers
- Database unavailable for 5 minutes or more.
- Sustained 5xx spike tied to database connectivity.
- Corruption or integrity check failure.
- Replication or storage failure declared by provider.

## Severity and Escalation
- SEV1 if learning/safeguarding routes are unavailable.
- Declare incident commander.
- Open incident channel and start timeline log.

## Preconditions
- Latest backup catalog available and linked to Phase 6B provider evidence.
- Restore credentials validated through the approved secure access path and recorded in evidence.
- Isolated restore environment available and recorded in evidence.
- On-call DBA or platform engineer assigned.

## Immediate Containment (0 to 15 minutes)
1. Freeze schema and write operations if partial availability exists.
2. Confirm blast radius (all tenants, selected routes, or single environment).
3. Notify stakeholders of incident start and provisional ETA.
4. Capture current error rates and failing endpoints.

## Recovery Procedure
1. Identify recovery target:
   - Last known good backup timestamp.
   - PITR point matching target RPO, only if PITR is enabled and evidenced in Phase 6B.
   - Provider snapshot/manual restore point, if PITR is unavailable or not approved.
2. Restore into isolated recovery environment.
3. Run integrity checks:
   - Core tables row counts.
   - Safeguarding incidents and evidence references.
   - Subscriptions and payment event consistency.
4. Promote restored database endpoint.
5. Reconnect application with controlled rollout.
6. Re-enable writes after verification gates pass.

## Verification Checklist
- Auth login works (admin, parent, student).
- Student dashboard and assigned content load.
- Safeguarding list and incident detail load.
- Subscription status endpoints return expected values.
- No elevated 5xx after cutover for 15 minutes.

## Communication
- Incident start notice.
- Recovery in progress notice with expected RTO.
- Recovery complete notice with observed RPO/RTO.

## Evidence to Collect
- Backup ID used.
- PITR timestamp applied, if PITR was used.
- Snapshot/manual restore timestamp used, if PITR was unavailable.
- Restore start/end timestamps.
- Verification checklist results.
- User-impact window.

## Sign-Off

| Role | Name | Decision | Date | Evidence Link |
|---|---|---|---|---|
| Operations Lead |  |  |  |  |
| Technical Lead |  |  |  |  |
| Safeguarding Lead |  |  |  |  |

## Exit Criteria
- Platform stable for 30 minutes post-restore.
- Verification checklist fully passed.
- Incident report drafted with action owners.

## Post-Incident Follow-Up
- Root cause analysis within 48 hours.
- Remediation tasks for monitoring and automation gaps.
- Runbook updates with lessons learned.
