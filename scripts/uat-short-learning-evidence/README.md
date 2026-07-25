# Short Learning UAT evidence (scaffold)

Authenticated browser UAT with screenshots was **not executed in this implementation pass** (no interactive login session / Playwright run against live portals).

Use this checklist when running UAT:

## School Admin
- [ ] Lands in `/school-admin`
- [ ] Short Learning overview + forecast/coverage/shifts
- [ ] Creates + publishes tutor shift
- Evidence: `scripts/uat-short-learning-evidence/school-admin/`

## Tutor
- [ ] Login before shift → OFF SHIFT / cannot AVAILABLE
- [ ] On shift + heartbeat → can AVAILABLE
- [ ] Accept eligible student; grace at shift end
- Evidence: `scripts/uat-short-learning-evidence/shifts/`

## Parent
- [ ] Book weekday with honesty checkbox
- [ ] Cancel with no charge
- [ ] Weekend + late-with-capacity
- Evidence: `scripts/uat-short-learning-evidence/parent/`

## Student
- [ ] Enter valid booking; AI continues without tutor
- [ ] Escalation only when tutor eligible
- Evidence: `scripts/uat-short-learning-evidence/student/`

Screenshots (when captured) should land under the same folders as `*.png`.
