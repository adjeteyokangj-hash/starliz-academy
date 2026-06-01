# Backup and Restore

Status: Draft runbook.

## Backup Expectations
- Production Postgres backups run on schedule with encrypted storage.
- Retention policy aligned with legal and safeguarding requirements.
- Backup integrity checks logged and reviewed.

## Restore Test Process
1. Request restore-test approval from engineering lead and data owner.
2. Restore into isolated non-production environment.
3. Validate schema, auth, and key data integrity checks.
4. Verify child data remains access-restricted in restore test.
5. Record restore test outcome and corrective actions.

## Approval and Authority
- Restore execution requires explicit approver list.
- Emergency restore requires incident commander sign-off.

## Child Data Protection in Restore
- Restrict restore test access to approved staff.
- Avoid broad exports from restore environment.
- Clean up restore environments after verification.
