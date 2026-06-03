# Bad Release Rollback Runbook

Status: Draft operational runbook (Phase 6D).
Owner: Technical Lead
Approvers: Product Owner, Operations Lead

## Review Frequency

- Quarterly.
- After every failed deployment incident, rollback drill, deployment platform change, or release policy change.

## Purpose
Restore service quickly when a release introduces severe regression.

## Scope
- Application deployment rollback.
- Runtime configuration rollback if required.

## Triggers
- Post-release SEV1 or sustained critical errors.
- Auth, safeguarding, payment, or assignment critical journey failure.
- Data corruption risk introduced by release behavior.

## Immediate Containment
1. Freeze further deployments.
2. Announce rollback decision and owner.
3. Disable risky feature flags if available.

## Rollback Procedure
1. Identify last known good release artifact.
2. Execute platform rollback command/process.
3. Validate environment variables and secrets consistency.
4. Run prioritized smoke checks:
   - login/auth
   - parent/student dashboard load
   - safeguarding routes
   - payment webhook health
5. Re-open traffic progressively.

## Verification Checklist
- Error rates back to baseline.
- Core journeys pass smoke checks.
- No new data integrity warnings.

## Communication
- Initial incident update.
- Rollback started update.
- Rollback completed update with residual risks.

## Evidence to Collect
- Bad release version/hash.
- Rolled back release version/hash.
- Rollback start/end timestamps.
- Smoke check results.

## Sign-Off

| Role | Name | Decision | Date | Evidence Link |
|---|---|---|---|---|
| Technical Lead |  |  |  |  |
| Product Owner |  |  |  |  |
| Operations Lead |  |  |  |  |

## Exit Criteria
- Stable platform for 30 minutes post-rollback.
- Incident timeline and follow-up owners documented.
