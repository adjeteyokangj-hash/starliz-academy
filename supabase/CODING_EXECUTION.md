# Coding execution through Supabase — local review package

Local runner update: the real Docker/gVisor interpreter/isolation suite now passes in the existing Ubuntu WSL2 environment. See `docs/CODING_RUNNER_INVESTIGATION_2026-11-02.md` and its recorded evidence. The hosted Edge gateway and production runtime have not been deployed or verified end to end.

The application already uses the hosted Supabase Postgres database. The new `coding-execution` Edge Function is a backend-authenticated gateway to the dedicated isolated runner, not a Python interpreter or a place to evaluate learner JavaScript. No function has been deployed and no new Supabase secrets have been set.

Supabase's [hosted limits](https://supabase.com/docs/guides/functions/limits) specify 256MB memory, two seconds of CPU per request, and no Web Worker or Node VM API. [WebAssembly is supported](https://supabase.com/docs/guides/functions/wasm), but that does not establish that an arbitrary Python/JavaScript interpreter has enforceable per-job isolation and interruption. A WASM execution backend would require its own reviewed interpreter, import boundary, resource controls and real hostile-program tests. The present implementation makes no such claim.

## Connection design

StarLiz backend → Supabase Edge gateway → private HTTPS isolated runner → ephemeral gVisor container.

The application uses `CODING_RUNNER_URL=https://<project-ref>.supabase.co/functions/v1/coding-execution` and its independent `CODING_RUNNER_SECRET`. The function requires `CODING_ISOLATED_RUNNER_URL=https://<reviewed-runner-host>` and the matching secret. No values are supplied in source control. The gateway does not use the Supabase service-role key, execute SQL, evaluate learner source or forward incoming cookies/Authorization headers.

The function has `verify_jwt=false` because existing StarLiz sessions are not Supabase Auth JWTs. This does **not** mean anonymous execution: the handler checks the HMAC, timestamp, nonce format, method, path and request size before forwarding. The downstream runner rejects nonce reuse and validates jobs. Its signed result remains bound to the original request and is verified by the application. Gateway-generated errors are unsigned and therefore fail closed in the client. Private runner ingress and TLS must be configured independently; the gateway cannot make a missing runtime host available.

## Remaining verification and approval

- Run `node --test tests/coding_supabase_gateway.test.mjs` for transport unit tests. These inject an upstream response and do not execute learner programs.
- Review the function bundle/import compatibility in the actual Supabase Edge runtime. No local Deno/hosted Edge verification has been claimed.
- Identify a maintained Linux execution host with reviewed gVisor and immutable language images; run the real container isolation suite described in `services/coding-runner/README.md`.
- Exercise signed request/result transport end to end through Supabase, nonce replay rejection, route handling, quotas, timeouts, outages and concurrent requests.
- Obtain deployment approval before deploying the function or configuring hosted secrets. No migration is required for this transport gateway.

Until the remaining hosted checks pass, Python/JavaScript/SQL learner publication remains blocked by production/runtime integration verification. Supabase remains the gateway rather than the interpreter host in this architecture; local interpreter tests now have a working Linux engine.
