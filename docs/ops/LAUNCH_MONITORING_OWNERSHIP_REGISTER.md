# Launch Monitoring & Backup Ownership Register

Status: Launch readiness remediation Phase 4 register
Date: 2026-07-26

Purpose: name operational owners and escalation contacts before GO.
Do not treat this as complete until every Owner and Escalation cell is filled for the target production environment.

## Application and platform

| Area | Owner | Escalation | Evidence / location | Status |
|---|---|---|---|---|
| Application logging | _TBD_ | _TBD_ | Hosting logs / log drain | Pending |
| Error tracking (Sentry/MONITORING_DSN) | _TBD_ | _TBD_ | `SENTRY_DSN` / `MONITORING_DSN` | Pending (env missing locally) |
| Database health | _TBD_ | _TBD_ | Supabase / Admin ops health | Pending |
| Stripe webhook failures | _TBD_ | _TBD_ | `docs/ops/WEBHOOK_MONITORING.md`, Admin monitoring | Pending until Stripe configured |
| OpenAI failures | _TBD_ | _TBD_ | Daytime generation telemetry / Admin SL review | Pending confirmation |
| Email failures | _TBD_ | _TBD_ | Resend dashboard / job logs | Pending confirmation |
| Cron failures | _TBD_ | _TBD_ | `JobRunLog`, Admin system health | Pending until cron green |
| Backup status | _TBD_ | _TBD_ | `docs/ops/BACKUP_AND_RESTORE.md` | Pending |
| Restore procedure drill | _TBD_ | _TBD_ | `docs/ops/BACKUP_AND_RESTORE.md` | Pending |
| Incident contacts | _TBD_ | _TBD_ | `docs/ops/INCIDENT_RESPONSE.md` | Pending |
| Rollback process | _TBD_ | _TBD_ | `docs/ops/ROLLBACK_PLAN.md` | Docs ready; ownership Pending |

## Launch-critical cron jobs

| Job | Schedule (vercel.json) | Owner | Success evidence |
|---|---|---|---|
| `tutor-presence-sweep` | `* * * * *` | _TBD_ | `JobRunLog` success |
| `short-learning-lifecycle` | `*/5 * * * *` | _TBD_ | `JobRunLog` success |
| `short-learning-reminders` | `*/10 * * * *` | _TBD_ | `JobRunLog` success |

## Sign-off

| Role | Name | Date | Signature |
|---|---|---|---|
| Engineering lead |  |  |  |
| Operations / on-call |  |  |  |
| Billing owner |  |  |  |
| Safeguarding lead (escalation awareness) |  |  |  |

Completion rule: Gate 6 Phase 4 monitoring ownership is green only when every Owner and Escalation cell above is filled and a restore drill evidence link is attached.