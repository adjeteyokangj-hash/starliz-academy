# Job Monitoring

Status: Phase 7 operations foundation.

## Monitored Jobs (Initial)
- Weekly homework generation pipeline.
- Homework recap/catch-up generation pipeline.
- Subscription reconciliation and access consistency checks.
- Any scheduled migration/cleanup job marked as launch-critical.

## Daily Review Expectations
1. Check last run timestamp for each critical job.
2. Check consecutive failures and error category.
3. Escalate jobs with 3+ consecutive failures.
4. Confirm weekly homework generation is current before school week start.

## Alert Thresholds
- Warning: stale run window exceeded.
- Critical: repeated failures or blocked downstream impact.

## Data Safety
- Do not log child names or full parent records in job failure logs.
- Use redacted summaries only.

## Manual Review Required
- Final owner/on-call mapping for each job.
- Final stale thresholds by job class.
