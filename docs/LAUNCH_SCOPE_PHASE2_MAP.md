# StarLiz Launch Scope Map (Phase 2)

## Launch-Ready
- UK public landing and pricing flows (`/uk`, `/pricing`, `/contact`, `/auth/login`, `/signup`)
- Parent core journey (`/parent/dashboard`, `/parent/profiles`, child selection and profile surfaces)
- Student core dashboard and daily learning journey (`/student/dashboard`, game/lesson routes)
- Admin operational core (`/admin`, `/admin/parents`, `/admin/students`, `/admin/content-library`, `/admin/assignments`, `/admin/reports`)

## Beta / Behind Flag
- Teacher and school portal routes (`/teacher/**`, `/school/**`) behind `LAUNCH_ENABLE_SCHOOL_PORTAL`
- Public roadmap links behind `NEXT_PUBLIC_LAUNCH_ENABLE_ROADMAP`
- Public trial CTA links behind `NEXT_PUBLIC_LAUNCH_ENABLE_PUBLIC_TRIAL_CTA`
- Student certificate center visibility behind `NEXT_PUBLIC_LAUNCH_ENABLE_STUDENT_CERTIFICATES`
- Admin beta modules are still reachable for admins and labelled in navigation:
  - `/admin/knowledge-graph`
  - `/admin/recovery-governance`
  - `/admin/ai`
  - `/admin/trial-leads`
  - `/admin/voice-media`
  - `/admin/integrations/truenumeris`

## Admin-Only
- All `/admin/**` routes (middleware role-enforced)
- AI generation APIs and consoles (`/admin/ai`, `/admin/ai-generator`, `/api/admin/ai/**`)

## Hidden From Normal Users
- School/teacher unfinished areas are redirected away from parent/student when school portal launch flag is off
- Student certificate center hidden by default until launch flag is turned on
- Public roadmap/trial CTA hidden by default in navigation

## Coming Soon
- Ghana and Nigeria public pathways remain coming soon (`/ghana`, `/nigeria`)
- Country profiles continue to mark Ghana/Nigeria as coming soon and payment-disabled

## Needs Review Before Production
- Teacher and school operations/governance pages when `LAUNCH_ENABLE_SCHOOL_PORTAL` is eventually enabled
- Student certificate issuing flow before setting `NEXT_PUBLIC_LAUNCH_ENABLE_STUDENT_CERTIFICATES=true`
- Public trial funnel before setting `NEXT_PUBLIC_LAUNCH_ENABLE_PUBLIC_TRIAL_CTA=true`
