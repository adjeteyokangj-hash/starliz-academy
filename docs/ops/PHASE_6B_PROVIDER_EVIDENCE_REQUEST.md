# Phase 6B Provider Evidence Request

Status: Evidence collection request
Scope: Backup and recovery provider proof
Owner: Operations Lead
Reviewers: Technical Lead, Data Protection Owner, Safeguarding Lead

## Purpose

StarLiz needs provider dashboard evidence before Phase 6B can move from "backup assumed" to "backup proven." This document lists the exact screenshots or exports required from Supabase, Cloudflare R2, Vercel, and the alerting/monitoring provider.

Do not change production configuration while collecting this evidence. Capture screenshots or provider exports only.

## Evidence Handling Rules

- Do not include secrets, access keys, tokens, passwords, or full database URLs.
- Redact account IDs only if required by policy; keep project names, regions, timestamps, backup IDs, and status labels visible where safe.
- Store screenshots/exports in `docs/ops/evidence/phase-6b/` or the approved external evidence vault, using filenames that include provider, evidence item, capture date, and environment.
- Record capture date, capturer, provider account, and reviewer.
- If a provider page shows a destructive action such as restore or delete, capture the modal/options without confirming the action.

## Supabase Evidence Needed

| Evidence Item | What to Capture | Where to Find It | Why It Matters | Pass Criteria | Fail Criteria | Reviewer |
|---|---|---|---|---|---|---|
| Project plan / billing tier | Screenshot or export showing current Supabase project plan. | Supabase Dashboard -> Organization/Project Billing or Project Settings -> Billing. | Determines automatic backup retention and PITR eligibility. | Plan is visible and supports the required production backup posture. | Plan is hidden, free/unsupported for required retention, or cannot be linked to the production project. | Operations Lead, Technical Lead |
| Project region | Screenshot showing database/project region. | Supabase Dashboard -> Project Settings -> General or Database settings. | Confirms data residency and informs recovery-region planning. | Region is visible and matches production compliance assumptions. | Region missing, inconsistent, or not approved for production data. | Data Protection Owner |
| Database backups page | Screenshot of the backups overview. | Supabase Dashboard -> Database -> Backups. | Confirms provider backup feature is available for the production database. | Backups page shows backup capability enabled or available. | Backups page unavailable, disabled, or unclear for production. | Technical Lead |
| Last successful backup date/time | Screenshot/export showing the latest successful backup timestamp and timezone. | Supabase Dashboard -> Database -> Backups. | Proves backups are actually running. | Latest successful backup is within the expected backup window. | No successful backup, stale backup, failed backup, or timestamp not visible. | Operations Lead |
| Backup retention period | Screenshot showing retention window or plan-derived retention. | Supabase Dashboard -> Database -> Backups and Billing plan page. | Defines recoverable window and validates RPO policy. | Retention period meets the approved Phase 6B target. | Retention period is too short, unknown, or only assumed. | Operations Lead, Data Protection Owner |
| PITR status | Screenshot showing whether Point-in-Time Recovery is enabled and recovery window. | Supabase Dashboard -> Database -> Backups -> Point-in-Time Recovery / PITR settings. | Determines whether StarLiz can restore to a precise point before a data loss event. | PITR status and recovery window are visible; enabled if required by RPO. | PITR status unknown, disabled when required, or recovery window insufficient. | Technical Lead |
| Restore options/modal | Screenshot of restore options or restore modal without executing restore. | Supabase Dashboard -> Database -> Backups -> Restore action. | Confirms operational restore paths available during an incident. | Restore options are visible and consistent with runbook assumptions. | Restore option unavailable, requires missing permissions, or modal does not show target/options. | Technical Lead, Operations Lead |
| Backup export/log | Any provider export, backup ID list, activity log, or audit event showing backup creation/restoration metadata. | Supabase Dashboard -> Database -> Backups, Logs, or Organization Audit Logs if available. | Provides audit-grade evidence beyond screenshots. | Export/log contains safe backup IDs, timestamps, and status. | No export/log available or it contains only unverified manual notes. | Operations Lead |

## Cloudflare R2 Evidence Needed

| Evidence Item | What to Capture | Where to Find It | Why It Matters | Pass Criteria | Fail Criteria | Reviewer |
|---|---|---|---|---|---|---|
| Bucket name | Screenshot showing production bucket name. | Cloudflare Dashboard -> R2 -> Overview -> selected bucket. | Confirms the bucket used by application env is the reviewed production storage location. | Bucket name matches production configuration. | Bucket name missing or does not match production env. | Technical Lead |
| Public access/domain setup | Screenshot showing public bucket status, r2.dev/custom domain settings, and access mode. | Cloudflare Dashboard -> R2 -> Bucket -> Settings -> Public access / Domains. | Confirms object access pattern and privacy exposure. | Public access/domain settings match approved media and safeguarding evidence policy. | Public access is broader than approved, unknown, or unmanaged. | Data Protection Owner, Safeguarding Lead |
| Versioning status | Screenshot/export showing object versioning status if available. | Cloudflare Dashboard -> R2 -> Bucket -> Settings, or provider/API capability page. | Determines whether deleted/overwritten objects can be restored by version. | Versioning is enabled if available and required, or documented as unavailable with compensating backup. | Status unknown, disabled without compensating backup, or assumed from docs only. | Technical Lead |
| Replication status | Screenshot/export showing replication rule or replica bucket/failover setup. | Cloudflare Dashboard -> R2 -> Bucket -> Settings, replication section if available, or documented provider export. | Supports cross-location object recovery and R2 outage runbook. | Replication or approved alternate object backup is visible and tested/planned. | No replication, no replica bucket, or runbook assumes a replica that does not exist. | Technical Lead, Operations Lead |
| Lifecycle rules | Screenshot/export of lifecycle rules. | Cloudflare Dashboard -> R2 -> Bucket -> Settings -> Object lifecycle rules. | Confirms retention/transition/delete controls for uploaded files. | Rules match approved retention policy and exclude protected safeguarding data from premature deletion. | No rules when required, rules conflict with retention policy, or delete protected objects too early. | Data Protection Owner, Safeguarding Lead |
| Bucket lock / immutability | Screenshot/export of bucket lock rules. | Cloudflare Dashboard -> R2 -> Bucket -> Settings -> Bucket lock rules. | Protects evidence and critical objects from accidental deletion/overwrite. | Bucket lock rules exist for required prefixes or a documented compensating control is approved. | No immutability for required evidence, unknown status, or policy is only aspirational. | Safeguarding Lead, Technical Lead |
| Object list sample | Screenshot showing representative uploaded objects, including safeguarding/evidence prefixes where safe. | Cloudflare Dashboard -> R2 -> Bucket -> Objects. | Proves application uploads are landing in the reviewed bucket and expected prefixes. | Sample includes expected prefixes such as safeguarding/admin/media without exposing sensitive content. | No expected objects, wrong bucket/prefix, or only local storage evidence. | Technical Lead, Safeguarding Lead |

## Vercel Evidence Needed

| Evidence Item | What to Capture | Where to Find It | Why It Matters | Pass Criteria | Fail Criteria | Reviewer |
|---|---|---|---|---|---|---|
| Project and production environment | Screenshot showing Vercel project name, production domain, and environment. | Vercel Dashboard -> Project -> Settings -> General / Domains. | Confirms the audited deployment target. | Project/domain match StarLiz production. | Project unclear, preview-only, or wrong domain. | Operations Lead |
| Production environment variable coverage | Screenshot/export showing required key names only, with values hidden. | Vercel Dashboard -> Project -> Settings -> Environment Variables. | Confirms production has backup, monitoring, database, and R2 config keys present. | Required key names are present for Production scope; values remain hidden. | Required keys missing, preview-only, or values exposed in evidence. | Technical Lead |
| Monitoring / observability settings | Screenshot of Vercel monitoring, logs, analytics, or integrations status. | Vercel Dashboard -> Project -> Observability / Analytics / Logs / Integrations. | Shows what platform-level runtime visibility exists. | Monitoring/log visibility is enabled and accessible to responders. | No monitoring/log access or unclear responder access. | Operations Lead |
| Deployment rollback options | Screenshot showing deployment history and rollback/promote controls without executing rollback. | Vercel Dashboard -> Project -> Deployments. | Supports incident rollback procedure. | Recent deployments and rollback/promote options are visible. | No accessible deployment history or rollback path unknown. | Technical Lead |
| Alert configuration | Screenshot of Vercel alerting/integration settings if used. | Vercel Dashboard -> Project/Team -> Notifications, Observability, or Integrations. | Confirms alert delivery for app/platform incidents. | Alerts route to approved channel or on-call owner. | No alert route, owner missing, or only manual checking. | Operations Lead |

## Alerting and Monitoring Provider Evidence Needed

| Evidence Item | What to Capture | Where to Find It | Why It Matters | Pass Criteria | Fail Criteria | Reviewer |
|---|---|---|---|---|---|---|
| Provider in use | Screenshot showing Sentry, Slack, Teams, PagerDuty, email, or equivalent provider/project. | Provider dashboard or integration settings. | Confirms alerting provider is real, not just env placeholders. | Provider/project is visible and tied to StarLiz production. | No provider, wrong project, or only code/env placeholders. | Operations Lead |
| Sentry setup if used | Screenshot showing Sentry project, environment, DSN presence, issue alerts, and last event if safe. | Sentry -> Project Settings / Alerts / Issues. | Confirms runtime error monitoring and production environment mapping. | Production project exists with alert rules and recent event/test evidence. | Sentry absent, no production project, no alert rules, or no event ingestion proof. | Technical Lead |
| Slack/Teams routing | Screenshot showing destination channel/team and integration rule. | Slack/Teams app integration settings, Vercel/Sentry notification settings, or provider routing rules. | Confirms alerts reach humans. | Alerts route to approved operations/on-call channel. | Alerts route nowhere, to personal channel only, or owner unknown. | Operations Lead |
| PagerDuty/on-call routing if used | Screenshot showing service, escalation policy, and on-call schedule. | PagerDuty -> Services / Escalation Policies / Schedules. | Confirms critical incidents have accountable response. | Service and escalation path are active and assigned. | No escalation policy, empty schedule, or stale owner. | Operations Lead |
| Supabase alerts | Screenshot showing database/resource alerts or notifications. | Supabase Dashboard -> Project/Organization Settings -> Alerts / Notifications / Logs. | Confirms database provider incidents can be detected. | Relevant database alerts are enabled and routed. | Alerts unavailable, disabled, or not routed. | Technical Lead |
| Cloudflare alerts | Screenshot showing R2/account notifications or alert routing. | Cloudflare Dashboard -> Notifications / Account settings / R2 logs if available. | Confirms object storage/provider incidents can be detected. | Relevant Cloudflare notifications are enabled and routed. | No alerts, disabled notifications, or owner missing. | Operations Lead |
| Alert test evidence | Screenshot/export of a safe test notification or recent non-sensitive alert delivery. | Provider alert history, Slack/Teams/PagerDuty notification history, or email alert. | Proves alert delivery works end to end. | Test alert delivered to approved route and acknowledged by reviewer. | No test evidence or delivery failed. | Operations Lead, Technical Lead |

## Review Decision

Phase 6B can be marked "backup proven" only when:

1. Supabase backup status, retention, latest backup, restore option, PITR decision, and region are evidenced.
2. Cloudflare R2 bucket durability controls are evidenced or gaps are formally accepted with compensating controls.
3. Vercel production environment and rollback/observability evidence is captured.
4. Alert delivery has a real provider, route, owner, and test evidence.
5. Operations Lead, Technical Lead, Data Protection Owner, and Safeguarding Lead sign off.

## Review Frequency

- Review this evidence request before each Phase 6B evidence collection cycle.
- Revalidate collected provider evidence quarterly and after any provider plan, region, bucket, database, deployment, or alerting change.

## Evidence Register

| Provider | Evidence Item | File/Link | Captured By | Captured At | Reviewed By | Result |
|---|---|---|---|---|---|---|
| Supabase | Project plan / billing tier |  |  |  |  | Pending |
| Supabase | Database backups page |  |  |  |  | Pending |
| Supabase | Last successful backup date/time |  |  |  |  | Pending |
| Supabase | Backup retention period |  |  |  |  | Pending |
| Supabase | PITR status |  |  |  |  | Pending |
| Supabase | Restore options/modal |  |  |  |  | Pending |
| Supabase | Region |  |  |  |  | Pending |
| Supabase | Backup export/log |  |  |  |  | Pending |
| Cloudflare R2 | Bucket name |  |  |  |  | Pending |
| Cloudflare R2 | Public access/domain setup |  |  |  |  | Pending |
| Cloudflare R2 | Versioning status |  |  |  |  | Pending |
| Cloudflare R2 | Replication status |  |  |  |  | Pending |
| Cloudflare R2 | Lifecycle rules |  |  |  |  | Pending |
| Cloudflare R2 | Bucket lock / immutability |  |  |  |  | Pending |
| Cloudflare R2 | Object list sample |  |  |  |  | Pending |
| Vercel | Project and production environment |  |  |  |  | Pending |
| Vercel | Production environment variable coverage |  |  |  |  | Pending |
| Vercel | Monitoring / observability settings |  |  |  |  | Pending |
| Vercel | Deployment rollback options |  |  |  |  | Pending |
| Vercel | Alert configuration |  |  |  |  | Pending |
| Alerting | Provider in use |  |  |  |  | Pending |
| Alerting | Sentry setup if used |  |  |  |  | Pending |
| Alerting | Slack/Teams routing |  |  |  |  | Pending |
| Alerting | PagerDuty/on-call routing if used |  |  |  |  | Pending |
| Alerting | Supabase alerts |  |  |  |  | Pending |
| Alerting | Cloudflare alerts |  |  |  |  | Pending |
| Alerting | Alert test evidence |  |  |  |  | Pending |
