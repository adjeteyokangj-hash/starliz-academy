# Private original demonstrations

Original demonstration activities require real bounded video bytes, an accessible written alternative, source permissions and an honest limitation. Passing source-program checks alone does not satisfy this requirement. The receipt binds the recording to its child, activity, exact artifact and independent task. Editing the artifact or changing the independent task requires a matching demonstration.

The learner explicitly starts screen sharing or uploads their own video-only WebM. Browser recording stops at 45 seconds or 4 MiB. Local playback is a convenience check; the server accepts a recording only after the pinned gVisor media container fully decodes it. A file extension, MIME type or WebM signature alone is insufficient. Screen sharing never starts automatically. The manual operating-system chooser still needs an actual manual acceptance test; automated canvas fixtures do not verify it.

## Configuration

- `CODING_MEDIA_RUNNER_URL`: direct HTTPS origin of the existing isolated runner, or loopback HTTP for local verification. The existing Supabase text gateway remains unchanged and does not transport media.
- `CODING_RUNNER_SECRET`: existing server-only authenticated runner secret.
- `CODING_RUNNER_MEDIA_IMAGE`: exact reviewed digest from `src/lib/coding/learning/runtime-pins.json`, present on the runner and configured on the app. Build using `services/coding-runner/Dockerfile.media`; do not replace the Python or JavaScript teaching images.
- `CODING_DEMONSTRATION_SECRET`: stable, server-only random key of at least 32 characters. It signs receipts and derives child/object-specific encryption keys. Back it up securely. Changing it makes earlier receipts and recordings unreadable; key rotation needs an explicit preservation design.
- Existing Cloudflare R2 credentials/bucket: recordings are encrypted with AES-256-GCM before storage and are never returned as public object URLs. Authenticated app routes enforce ownership and decrypt bytes. No new bucket or paid host has been provisioned.
- `CODING_MEDIA_LOCAL=true`: explicit development/test-only encrypted local adapter. It is rejected in production and on Vercel. This adapter is not durable production object storage.

The separate decoder uses network isolation, a read-only filesystem, non-root identity, dropped capabilities, a bounded temporary filesystem, CPU/memory/process limits and a decoding deadline. These limits do not relax student-program execution limits. The endpoint shares the runner's authentication, nonce replay protection and concurrency bound.

## Verification scopes

`tests/coding_demonstration_browser.test.ts` records real synthetic canvas frames and checks local decoding, controls and responsive layout. It does **not** establish learner originality, screen-chooser acceptance, authentication or parent ownership.

`scripts/coding/verify-media-isolation.mjs` checks real isolated decoding and malformed/unauthenticated/replayed request rejection. `scripts/coding/verify-private-media.ts <actual-recorded-fixture.webm>` checks isolated decoding, encrypted local write/readback and foreign owner/activity rejection. Neither substitutes for authenticated upload and parent replay testing or a remote-storage round trip.

Authenticated release verification must additionally cover source/task changes, immutable saved versions, parent/foreign-child authorization, expired-subscription access to previously created work, real application demonstrations and actual remote storage. Keep failed attempts and report any checks not run. These media proofs do not establish curriculum completion or production readiness.
