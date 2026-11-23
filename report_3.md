# PROJECT PROGRESS REPORT

**Project title:** SAMT - Su Əməliyyatlarının Mərkəzləşdirilmiş Təhlili  
**Student name:** Elmaddin Mohubbatov  
**Group / Team name:** Group 550RI-I / Team SAMT  
**Course Instructor:** Ms. Fidan Asgarova  
**Date:** November 23, 2026 (Asia/Baku)  
**Report number:** 3 / 4  
**Implemented Version & Revision:** `SAMT v1.1.0` on branch `feat/samt-v1.1.0` (baseline `main` at `4667e5dc21d5216505e9dbfeb9b4a11634fad158`)

---

## 1. Completed Tasks

Report 2 (`v1.0.1`) established the browser-only TypeScript domain modules, initial contract drafts, and 39 client-side Vitest tests. For Milestone 3 (`v1.1.0`), we turned that browser prototype into a **locally runnable, persistent operational workflow** backed by a single Node.js 22 / TypeScript HTTP API and PostgreSQL 16, while fixing mathematical, verification, concurrency, identity, and React wiring defects discovered during the baseline audit of `4667e5d`.

### 1.1 End-to-End Persistent Operational Workflow (Delta from Report 2)
The full synthetic lifecycle now runs end-to-end through authenticated HTTP (`/v1`) and PostgreSQL 16 for primary pilot zone `DMA-YASAMAL-04`, with `DMA-NASIMI-02` verifying strict cross-DMA isolation:

1. **Authenticated Synthetic Telemetry Ingestion (`POST /v1/telemetry/batch`):** Enforces device-token credentials (`X-Device-Token`), active meter membership, device-to-meter and meter-to-DMA binding, metric-to-role compatibility, canonical units (`m3/h`, `bar`, `m`), bounded batch size (`1..500`), separate `observed_at` / `transmitted_at` / server-owned `received_at` timestamps, and durable PostgreSQL deduplication (`UNIQUE (meter_id, observation_id)`). Bounded historical replays (`15 min < age <= 72 h`) persist with `ingestion_mode = 'HISTORICAL_REPLAY'` and never trigger fresh live incident dispatch.
2. **Per-Meter Clipped Integration & Balance (`GET /v1/dma/:id/balance`, `GET /v1/dma/:id/night-flow`):** Reuses the exact same TypeScript domain core (`prototype/src/domain/balance/flowIntegration.ts` and `waterBalance.ts`) on persisted PostgreSQL rows. Integration is clipped strictly to `[windowStart, windowEnd]`, unmeasured long gaps are excluded from `coverageRatio`, single samples never fabricate duration, and multi-inlet DMAs integrate per meter before summing (verified: two inlet meters at `100 m³/h` over 15 minutes yield `50.0 m³` identically across domain unit tests and the PostgreSQL HTTP endpoint). The buggy v1.0.1 `AVG(...) * 0.25` materialized view in `contracts/schema.sql` has been retired.
3. **Reviewable Incident Lifecycle & Authoritative Verification (`POST /v1/dma/:id/assess`, `POST /v1/incidents/:id/transition`):** Removed trust in caller-supplied `isSuccessful`. Verification is now evaluated server-side in `evaluateVerificationEvidence(...)` using comparable pre/post nocturnal windows, minimum sample (`>= 8`) and coverage (`>= 80%`) thresholds, evidence provenance, and Torricelli pressure normalization. Forged `is_successful: true` with elevated post-repair flow reverts `REPAIRED → IN_REPAIR`; insufficient coverage returns HTTP `422` and leaves the incident in `REPAIRED`.
4. **Optimistic Concurrency, Idempotency & Atomic Rollback (`PostgresIncidentRepository.ts`):** All three repository adapters (`InMemory`, `ValidatedJsonFixture`, and `Postgres`) now enforce explicit `expectedVersion` compare-and-swap (rejecting stale or same-version writes with HTTP `409`), stable `command_id` + canonical SHA-256 payload-hash idempotency across server restarts, deep-cloned isolation, and single-transaction ACID commits covering `leak_incidents`, `incident_commands`, `audit_events`, and `notification_outbox`.
5. **Transactional Outbox & Local Idempotent Receiver (`server/src/outbox/`):** Crew assignments and live incident detections enqueue `notification_outbox` rows inside the same PostgreSQL transaction. `OutboxDispatcher` processes due rows with bounded retries (`max_attempts = 3`, exponential backoff, `DEAD_LETTERED` on exhaustion) against `LocalNotificationReceiver`, which deduplicates on `X-Idempotency-Key`.
6. **React 19 Frontend Integration (`prototype/`):** Wired directly to `/v1` in **Integrated Mode (API + PostgreSQL 16)** with explicit loading, empty-DMA, `403` viewer-block, `409` stale-conflict refresh/retry, `422` insufficient-evidence, and `503` unavailable banners (zero silent fallback to static demo data). Static Demo / Test Mode remains explicitly isolated; clock injection (`FixedClock`), fault injection, and adapter switching are clearly scoped to demo mode. Corrected the `TestabilityHarness` Torricelli calculation (`Cd = 0.62, A = 20 cm², H = 45 m ≈ 132.64 m³/h`, clearly separating the independent synthetic `+38.4 m³/h` burst input).

### 1.2 Demonstrated Concurrency, Atomic Rollback & Recovery Scenarios
- **Concurrent Stale Update & Atomic Rollback (`server/tests/postgresConformance.test.ts`):** Two concurrent dispatchers racing with `expectedVersion = 1` produce exactly one `200 OK` (`v2`, 1 audit row) and one `409 VERSION_CONFLICT` with zero lost updates. Injecting a pre-commit failure via `beforeCommitHook` rolls back `leak_incidents`, `audit_events`, `incident_commands`, and `notification_outbox` together, after which retrying the identical `command_id` succeeds cleanly.
- **Database Outage & Recovery (`server/tests/outboxAndDependencyFailure.test.ts`):** Pointing the API at an unreachable PostgreSQL port causes `GET /ready` and all `/v1` writes to fail honestly with HTTP `503 DATABASE_UNAVAILABLE` (zero acknowledged-but-lost writes); retrying the same `command_id` against healthy PostgreSQL commits once cleanly.
- **Isolated Backup & Restore Drill (`scripts/backup-restore-drill.mjs`):** Executed `pg_dump -Fc` (`2.57 s`, `85,999 bytes`) from `samt_v1_1` and restored into a separate database `samt_restore_drill` (never overwriting primary data) in **`6.48 s`**. All 7 table counts (`3,900` telemetry rows, `1` incident `v2`, `66` audit events) matched the pre-backup snapshot exactly, while a synthetic post-backup write `4.21 s` later was verified absent from the restored snapshot.

### 1.3 Measured Verification Outcomes (Executed Locally on November 23, 2026)
- **Automated Tests (`npm run test`):** **12 test files, 60/60 tests passing** (`47` domain/unit tests in `prototype/` + `13` PostgreSQL conformance, HTTP workflow, OpenAPI contract, outbox retry, and dependency-failure tests in `server/`). See [`verification-evidence/03-tests.txt`](./verification-evidence/03-tests.txt).
- **Contracts (`npm run contracts:check`):** `contracts/openapi.yaml` (OpenAPI `3.1.0`, 13 routes) validated with `@apidevtools/swagger-parser` + live HTTP schema assertions; `contracts/telemetry.proto` compiled with real `protoc` (`libprotoc 3.19.1`, `3,041`-byte descriptor). Named 60-record fixture (`yasamal_dma04_60_records_15s_window`) measured at **5,319 bytes** raw Protobuf (**631 bytes** gzipped) vs. **12,720 bytes** raw JSON. See [`verification-evidence/02-contracts-check.json`](./verification-evidence/02-contracts-check.json).
- **Reproducible Workload Benchmark (`npm run benchmark`):** `seed = 20261123`, `batchSize = 60`, `60` measured batches (`3,600` observations, `4` concurrent clients, `0` errors, `3,900/3,900` persisted rows verified). Replacing a per-row `INSERT` loop with a single parameterized `UNNEST` bulk upsert improved throughput from **`161.07 obs/s` (`p95 = 3,345.95 ms`)** to **`1,316.21 obs/s` (`p95 = 479.51 ms`)** — an **`8.17×` speedup** and **`85.7%` p95 latency reduction**. See [`verification-evidence/04-benchmark-and-explain.json`](./verification-evidence/04-benchmark-and-explain.json).
- **PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)`:** Selective 10-second DMA balance query (`650 / 3,900` rows) used **`Bitmap Index Scan on idx_telemetry_dma_metric_observed`** in **`1.765 ms`** (`shared hit=2` index pages; [`verification-evidence/07-explain-selective.txt`](./verification-evidence/07-explain-selective.txt)).
- **Live Browser E2E (`npm run e2e:browser`):** Headless Google Chrome (`playwright-core`) ran against live `server` + PostgreSQL 16 + Vite frontend, confirming `DMA-NASIMI-02` empty state, Viewer `403` error in UI, `Escape` modal dismiss, `422` insufficient-evidence rejection, full lifecycle to `CLOSED` (`v6`), full `page.reload()` persistence, `0` page errors, and `0 px` horizontal overflow at `390×844` ([`verification-evidence/06-browser-e2e.json`](./verification-evidence/06-browser-e2e.json)).

---

## 2. Tools and Design Artifacts Produced

### Tools Used
- **Backend & Persistence:** Node.js `v22.11.0`, TypeScript `5.7.3`, Express `4.21`, Zod `3.24`, `pg` `8.13`, Docker Engine `29.1.3` / Compose, PostgreSQL `16.4-alpine` (`pg_dump`, `pg_restore`, `psql`).
- **Frontend & Testing:** React 19, Vite `6.4.4`, Tailwind CSS `3.4.17`, Vitest `4.1.12`, `playwright-core` `1.50` + local Google Chrome.
- **Contract Tooling:** `@apidevtools/swagger-parser` `10.1`, real `protoc` (`libprotoc 3.19.1` via `grpc-tools`), `protobufjs` `7.4`.

### Concrete Artifacts Delivered in `v1.1.0`
1. **Architecture Decision Record:** [`docs/adr/ADR-001-v1.1.0-postgresql-monolith.md`](./docs/adr/ADR-001-v1.1.0-postgresql-monolith.md) reconciling Report 2 §5.3 and `SAMT_v1.0.1.md` with the verified local monolith + PostgreSQL 16 baseline.
2. **Versioned Technical Specification & Changelog:** [`SAMT_v1.1.0.md`](./SAMT_v1.1.0.md) and [`CHANGELOG.md`](./CHANGELOG.md).
3. **Shared Application Use Cases (`prototype/src/application/`):** [`IngestTelemetryBatchUseCase.ts`](./prototype/src/application/IngestTelemetryBatchUseCase.ts), [`AssessDmaHydraulicsUseCase.ts`](./prototype/src/application/AssessDmaHydraulicsUseCase.ts), [`ExecuteIncidentTransitionUseCase.ts`](./prototype/src/application/ExecuteIncidentTransitionUseCase.ts), [`hashUtils.ts`](./prototype/src/application/hashUtils.ts).
4. **Node/TypeScript HTTP Service & Migrations (`server/`):** [`server/migrations/001_initial_schema.sql`](./server/migrations/001_initial_schema.sql), [`server/src/http/app.ts`](./server/src/http/app.ts), [`server/src/auth/devAuth.ts`](./server/src/auth/devAuth.ts), [`server/src/repositories/PostgresIncidentRepository.ts`](./server/src/repositories/PostgresIncidentRepository.ts), [`server/src/repositories/PostgresTelemetryRepository.ts`](./server/src/repositories/PostgresTelemetryRepository.ts), [`server/src/outbox/OutboxDispatcher.ts`](./server/src/outbox/OutboxDispatcher.ts), [`server/src/outbox/LocalNotificationReceiver.ts`](./server/src/outbox/LocalNotificationReceiver.ts), [`docker-compose.yml`](./docker-compose.yml), [`.env.example`](./.env.example).
5. **Reconciled Contracts:** [`contracts/openapi.yaml`](./contracts/openapi.yaml) (OpenAPI `3.1.0`), [`contracts/telemetry.proto`](./contracts/telemetry.proto) (compiled Protobuf v3), and [`contracts/schema.sql`](./contracts/schema.sql) (optional future extensions; buggy view retired).
6. **Verification, Benchmark, Recovery & CI Scripts:** [`scripts/validate-contracts.mjs`](./scripts/validate-contracts.mjs), [`scripts/benchmark.ts`](./scripts/benchmark.ts), [`scripts/backup-restore-drill.mjs`](./scripts/backup-restore-drill.mjs), [`scripts/e2e-browser.mjs`](./scripts/e2e-browser.mjs), [`.github/workflows/ci.yml`](./.github/workflows/ci.yml), and retained raw outputs in [`verification-evidence/`](./verification-evidence/).
7. **Updated Traceability & Verification Docs:** [`TRACEABILITY.md`](./TRACEABILITY.md), [`VERIFICATION.md`](./VERIFICATION.md), [`README.md`](./README.md).

---

## 3. Technical Challenges and Trade-offs

### 3.1 Engineering Challenges Encountered & Resolved
1. **Eliminating Algorithm Duplication Across Server and UI:** Keeping pure TypeScript modules under `prototype/src/domain/` and `prototype/src/application/` with NodeNext-compatible `.js` relative import specifiers allowed both Vite (`bundler` resolution) and `tsc` (`NodeNext` ESM) to compile the exact same business rules with zero duplicated SQL/Go/Rust implementations.
2. **Real Integration Pitfalls Caught During Verification:**
   - Running `server/tests/*.test.ts` from the repository root bypassed `server/vitest.config.ts` (`fileParallelism: false`), causing parallel test files to truncate shared PostgreSQL tables mid-test; running via `npm --prefix server run test` fixed isolation cleanly.
   - Running the compiled server (`node server/dist/server/src/index.js`) revealed that `migrations/` path resolution assumed `src/` depth; adding dual `src/` and `dist/` resolution in `server/src/db/migrate.ts` fixed compiled startup.
   - Local port `5432` was already occupied by another unrelated PostgreSQL container on the host; binding SAMT's `docker-compose.yml` default host port to `5433` prevented conflicts without disturbing existing containers.
   - The first benchmark run showed per-row `INSERT` loops bottlenecking at `161.07 obs/s` (`p95 = 3.35 s`) due to 60 SQL round-trips per batch; switching to a single parameterized `UNNEST` bulk upsert cut round-trips to 1 per batch and delivered an `8.17×` speedup.
3. **Separating Measured Coverage from Boundary Estimation:** Under 15-second sampling, 60 samples starting at `t = 0` span `14m45s`, whereas 61 endpoint samples span `15m00s`. Separating `measuredVolumeM3` from bounded edge hold (`estimatedBoundaryVolumeM3`, capped strictly at `expectedSampleIntervalSec`) ensures incomplete gaps are never disguised as 100% measured data.

### 3.2 Quality Attribute Scenarios (Grounded in Course PDFs)
Using SEI ATAM scenarios (`resources/lecture 2.pdf`, pp. 49–94) and merged systems topics (`resources/lectures_merged.pdf`):

- **Scenario 1 — Concurrent Command Consistency (`lectures_merged.pdf`, pp. 4–5, 32, 117):**  
  *Stimulus:* Two dispatchers submit conflicting `ASSIGN` transitions for the same incident at `expected_version = 1`, or a client retries a timed-out `command_id`.  
  *Response & Measure:* PostgreSQL `SELECT ... FOR UPDATE` + `WHERE version = $expected` commits one write (`v2`, 1 audit row) and rejects the stale writer with HTTP `409`; duplicate retry with identical `command_id` and SHA-256 payload hash replays HTTP `200` (`idempotent_replay: true`) without bumping version or duplicating audit entries; same `command_id` with altered payload fails with HTTP `409 IDEMPOTENCY_CONFLICT`. *(Verified in `postgresConformance.test.ts`.)*
- **Scenario 2 — Dependency Failure Degradation (`lectures_merged.pdf`, pp. 65–67, 72–75):**  
  *Stimulus:* PostgreSQL becomes unreachable while devices ingest telemetry and operators transition incidents.  
  *Response & Measure:* `GET /ready` returns `503 DEGRADED`, write endpoints return `503 DATABASE_UNAVAILABLE` with zero acknowledged-but-lost writes, and the React UI shows an explicit `503` retry banner instead of falling back to static demo data. *(Verified in `outboxAndDependencyFailure.test.ts`.)*
- **Scenario 3 — Reproducible Ingestion Throughput (`lectures_merged.pdf`, pp. 104–109):**  
  *Stimulus:* 4 concurrent synthetic gateways push 60 batches of 60 observations (`3,600` readings) with fixed seed `20261123`.  
  *Response & Measure:* Bulk `UNNEST` achieves `1,316.21 obs/s` (`p50 = 107.30 ms`, `p95 = 479.51 ms`, `0` errors, `100%` row persistence), an `8.17×` gain over row-by-row inserts. *(Verified in `scripts/benchmark.ts`.)*

### 3.3 Architecture Decision Trade-offs

| Decision | Selected for `v1.1.0` | Deferred Alternative | Rationale (Course Anchor) |
| :--- | :--- | :--- | :--- |
| **Service Topology** | Single Node/TS modular monolith + PostgreSQL 16 (`ADR-001`) | Multi-service Go/Rust + Kafka + Flink + TimescaleDB | Eliminates algorithm duplication and operational overhead while proving ACID transactions, RBAC, and verification first (`lectures_merged.pdf`, pp. 75, 128). |
| **Water Balance Execution** | Load per-meter PostgreSQL readings into shared TS `flowIntegration.ts` | Duplicate logic in SQL continuous aggregate view | Retires buggy cross-meter averaging (`AVG * 0.25`) and guarantees 100% parity between persisted queries, HTTP responses, and domain tests (`lecture 3.pdf`, pp. 48–54). |
| **Async Notifications** | PostgreSQL `notification_outbox` + bounded retries + local HTTP receiver | External Kafka broker + live SMS gateway | Guarantees atomic persistence with state changes and allows deterministic retry/dead-letter/dedup tests without external infrastructure (`lectures_merged.pdf`, pp. 31–33, 66). |

---

## 4. Personal and Peer Feedback

### External & Peer Feedback Status
No new instructor comments, peer review notes, or external team member contribution confirmations were supplied specifically for Milestone 3 prior to this report. Accordingly, no instructor approvals, team meeting dates, or unconfirmed peer contributions are claimed here.

### Engineering Self-Review Findings (Baseline Audit & Verification)
During systematic self-review of `main` (`4667e5d`) and the `v1.1.0` implementation, we identified and resolved six concrete engineering issues:
1. **Unverified Trust Boundaries:** The v1.0.1 state machine accepted `isSuccessful: true` directly from callers and allowed unversioned or same-version repository overwrites. Both were replaced with server-side evidence evaluation and strict `expectedVersion` CAS + `command_id` idempotency.
2. **Hidden Coverage Inflation:** `flowIntegration.ts` previously extended arbitrary gaps to window bounds and counted extrapolated time as measured coverage, hiding missing telemetry. Clipping and separating `measuredVolumeM3` from bounded `estimatedBoundaryVolumeM3` made incomplete data explicitly visible.
3. **Cross-DMA Leakage & Misleading Demo Physics:** `DomainContext` previously fell back to `incidents[0]` when a selected DMA had no incident, `useMnfAnalysis` ignored the injected clock, and `TestabilityHarness` misstated Torricelli discharge (`38.4` vs. `~132.64 m³/h` for `Cd=0.62, A=20 cm², H=45 m`). All three were corrected.
4. **Overstated Unmeasured Claims:** Previous documentation estimated a 60-record Protobuf batch at `~1.8 KB` without encoding one and misdescribed `lecture 13.pdf`/`14.pdf` in `TRACEABILITY.md` as 112 slides of Design Assurance (actual PDFs are 48 pages of *Value Sensitive Design*). Both were audited directly and corrected.
5. **Local vs. Hosted CI Honesty:** `.github/workflows/ci.yml` was added and every step was verified locally against `postgres:16.4-alpine`, but an actual hosted GitHub Actions run has not yet been triggered because changes remain unmerged on `feat/samt-v1.1.0`.
6. **Accessibility Scope Honesty:** Modal focus trapping, `Escape` dismissal, and `390×844` layout overflow (`0 px`) were verified in Chrome, without claiming full WCAG 2.1 AA conformance from those checks alone.

---

## 5. Next Architectural Steps (Report 4 Roadmap)

### 5.1 Remaining Risks & Limitations
1. **Local Development Auth Only:** Local static environment tokens (`SAMT_VIEWER_TOKEN`, `SAMT_DISPATCHER_TOKEN`, `SAMT_DEVICE_TOKENS_JSON`) verify server-side RBAC boundaries but do not provide token rotation, short-lived JWTs, or hardware X.509 mTLS 1.3.
2. **Contract-Only Binary Transport:** `contracts/telemetry.proto` compiles cleanly with `protoc` and has measured fixture wire sizes, but runtime ingestion still uses HTTP/JSON.
3. **Synthetic Hydraulic Data Only:** All flow, pressure, and MNF series remain synthetic; percentile MNF detection is a heuristic and does not prove real-world rooftop-tank separation or physical underground pipe localization.
4. **Logical Backup vs. Continuous PITR:** The recovery drill verified logical `pg_dump`/`pg_restore` (`6.48 s`), not continuous WAL archiving (`pgBackRest` / PITR) under live concurrent writes.

### 5.2 Specific Milestone 4 (Report 4) Plan
1. **Trigger & Capture Hosted CI Run:** Push `feat/samt-v1.1.0` for pull-request review so `.github/workflows/ci.yml` executes on GitHub-hosted Ubuntu runners with `postgres:16.4-alpine` and produces an immutable CI run record.
2. **WAL Archiving & Point-in-Time Recovery (PITR) Drill:** Enable PostgreSQL `archive_mode = on` in a Docker Compose profile and run a timed PITR recovery drill into an isolated container to measure sub-minute RPO behavior.
3. **JWT / Short-Lived Session & Rate Limiting:** Upgrade `server/src/auth/devAuth.ts` to signed short-lived JWTs with key rotation, plus per-device token-bucket rate limiting and structured JSON observability metrics (`/metrics` latency histograms and error counters).
4. **Optional Spatial / Time-Series Evaluation:** Benchmark one concrete PostGIS spatial query (`ST_DWithin` linking leak incidents to nearest pipe segments) and evaluate whether TimescaleDB compression is justified by measured storage growth before adding extension complexity.
5. **Final Defense Package & Live Demo Rehearsal:** Assemble Report 4 (`report_4.md`), final oral defense slides, and a reproducible 5-minute scripted demo exercising ingestion, conflict resolution, evidence verification, and reload persistence.
