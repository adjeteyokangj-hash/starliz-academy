# Launch verification guide

Developer guide for supported launch verification, Prisma local helpers, focused typechecks, and evidence policy.

**Safety:** Never run `prisma migrate reset` (or any wipe/truncate/reseed) on the working launch database. Never commit secrets. Do not stage/commit until the Product Owner requests it.

---

## Permanent npm scripts

| Command | Purpose |
|---|---|
| `npm test` | Full unit/integration suite including Phase 6 + Short Learning |
| `npm run test:phase6-policies` | Policy registry / locked commercial wording |
| `npm run typecheck:launch-modules` | Focused TypeScript check for launch-critical modules |
| `npm run verify:short-learning-cron` | Cron schedule + auth verification |
| `npm run uat:short-learning` | Authenticated Short Learning / portal UAT |
| `npm run uat:admin-portal` | Admin portal launch smoke UAT |
| `npm run prisma:local:generate` | Prisma generate with `.env.local` |
| `npm run prisma:local:studio` | Prisma Studio with `.env.local` |
| `npm run prisma:local:pull` | Prisma db pull with `.env.local` |
| `npm run smoke:routes` | Public route smoke |

---

## Focused typecheck

Use the single permanent config:

```bash
npx tsc -p tsconfig.launch-modules.json --noEmit
```

or:

```bash
npm run typecheck:launch-modules
```

The older one-off configs (`tsconfig.human-support.json`, `tsconfig.human-tutor-sessions.json`, `tsconfig.live-classroom.json`, `tsconfig.school-ai-tutor.json`, `tsconfig.weekly-memory.json`) are **obsolete candidates** superseded by `tsconfig.launch-modules.json`. They are retained until the launch tree-trim deletes them.

---

## Prisma local helper

**Supported script:** `scripts/prisma_local.mjs` (wired as `prisma:local:*`).

Loads `.env.local`, validates `DATABASE_URL` presence/shape **without printing secrets**, sets `DIRECT_URL` when needed, then runs Prisma.

**Obsolete duplicate:** `scripts/_prisma-with-env.js` — same job, less validation, not referenced by `package.json`. Do not use for new work.

**Forbidden:** `prisma migrate reset` on the launch database.

---

## Evidence policy

| Kind | Location | Git |
|---|---|---|
| Permanent summaries | `docs/assurance/**` | Commit |
| Legal packs / decision register | `docs/LEGAL_*`, `docs/UK_LAUNCH_*`, `docs/PHASE6_*` | Commit |
| Generated bulky UAT captures | `artifacts/uat/**` | **Ignored** (regenerate) |
| Screenshots | `artifacts/screenshots/**` | **Ignored** |
| Historical `scripts/uat-*-evidence/**`, `scripts/.uat-*.json` | Obsolete path | Exclude from launch commit unless curated |

Regenerate summaries:

```bash
npm run uat:short-learning
npm run verify:short-learning-cron
npm run uat:admin-portal
```

---

## Environment variables (names only)

| Name | Used by |
|---|---|
| `DATABASE_URL` | Prisma / app |
| `DIRECT_URL` | Prisma (optional; defaults from DATABASE_URL) |
| `CRON_SECRET` | Cron auth + live verify |
| `UAT_BASE_URL` | UAT runners (default `http://localhost:3000`) |
| `UAT_ADMIN_EMAIL` / `UAT_ADMIN_PASSWORD` | UAT fixtures override |
| `UAT_SCHOOL_ADMIN_EMAIL` / `UAT_SCHOOL_ADMIN_PASSWORD` | UAT fixtures override |
| `UAT_STUDENT_PARENT_EMAIL` / `UAT_STUDENT_PARENT_PASSWORD` | UAT fixtures override |
| `UAT_LIVE_TEACHER_EMAIL` / `UAT_LIVE_TEACHER_PASSWORD` | UAT fixtures override |

`.env`, `.env.local`, `.env.production` must stay ignored. Fixture defaults for local UAT accounts live in `scripts/uat/local-fixtures.ts` (non-production only).

---

## Phase 6 policy generator

`scripts/generate-phase6-policies.mjs` can overwrite hand-locked commercial policy content. **Do not run** without an LD-### change-control decision and pack bump.

---

## Known runtime limitations

### Platform admin auth gate (App Router is authoritative)

**Authoritative gate:** `/admin/**` (except login) is protected by the App Router route group `src/app/admin/(secure)/layout.tsx`. Anonymous visits redirect server-side to `/admin/login` before the console renders. Login lives structurally outside that layout at `(public)/login`.

**Request interceptor limitation (Next.js 16.2.7 local):** root `middleware.ts` compiles and registers a matcher, but in current local Turbopack/webpack runs it has been observed **not to apply** on the wire (no `Location` / `X-Frame-Options` on responses). Treat this as a runtime limitation, not a product blocker: layout redirect is the launch-safe gate. Focused coverage: `tests/admin_auth_gate.test.ts` (plus Phase 6 / portal routing suite).

Keep the admin auth redirect fix as an **uncommitted post-checkpoint launch bug fix** until the Product Owner requests a separate commit.

---

## Related docs

- [`docs/assurance/README.md`](./assurance/README.md)
- [`docs/UK_LAUNCH_DECISIONS.md`](./UK_LAUNCH_DECISIONS.md)
- [`docs/PHASE6_LEGAL_REVIEW_HANDOVER.md`](./PHASE6_LEGAL_REVIEW_HANDOVER.md)
- [`docs/TEMP_FILE_CLASSIFICATION.md`](./TEMP_FILE_CLASSIFICATION.md)
