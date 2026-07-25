# Legal-review package — Data retention (Decision pack 3)

Date: 2026-07-25  
Status: Commercial retention schedule locked by product owner — **pending solicitor and DPO review**  
Not formal legal advice.

## Purpose

Document justified retention categories for UK launch so counsel/DPO can validate periods, school-processor interactions, and safeguarding carve-outs.

## Source documents

| Document | Path |
|---|---|
| Data Retention Policy | `/data-retention` |
| Data Protection Policy | `/policies/data-protection` |
| Locked facts | `RETENTION_COMMERCIAL_FACTS` in `src/lib/policies/locked-facts.ts` |
| Checklist | `docs/PHASE6_LEGAL_REVIEW_CHECKLIST.md` |

## Locked commercial rules

1. Justify, document, review regularly; delete or irreversibly anonymise when no longer needed; minimise children's data.
2. **School-controlled records:** school schedule and instructions take priority; StarLiz will not independently shorten/extend without authority.
3. Day School attendance/lesson records for schools: school schedule; no independent StarLiz deletion without instruction.
4. Official pupil-record “to 25th birthday” guidance does **not** automatically apply to every StarLiz learning interaction — depends on controller mapping (still open).
5. **Safeguarding:** no short automatic deletion; retain under safeguarding schedule + controller instructions with necessity review.
6. Legal hold / fraud / complaint / litigation pauses deletion for affected records only.
7. Full numeric schedule as in the Data Retention Policy (accounts, bookings, AI chats, shifts, finance 6 years from FY end, logs, backups 90 days, etc.).
8. Operations: retention register, automated deletion/anonymisation where practical, annual review, deletion logs, backup expiry, legal-hold controls, separate D2C vs school records.
9. Phase 6 locks **policy wording only** — does not implement purge jobs.

## Ask for solicitor / DPO

- Validate each category’s necessity and storage limitation justification.
- Confirm school-processor instruction wording.
- Confirm safeguarding retention presentation.
- Confirm financial 6-year FY-end approach against company record duties.
- Confirm anonymisation standard for AI analytics.

## Still open (owner)

- Final controller vs processor mapping per contract type.
