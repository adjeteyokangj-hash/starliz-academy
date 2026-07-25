# Legal-review package — Controller/processor mapping (Decision pack 4)

Date: 2026-07-25  
Status: Preferred data-governance position locked by product owner — **pending solicitor and DPO review**  
Not formal legal advice.

## Purpose

Document a role-by-processing-purpose mapping for StarLiz’s mixed school and direct-to-parent model so counsel can validate contracts, privacy notices and rights-routing.

## Source documents

| Document | Path |
|---|---|
| Data Protection Policy | `/policies/data-protection` |
| Privacy Policy | `/privacy` |
| Safeguarding Policy | `/safeguarding-policy` |
| AI Use Policy | `/ai-use` |
| Locked facts | `CONTROLLER_MAPPING_FACTS` in `src/lib/policies/locked-facts.ts` |
| Checklist | `docs/PHASE6_LEGAL_REVIEW_CHECKLIST.md` |

## Locked preferred mapping (summary)

| Processing | Preferred role |
|---|---|
| School Day School records | School controller; StarLiz processor |
| Direct parent Short Learning | StarLiz controller |
| School-funded Short Learning | Split by purpose; normally school controller for education delivery |
| Day School AI Tutor delivery | School controller; StarLiz processor |
| Direct Short Learning AI Tutor | StarLiz controller |
| Platform security and audit | StarLiz controller |
| Billing and direct subscriptions | StarLiz controller |
| School human-support records | School controller; StarLiz processor |
| Direct Short Learning human support | StarLiz controller |
| Irreversibly anonymised analytics | Outside personal-data scope once genuinely anonymous |
| Safeguarding | Role determined by the specific decision and purpose |
| Suppliers | Determined contractually; not automatically all processors |

## Public wording locked

When a school provides StarLiz, the school/trust is normally controller for pupil/timetable/attendance/school-directed learning records and StarLiz processes on documented instructions. When a parent buys Short Learning directly, StarLiz is normally controller for that service. StarLiz may also be independent controller for security, legal compliance, fraud prevention, safeguarding incidents and direct consumer operations.

## Ask for solicitor / DPO

- Validate mapping against actual contracts and product flows.
- Confirm Article 28 DPA schedule contents for schools.
- Confirm school-funded Short Learning split is not mislabelled as joint control.
- Confirm rights-request routing and response timelines.
- Confirm supplier classification process and sub-processor authorisation for school data.
- Confirm safeguarding independent-controller trigger wording.

## Product note

Documentation and governance position only — no schema or workflow change in this pack.
