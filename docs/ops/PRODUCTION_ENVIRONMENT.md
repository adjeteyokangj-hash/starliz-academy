# Production Environment

Status: Operational guidance draft for launch readiness.

## Objectives
- Keep production isolated from staging and local development.
- Protect child and parent data with strict access and logging controls.
- Enable safe observability without exposing secrets.

## Baseline Requirements
- Dedicated production database and credentials.
- Separate production environment variables.
- Auth, payment, and webhook secrets only in production secret store.
- No demo/test seeded records in production datasets.

## Runtime Controls
- Health endpoint returns safe metadata only.
- Sensitive logs must pass redaction helper before emit.
- Webhook and cron failure summary reviewed daily.

## Access Controls
- Production access follows least privilege.
- Admin and operations actions audited.
- Emergency access approvals documented in incident runbook.

## Manual Review Required
- Final production hosting/network policies.
- On-call rotation ownership.
- Data processing agreement references.
