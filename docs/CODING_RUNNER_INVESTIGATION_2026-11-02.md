# Coding runner investigation and implementation — 2 November 2026

## Result

**The real local Python/JavaScript isolation suite passed using the existing Ubuntu WSL2 environment. No paid server was purchased or provisioned.** The runner is locally verifiable; it is not deployed or connected to the hosted Supabase gateway. Coding as a whole remains incomplete and is not release-ready.

## Existing infrastructure investigated

| Environment | Evidence | Suitability / cost conclusion |
| --- | --- | --- |
| Vercel web application | `vercel.json`, `.vercel/repo.json`, README and operational documents identify `starliz-academy`. | Keep the application separate from untrusted execution. No existing persistent Docker host was identified in this configuration. |
| Supabase | Existing hosted Postgres and prepared Edge gateway. | Database and gateway remain in their intended roles. Neither runs learner source directly. No gateway rebuild, deployment or secret configuration occurred; its upstream timeout was adjusted to allow bounded runner preparation. |
| Cloudflare R2 | Storage configuration and operational documents. | Object storage, not evidence of an available Linux execution host. |
| Fly.io | Installed CLI was authenticated; read-only application listing returned an empty array. | No existing Fly application/machine was identified to reuse. No resource was created or started there. |
| SSH / other configured compute | Inspected hosting configuration, relevant environment-key presence, workflows and available CLI tools; no configured runner endpoint or SSH target was found. | This is a scoped configuration investigation, not proof that the owner has no other cloud resources. |
| GitHub Actions | Existing CI runs on `ubuntu-latest`. | Potential verification environment within the account's existing allowance. It is not an always-on learner execution service; no workflow was dispatched, committed or pushed. |
| Local Ubuntu WSL2 | Existing stopped Ubuntu distribution; Linux `6.18.33.1-microsoft-standard-WSL2`, cgroup v2 with CPU/memory/PID controllers. | Reused for real local tests without recurring hosting charges. Windows has about 8GB physical RAM and showed substantial memory pressure; WSL connection reliability was poor during setup. This workstation is not established as a production host. |

Vercel also offers a separate [Sandbox service](https://vercel.com/docs/sandbox) using isolated microVMs. Its [current pricing](https://vercel.com/docs/sandbox/pricing) includes a bounded Hobby allowance; Pro usage consumes the plan's credit and can incur usage charges. Existing plan, unused credit, commercial eligibility and workload costs have **not** been verified. This is an alternative to investigate before renting a separate server, not a claim of free production hosting or an implemented backend. No Sandbox was created.

**A separately rented Linux server has not been shown to be necessary.** A reliable production execution environment is necessary, but reuse, managed sandbox capacity and account allowances must be established before selecting paid infrastructure. Local verification no longer depends on buying a server.

## Local environment and runner changes

- Installed Docker Engine `29.1.3`, Node.js `22.22.1` and required packages in the existing Ubuntu distribution. No packages were removed. This modified local development tooling, not the hosted application/database.
- Downloaded gVisor from its [official release source](https://gvisor.dev/docs/user_guide/install/), verified SHA-512 and installed `release-20261026.0` in a new test-only directory. Registered the `runsc` runtime with `systrap` in the fresh Ubuntu Docker engine; existing Docker Desktop configuration was not overwritten.
- Downloaded official language images and resolved immutable digests before execution. Python: `python@sha256:b18b261e1b4974b4f321451ad5251ded85abb22c2b8b262da527dda1d031ab30`. JavaScript: `node@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da`.
- Separated the ten-second stopped-container preparation deadline from the maximum five-second execution/start deadline. Cleanup is bounded to five seconds. A failed setup/cleanup is an infrastructure failure, never a learner assessment failure. The client/gateway deadlines accommodate these phases. After an upload completes, the broker's HTTP idle deadline also switches from five to 24 seconds; a dedicated regression verifies that bounded preparation does not lose its signed response after five seconds.
- Preserved HMAC-bound requests/results, nonce replay rejection, exact job/language/version checks, strict input limits, two-job admission control, 128MiB memory/no extra swap, 0.5 CPU, bounded processes/output, non-root user, read-only root, no host mounts, no network and no application secrets.
- Added ownership/job/expiry labels, narrowly scoped expiry cleanup and reviewable systemd broker/reaper templates. No production service was installed or enabled. The post-suite cleanup inspection found zero residual labelled containers.
- Local setup/verification scripts are in `scripts/coding/`. The scripts configuring Ubuntu refuse to overwrite an existing Docker configuration or gVisor test directory. They are local tooling, not production installers.

## Actual isolation evidence

The final real Linux suite passed in **28.08 seconds** (one integration test containing the scenarios below), after the HTTP deadline correction. It used actual Docker/gVisor containers, actual language interpreters and actual HTTP requests; it did not inject a mock executor. An earlier successful run took 35.37 seconds and remains preserved separately.

Final evidence: `artifacts/coding-runner/77c15fe6-a3f3-4aed-9415-6595e96154c2.jsonl`. Each execution records its source hash, job ID, language, immutable image digest, runtime, output, exit status and duration. The final `suitePassed: true` record exists only after every assertion succeeds. The accompanying `verification-77c15fe6-a3f3-4aed-9415-6595e96154c2.json` records source-file hashes and **19 real container executions**: 12 completed, four intentional runtime errors, two intentional timeouts and one intentional output-limit stop. Post-run expiry inspection again found zero residual containers.

| Scenario | Observed result |
| --- | --- |
| Python input/output | `CODING` printed; exit 0 |
| JavaScript input/output | `12` printed; exit 0 |
| Python and JavaScript syntax errors | Actual `SyntaxError` diagnostics; nonzero interpreter exit |
| Python and JavaScript infinite loops | Both stopped with `timeout`; cleanup succeeded |
| Python and JavaScript memory exhaustion | Both terminated with exit 137 and `runtime-error`; infrastructure errors cannot satisfy this assertion |
| Root filesystem writes | Denied in both languages |
| Host-file boundary | Fresh host canary could not be read from the container |
| Application secrets | Neither language received database/runner secrets |
| External network | Both languages denied external access; Python also denied the metadata address |
| Output flooding | Stopped with `output-limit`; cleanup succeeded |
| Parallel language jobs | Distinct outputs, no cross-job contamination |
| Real signed broker execution | Python returned `42`; response HMAC verified; reused nonce rejected |
| Concurrent HTTP requests | Python and JavaScript requests completed and signed results verified; a third request was rejected by admission control |
| SQL regression | Actual isolated SQLite query returned the expected synthetic fixture row |

An earlier real attempt failed during stopped-container creation under the old deadline (`8c1852f3-1a89-4d77-b8b5-fa091a33ff98.jsonl`). Subsequent WSL service connection failures did not run the suite. They are failures/setup limitations, not passes. CPU and PID limits are configured and asserted at command construction; independent stress verification of those controls remains outstanding.

## Curriculum and interface progress

The approved scope remains **264 core lessons, 132 consolidation sessions and 44 portfolio projects across five pathways**. One existing lesson remains published; six First Instructions packages remain administrator-only executable drafts. No pathway is being marked complete and no other lab has been started.

This continuation added explicit destination predictions with server checks against the supplied sequence, keyboard-accessible prediction controls, selectable independent route challenges with assessor-held checks, and correct map display for those variants. Reference programs alone cannot pass the prediction activity. These changes do not manufacture learner mastery or publish unfinished lessons.

Parent mastery snapshots now preserve the assessed target alongside the program. Later challenge changes cannot change how that saved project is replayed. Legacy snapshots remain readable without inventing missing assessment metadata. No existing records were rewritten for this change.

## Verification and remaining release gates

- 48 focused Coding lesson/editor/completion/curriculum/prediction/project-evidence tests passed.
- Nine final runner protocol/gateway/reaper unit checks passed; these are separately labelled from real runtime evidence.
- Three signed backend client tests passed after the deadline change.
- Focused Coding TypeScript checks and lint passed.
- The authenticated learner journey and default-off administration checks passed in the full run recorded at `artifacts/coding-authenticated-uat/coding-qa-mvzmkudb-06d408.json`, including a real model-backed tutor response. That run's draft-preview check failed on a development-server JSON parsing error.
- After correcting accessible prediction labels and the test's ambiguous option selection, the six-draft API/mobile journey passed separately in **55.5 seconds**. Evidence: `artifacts/coding-authenticated-uat/coding-qa-mvzmyf45-88a45a.json`; screenshot: `artifacts/coding-first-instructions-preview.png`. It verifies all six stage-reference/fault checks, independent variants, missing prediction rejection, hidden-case withholding, mobile editing, trace playback, prediction input and independent challenge execution without horizontal overflow. These are passes across separate runs, not a claim that the initial three-test run passed completely.
- Failed browser/setup runs remain recorded. The required Playwright browser download was interrupted when extraction stalled; the passing check used the existing stable Microsoft Edge in headless mode. No installed Chrome/Edge browser was replaced.
- A shipped-application type check initially failed on malformed generated `.next/dev/types` files. Those generated files were preserved under `tmp/coding-dev-types-20261102`, the owned development server was stopped and `next typegen` regenerated route metadata successfully. Both the shipped-application type check (`tsconfig.build.json`) and final focused Coding type check then passed. No original source/data was deleted to repair the cache. A production build has not been established.
- No migration/reset, deletion of original learner data, commit, push or deployment occurred. Authenticated UAT uses new labelled QA records; those records are retained and QA administrators are disabled afterward.

Production still needs an approved hosting choice and credentials/ingress configuration, end-to-end hosted gateway transport verification, effective CPU/PID stress tests, sustained load and crash recovery checks, TLS/firewall/service hardening and operational ownership. The systemd templates and passing local suite do not establish those deployment properties.

Curriculum still needs complete learner AI/save/resume/mastery/portfolio integration for the drafts, educational/accessibility review, and the remaining authored activities/projects. Full application production build, school/tenant combinations and all five pathway journeys remain release gates. A functioning runner removes an execution dependency; it does not complete the curriculum.
