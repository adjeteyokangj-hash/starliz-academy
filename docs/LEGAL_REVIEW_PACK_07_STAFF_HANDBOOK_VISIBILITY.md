# Legal-review package — Staff handbook visibility (Decision pack 7)

Date: 2026-07-25  
Status: Locked by product owner  
Safeguarding **content** remains pending focused DSL/legal review.

## Purpose

Keep operational staff handbooks and runbooks authenticated-only, while public legal and product policies stay on the public Policies hub.

## Source documents

| Document | Path |
|---|---|
| Staff docs | `src/lib/policies/content/staff-docs.ts` (`publicVisible: false`) |
| Locked facts | `STAFF_HANDBOOK_VISIBILITY_FACTS` |
| Admin library | `/admin/policy-library` (+ `/[slug]`) |
| School Admin library | `/school-admin/knowledge-library` (+ `/[slug]`) |
| Public hub | `/policies` — legal + product groups only |

## Locked commercial position

| Area | Decision |
|---|---|
| Staff handbooks / runbooks | **Authenticated-only** (not on public hub) |
| Public legal + product policies | Remain public |
| Platform operators | `/admin/policy-library` |
| School operators / tutors | `/school-admin/knowledge-library` (audience-filtered) |
| Safeguarding wording | **Not** commercially finalised — focused DSL/legal review still required |

## Explicit non-claims

- That hiding staff runbooks constitutes a completed safeguarding policy review
- That public absence of a handbook means the operational rule does not exist for staff

## Product note

Public `/policies/{staff-slug}` returns not found for staff-only docs. Authenticated libraries render the same code-managed content.
