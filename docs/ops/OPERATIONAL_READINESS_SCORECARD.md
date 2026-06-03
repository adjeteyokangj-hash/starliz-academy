# Operational Readiness Scorecard

Status: Initial documentation baseline
Assessment Date:
Owner: Operations Lead

RAG Definitions:
- Green: Evidence complete and repeatable.
- Amber: Partial evidence, gaps tracked.
- Red: Missing evidence or untested critical control.

## Scorecard Table
| Phase | Area | Current RAG | Evidence Present | Key Gaps | Next Action | Owner | Target Date |
|---|---|---|---|---|---|---|---|
| 6B | Backup Coverage and Policy | Amber | Policy/docs present | Full restore cadence evidence pending | Run scheduled restore validation and archive evidence | Ops |  |
| 6C | Restore Validation Evidence | Amber | Checklist pack created | Completed signed restore evidence not attached | Execute checklist in drill and collect signed outputs | Ops + Tech |  |
| 6D | Formal Incident Runbooks | Amber | 6 runbooks documented | Signed approvals, review cadence, and provider-capability evidence links pending | Add quarterly review, approval cycle, and Phase 6B evidence references | Ops |  |
| 6E | DR Drill Templates and Cadence | Amber | 5 drill templates created | Completed drill reports not yet attached | Run scenario drills and publish reports | Ops + Tech |  |
| 7 | Monitoring and Alerting Operations | Amber | Existing monitoring docs available | Alert-to-runbook mapping validation incomplete | Perform alert mapping audit and on-call test | Tech |  |
| 9 | Release and Rollback Readiness | Amber | Rollback guidance and release checks exist | Timed rollback drill evidence pending | Run failed-release drill and capture RTO | Tech + Product |  |
| 11 | Final Release Sign-Off Governance | Amber | Sign-off doc exists | Sign-off evidence matrix consolidation needed | Consolidate objective evidence matrix per release | Product + Ops |  |
| 12 | Continuous Improvement and Audit Trail | Red | No formal recurring audit scorecard history | Recurring cadence not operationalized | Start monthly readiness review and versioned scorecards | Ops |  |

## Aggregate View
- Overall Status: Amber
- Critical Reds: Phase 12
- Highest Priority Ambers: Phases 6C, 6E, 9

## Required Evidence to Move to Green
1. At least one completed and signed drill report per Phase 6E scenario.
2. Completed restore validation artifact set mapped to Phase 6C checklist chain.
3. Measured rollback drill with target/actual RTO and lessons captured.
4. Monthly readiness review initiated with version history.

## Review Cadence
- Weekly: Gap tracker update.
- Monthly: Full RAG reassessment.
- Quarterly: Runbook/template quality review.
