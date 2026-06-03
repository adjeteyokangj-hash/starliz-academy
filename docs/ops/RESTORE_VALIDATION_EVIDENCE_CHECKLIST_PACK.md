# Restore Validation Evidence Checklist Pack (Phase 6C)

Status: Documentation-only checklist pack
Owner: Operations Lead
Reviewers: Technical Lead, Safeguarding Lead, Product Owner

## Usage
Use this checklist during every restore validation exercise or real recovery event. Evidence links should point to immutable logs, screenshots, exports, and signed reports.

## Review Frequency

- Review this checklist quarterly.
- Review after every restore validation exercise, real recovery event, provider backup setting change, or RTO/RPO policy change.

## Checklist Chain

## 1) Backup Provenance and Integrity
- [ ] Backup identifier recorded.
- [ ] Backup creation timestamp recorded.
- [ ] Backup scope recorded (database, objects, config references).
- [ ] Integrity/hash verification completed.
- [ ] Retention policy compliance confirmed.
- Evidence:

## 2) Restore Environment Control
- [ ] Restore executed in isolated environment first.
- [ ] Access restricted to approved responders.
- [ ] Environment parity with production validated (version/config class).
- [ ] Restore credentials retrieved via approved secure path.
- Evidence:

## 3) Restore Execution Evidence
- [ ] Restore start time captured.
- [ ] Restore end time captured.
- [ ] Recovery point target documented.
- [ ] Actual restored point documented.
- [ ] Any restore errors/warnings logged and triaged.
- Evidence:

## 4) Data Integrity Validation
- [ ] Core row-count checks completed.
- [ ] Referential integrity checks completed.
- [ ] Critical business entities spot-checked.
- [ ] Safeguarding incidents and timelines validated.
- [ ] Subscription/payment state consistency validated.
- Evidence:

## 5) Object Storage Validation (If In Scope)
- [ ] Critical object prefixes sampled and verified.
- [ ] Object metadata and link references validated.
- [ ] Hash/size sample validation completed.
- [ ] Missing object reconciliation report generated.
- Evidence:

## 6) Application-Level Functional Validation
- [ ] Admin login and core dashboards pass.
- [ ] Parent/student flows pass representative smoke checks.
- [ ] Assignment/content access checks pass.
- [ ] Safeguarding evidence access checks pass.
- [ ] Payment/subscription status checks pass.
- Evidence:

## 7) Security and Compliance Validation
- [ ] Access control boundaries unchanged after restore.
- [ ] Audit trail continuity verified.
- [ ] Data handling and minimization obligations preserved.
- [ ] Chain-of-custody notes complete for safeguarding-related items.
- Evidence:

## 8) RTO/RPO Measurement and Acceptance
- [ ] Target RTO declared for exercise/event.
- [ ] Actual RTO measured.
- [ ] Target RPO declared for exercise/event.
- [ ] Actual RPO measured.
- [ ] Variance analysis documented.
- Evidence:

## 9) Sign-Off and Closure
- [ ] Technical lead approval.
- [ ] Operations lead approval.
- [ ] Safeguarding lead approval (where applicable).
- [ ] Product/Business approval.
- [ ] Action tracker created for gaps.
- Evidence:

## Evidence Register
| Evidence Item | Location/Link | Captured By | Timestamp | Verified By |
|---|---|---|---|---|
| Backup verification |  |  |  |  |
| Restore logs |  |  |  |  |
| Integrity checks |  |  |  |  |
| Functional smoke results |  |  |  |  |
| RTO/RPO worksheet |  |  |  |  |
| Final sign-off |  |  |  |  |

## Gap and Remediation Log
| Gap ID | Description | Severity | Owner | Due Date | Status |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
