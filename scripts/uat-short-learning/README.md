# Short Learning UAT evidence guide



Manual UAT for Short Learning and dual staff portals. The checklist lives in [`../uat-short-learning-evidence.md`](../uat-short-learning-evidence.md).



## Evidence root



Store all artifacts under:



```

scripts/uat-short-learning-evidence/

├── auth/

├── school-admin/

├── shifts/

├── parent/

├── student/

└── launch/

```



Create subfolders as you capture evidence. Do not commit secrets (tokens, passwords, full session cookies).



## Naming



| Pattern | Use |

|---|---|

| `NN-short-description.png` | Screenshots (01, 02, … per section) |

| `NN-api-response.json` | Redacted API payloads (login landing, booking create/cancel) |

| `NN-notes.md` | Optional free-text when a screenshot alone is insufficient |



Match the checklist item paths in `uat-short-learning-evidence.md` when possible so reviewers can trace checklist → file.



## What to capture



- **Auth:** landing URL after login, portal mode cookie in devtools, login JSON `landingPath` / `schoolRole`.

- **School admin:** redirect for non-admin teacher, shift create/overlap error, bookings table row.

- **Shifts:** tutor presence state off-shift vs on-shift; blocked assign/accept vs success.

- **Parent:** entitlement gate, slot picker, honesty checkbox, cancel status in UI or network tab (no fee fields).

- **Student:** upcoming list, session shell title/copy for AI-led Short Learning.

- **Launch:** same staff user with `LAUNCH_ENABLE_SCHOOL_PORTAL` off vs on.



## Redaction



Before saving JSON or HAR:



- Remove `Set-Cookie` values and `Authorization` headers.

- Mask parent/student names and emails if sharing outside the team.



## Related automated tests



Pure unit tests (no database):



- `tests/portal_routing.test.ts` — staff landing and school-admin layout guard roles

- `tests/short_learning_booking_rules.test.ts` — booking windows, cancellation, durations, slot grid

- `tests/support_eligibility.test.ts` — AI-first human support gating

- `tests/short_learning_access.test.ts` — launch scope and duration guards

- `tests/tutor_shift_eligibility.test.ts` — shift overlap (DB shift eligibility skipped)



Run:



```bash

npm test

```



Or only Short Learning tests:



```bash

npx tsx --test tests/portal_routing.test.ts tests/short_learning_booking_rules.test.ts tests/support_eligibility.test.ts tests/short_learning_access.test.ts tests/tutor_shift_eligibility.test.ts

```


