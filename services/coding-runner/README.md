# Dedicated Coding execution runner

Supabase gateway support is prepared locally in [the Supabase review package](../../supabase/CODING_EXECUTION.md). It preserves this runner's isolation boundary and signed protocol. It does not remove the separate Linux runtime requirement or establish real interpreter verification.

This is the isolated execution-service integration for StarLiz Coding. It runs actual Python, JavaScript and SQL in per-job containers. It is not a deployment, a replacement interpreter or a declaration that the corresponding courses are complete.

The StarLiz Next.js application imports only the signed HTTP client and protocol. It must not receive a Docker socket or run learner programs in its own process. The broker lives on a dedicated Linux runtime host without StarLiz database credentials, application files or learner storage.

## Host requirements

- A maintained Linux execution host and Docker engine with effective CPU, memory, swap and process limits.
- The reviewed gVisor `runsc` runtime registered with Docker. Production mode refuses a native-runc configuration. Follow the official [Docker quick start](https://gvisor.dev/docs/user_guide/quick_start/docker/) and review gVisor's [security model](https://gvisor.dev/docs/architecture_guide/security/). A sandbox reduces exposure; it is not an absolute security guarantee.
- Reviewed Python and Node images, installed ahead of time and pinned by immutable digest. Python must include standard-library `sqlite3`. Execution uses `--pull=never`; jobs cannot choose, download or change images.
- TLS termination for remote access, private ingress limited to the application backend, a unique shared secret and a managed service supervisor. Do not expose this broker as a public unauthenticated code playground.
- Host-level monitoring/reaping of expired `starliz-coding-<UUID>` jobs if the broker or host fails. Job cleanup and crash recovery must be exercised on the real host before release. No application/user volumes may be mounted.

Docker Desktop's engine was unavailable. A separate Docker Engine was subsequently installed in the existing Ubuntu WSL2 distribution with checksum-verified gVisor `release-20261026.0`. The final real interpreter/isolation suite passed locally (run `77c15fe6-a3f3-4aed-9415-6595e96154c2`); evidence is in `artifacts/coding-runner/77c15fe6-a3f3-4aed-9415-6595e96154c2.jsonl`. This is local evidence, not a deployed hosted runner or a production reliability claim. Earlier passing evidence, WSL connection failures and an initial container-preparation timeout were retained.

## Configuration

Use the variable names in [.env.example](.env.example). Generate an independent secret of at least 32 random bytes; do not reuse the application authentication secret. Keep it in server-side environment configuration only. Set the Python and JavaScript image variables to reviewed `repository@sha256:<digest>` values. SQL uses the Python image's isolated in-memory SQLite implementation.

The runner defaults to `CODING_RUNNER_MODE=production`, `CODING_RUNNER_CONTAINER_RUNTIME=runsc` and loopback binding. Only an explicit development mode permits `runc`; that mode is not release security evidence. A deployment must configure the reviewed host, TLS/private ingress and service lifecycle separately. No such deployment has been performed.

From the repository root on the reviewed runner host, with environment variables provided by the service manager:

```sh
node services/coding-runner/server.mjs
```

On the StarLiz backend, set `CODING_RUNNER_URL` to the private HTTPS endpoint and `CODING_RUNNER_SECRET` to the matching service secret. Loopback HTTP is permitted only for local development. No `NEXT_PUBLIC_` variable is used. The admin execution API checks `MANAGE_SETTINGS` for health and `MANAGE_CONTENT` for preview execution. It has a per-administrator execution rate limit. No generic student execution endpoint is enabled by this integration.

## Protocol and limits

Requests bind method, path, timestamp, UUID nonce and the exact body hash to an HMAC signature. Requests outside a 30-second clock window or with a reused nonce are rejected. The broker accepts only a supported language, source, stdin and bounded time budget; client-controlled commands, image names, mounts, privileges and environment variables are rejected. Responses bind the result to the nonce and original request body. The backend verifies the response and matching job/language before accepting it.

Current limits are 64KiB source, 8KiB input, 96KiB encoded request, 32KiB combined stdout/stderr, a maximum five-second student execution deadline, two concurrent jobs, 128MiB RAM with no additional swap, 0.5 CPU and 32 host processes. Guest RLIMIT_NPROC is two for Python/SQL and eight for Node (including interpreter threads), with 128 file descriptors. The tighter guest limit prevents bounded Python fork pressure from exhausting gVisor runtime tasks before a clean process-denial result. Stopped-container preparation and trusted interpreter startup each have a separate ten-second infrastructure deadline; inspection and cleanup each have a five-second deadline. A fixed bootstrap readiness marker is consumed before any student source is sent. Startup delays therefore do not consume the student's execution allowance. The application allows these bounded phases in addition to the code budget; the preserved gateway uses a 44-second upstream timeout. Containers use a non-root UID, read-only root, bounded temporary filesystem, no network, dropped capabilities and no-new-privileges. Docker [resource constraints](https://docs.docker.com/engine/containers/resource_constraints/) and [container runtime options](https://docs.docker.com/engine/containers/run/) explain the controls. The completed local suite verifies memory, time, output and access boundaries. Local bounded Python process stress and host cgroup CPU quota/throttling checks passed in `artifacts/coding-runner/resources-e5ef86ee-6d71-4f90-9134-79db04d12ee9.jsonl`; earlier failures remain retained. This evidence is local, and the production host still needs its own verification. JavaScript process denial, subsequent-job health and asynchronous-file execution passed in `artifacts/coding-runner/javascript-resources-6f7b1777-3fb6-4e05-a351-405118838517.jsonl`. Node uses `UV_THREADPOOL_SIZE=1` so actual asynchronous filesystem calls fit its guest thread budget; see the [Node CLI documentation](https://nodejs.org/download/release/v22.23.0/docs/api/cli.html#uv_threadpool_sizesize). Actual broker-crash, lease-preservation, scoped expired-job cleanup and signed recovery passed in `artifacts/coding-runner/crash-c4ab2cd6-3e3a-439d-8e9d-567afda6bda2.jsonl`.

Student code and supplied test inputs enter the container; expected answers, application cookies, database credentials and the runner secret do not. SQL executes against a new in-memory database with only supplied synthetic setup data; extension loading and attached databases are disabled. Python and JavaScript receive no application filesystem or network authority. Source and outputs are not written to broker logs.

Infrastructure failures are separate from wrong answers. A failed runtime startup, signature failure, missing image, invalid result or failed cleanup must not count as a learner assessment failure. There is no host-process fallback. Timeouts and output-budget failures require successful cleanup before being reported as such; uncertainty is reported as infrastructure failure.

## Verification

The Windows author-verification script also supports `CODING_RUNNER_PERSISTENT_TEST_TRANSPORT=1` alongside `CODING_RUNNER_CONTAINER_TESTS=1`. This reuses a private Linux stdin/stdout test broker, while each submitted program still runs in a separate pinned `runsc` container with the same execution limits. It opens no listener and receives no application environment or credentials. Actual Python/JavaScript jobs and filesystem separation passed in `artifacts/coding-runner/stream-a05fbbf8-35a6-4071-a6e2-692b3e19ed10/`. This is test-transport evidence; production gateway authentication remains a separate verification requirement. The original per-job test transport remains available.

The source test pipe is initialised only when an actual source program is submitted. Trusted native workbenches can therefore be verified without starting Linux; that does not count as interpreter or isolation evidence. Explicit `--author-drafts --activity=…` selections can exercise unpublished author packages, but cannot seal a release. Unknown activity identifiers fail before any practical job starts. Interrupted checks produce an incomplete report and do not count unfinished activities as verified.

Test-transport JSONL diagnostics use an `event` field and `sourceExecutionVerified:false`. They record bounded categories, exit status and deadlines, never raw host diagnostics or configuration. Null-separated Windows resource failures are distinguished from missing entrypoints. Diagnostic events are not execution results; actual source results still require matching job, language, pinned image digest and `runsc` evidence. A normal transport-close event records shutdown, not an additional executed job.

Protocol and argument-construction tests, without learner execution:

```sh
node --test tests/coding_runner.test.mjs
```

Real engine and isolation tests on the dedicated test host, with reviewed pinned-image variables set:

```sh
CODING_RUNNER_CONTAINER_TESTS=1 node --test tests/coding_runner_containers.test.mjs
```

The integration suite runs actual Python/JavaScript input/output and syntax failures, SQL query fixtures, secret exclusion, root-filesystem denial, a host canary boundary, infinite loops, memory exhaustion, egress denial (including a metadata address), output limits, parallel jobs, and signed HTTP requests with replay rejection and admission control. Without the explicit container-test flag it reports a skip, not a pass. The host must additionally verify CPU/PID stress enforcement, kernel/runtime hardening, cleanup races, request cancellation, sustained load, broker-crash recovery and every lesson's language compatibility before production release.

The `systemd/` files are review templates, not installed services. `reap-expired.mjs` removes only containers carrying the exact runner ownership/job/expiry labels and generated name; it never runs Docker prune. The local post-suite reaper found no residual containers. Docker group membership grants control of the dedicated execution host: do not put application secrets or family files on that host. Service account creation, protected environment file, TLS/private ingress, monitoring and supervisor/reaper enablement remain deployment work requiring approval.

Text lessons still need individually authored references, seeded faults, assessor-held inputs, misconception guidance, independent variations and complete learner journeys. The runner supplies execution; it cannot supply curriculum mastery merely because a process exits successfully.
