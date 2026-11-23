# SAMT v1.1.0 Verification Record & Empirical Evidence
**Project:** SAMT (Su Əməliyyatlarının Mərkəzləşdirilmiş Təhlili)  
**Version:** `SAMT v1.1.0` on branch `feat/samt-v1.1.0`  
**Baseline Revision:** `main` at `4667e5dc21d5216505e9dbfeb9b4a11634fad158` (`v1.0.1`, 8 Vitest files / 39 tests)  
**Verification Date:** November 23, 2026 (Asia/Baku)  
**Scope Status:** All automated unit tests, PostgreSQL 16 integration/conformance tests, OpenAPI 3.1 & Protobuf v3 contract checks, before/after ingestion benchmarks, selective `EXPLAIN (ANALYZE, BUFFERS)`, isolated backup/restore drill, and headless Chrome browser E2E passed **locally**. Hosted GitHub Actions execution of [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) has not yet been triggered while changes remain on local branch `feat/samt-v1.1.0`.

---

## 1. Runtime & Verification Environment

| Component | Measured Version / Spec |
| :--- | :--- |
| **Host OS** | Windows 11 (`win32 10.0.26300 x64`) with WSL2 Docker Engine `29.1.3` / Compose `2.40.3` |
| **CPU / Memory** | 11th Gen Intel(R) Core(TM) i5-1155G7 @ 2.50GHz (8 logical cores), 15.8 GB RAM |
| **Node.js / npm** | Node `v22.11.0`, npm `11.13.0` |
| **TypeScript / Vite / Vitest** | TypeScript `5.7.3`, Vite `6.4.4`, `vite-plugin-singlefile`, Vitest `4.1.12` |
| **HTTP Service Stack** | Express `4.21.2`, Zod `3.24.2`, `pg` `8.13.1` |
| **Database Container** | `postgres:16.4-alpine` (`PostgreSQL 16.4 on x86_64-pc-linux-musl`, host port `5433`) |
| **Contract Compilers** | `@apidevtools/swagger-parser` `10.1.0`, real `protoc` (`libprotoc 3.19.1` via `grpc-tools`), `protobufjs` `7.4.0` |
| **Browser E2E** | `playwright-core` `1.50.1` driving local Google Chrome (`headless`) |
| **External Tools Absent** | `graphify`, `obsidian`, native host `psql`/`pg_dump` (PostgreSQL CLI tools executed inside `samt-postgres` container) |

Raw pre-edit baseline verification is retained in [`verification-evidence/01-baseline.txt`](./verification-evidence/01-baseline.txt).

---

## 2. Typecheck, Automated Tests & Build Summary

| Check | Exact Command | Outcome | Retained Evidence |
| :--- | :--- | :--- | :--- |
| **TypeScript Strict Check** | `npm run typecheck` | PASS (`prototype` + `server`, 0 errors) | Checked locally |
| **Domain & Shared Use-Case Unit Tests** | `npm run test:unit` | **PASS — 8 files, 47/47 tests** (`15.06 s`) | [`verification-evidence/03-tests.txt`](./verification-evidence/03-tests.txt) |
| **PostgreSQL, HTTP, Outbox & Contract Tests** | `npm run test:server` | **PASS — 4 files, 13/13 tests** (`68.33 s`, sequential) | [`verification-evidence/03-tests.txt`](./verification-evidence/03-tests.txt) |
| **Combined Suite** | `npm run test` | **PASS — 12 files, 60/60 tests** | [`verification-evidence/03-tests.txt`](./verification-evidence/03-tests.txt) |
| **Production Build** | `npm run build` | PASS (`server/dist/` + `prototype/dist/index.html` `472.26 kB`, gzip `136.91 kB`) | Checked locally |
| **Contract Validation** | `npm run contracts:check` | PASS (OpenAPI `3.1.0` 13 routes + `libprotoc 3.19.1`) | [`verification-evidence/02-contracts-check.json`](./verification-evidence/02-contracts-check.json) |
| **Workload Benchmark** | `npm run benchmark` | PASS (`8.17×` speedup, `85.7%` p95 drop, `3,900/3,900` rows) | [`verification-evidence/04-benchmark-and-explain.json`](./verification-evidence/04-benchmark-and-explain.json) |
| **Selective Index Plan** | `EXPLAIN (ANALYZE, BUFFERS)` | PASS (`Bitmap Index Scan on idx_telemetry_dma_metric_observed`, `1.765 ms`) | [`verification-evidence/07-explain-selective.txt`](./verification-evidence/07-explain-selective.txt) |
| **Backup & Restore Drill** | `npm run drill:backup-restore` | PASS (isolated `samt_restore_drill`, `6.48 s` restore, 100% parity) | [`verification-evidence/05-backup-restore-drill.json`](./verification-evidence/05-backup-restore-drill.json) |
| **Live Browser E2E** | `npm run e2e:browser` | PASS (real Chrome + API + PostgreSQL 16, `0` page errors) | [`verification-evidence/06-browser-e2e.json`](./verification-evidence/06-browser-e2e.json) |

### Test Suite Inventory (`60/60` Passing)

#### `prototype/src/tests/` (8 files, 47 tests)
1. `volumeIntegration.test.ts` (`8` tests): window clipping, `61` endpoint samples (`25.0 m³`) vs `60` samples with bounded boundary hold vs `STRICT_INTERIOR` (`24.5833 m³`), long-gap exclusion from `coverageRatio`, single-point non-fabrication, duplicate timestamp averaging, malformed-input counts, multi-meter sum (`2 × 100 m³/h × 0.25 h = 50.0 m³`), signed residual & double-count guard.
2. `nightFlowEvaluation.test.ts` (`4` tests): `[02:00, 04:00)` Asia/Baku (`UTC+4`) midnight boundary handling, `FixedClock` `03:00 AZT` spike detection, nominal baseline check, insufficient sample/coverage guard.
3. `incidentStateMachine.test.ts` (`5` tests): canonical lifecycle through `CLOSED`, invalid state jump rejection, crew assignment guards, authoritative server-side verification rejecting forged `isSuccessful: true` (rework `REPAIRED → IN_REPAIR`) and insufficient evidence (`INSUFFICIENT_EVIDENCE`), `FALSE_ALARM` branch & terminal immutability.
4. `telemetryValidation.test.ts` (`6` tests): valid observation acceptance, inactive/unknown meter and wrong device/DMA/metric/unit rejection, negative/non-finite rejection, clock skew quarantine, bounded historical replay (`<= 72 h`) without live dispatch, durable dedup store check.
5. `portConformance.test.ts` (`14` tests): identical strict `expectedVersion` CAS, concurrent writer conflict, `commandId` idempotency + payload mismatch conflict, atomic `beforeCommitHook` rollback, deep-clone mutation isolation, malformed JSON seed rejection across `InMemoryIncidentRepository` and `ValidatedJsonFixtureIncidentRepository`, plus `RecordingAuditSink` spy tests.
6. `constrainedAllocation.test.ts` (`5` tests): preserves `900/705` (`0` unmet, `195` residual), `610` scarce redistribution, zero supply, canal bottlenecks, and `giniIndex: null` for undefined cases.
7. `illustrativeSavings.test.ts` (`4` tests): preserves `100 @ 4 bar vs 50 @ 1 bar (α=0.5) = 0.0 m³/h`, genuine physical reduction, visible negative savings, explicit non-IPMVP disclaimers.
8. `endToEndSyntheticWorkflow.test.ts` (`1` test): invokes real shared application use cases (`IngestTelemetryBatchUseCase`, `AssessDmaHydraulicsUseCase`, `ExecuteIncidentTransitionUseCase`) with `DMA-YASAMAL-04` / `DMA-NASIMI-02` isolation, historical replay guard, and authoritative verification.

#### `server/tests/` (4 files, 13 tests — executed against real `postgres:16.4-alpine`)
1. `postgresConformance.test.ts` (`4` tests): CRUD/duplicate/missing guards; two concurrent PostgreSQL writers at `expectedVersion = 1` → 1 success + 1 `409 VERSION_CONFLICT` + 1 audit; `command_id` replay across fresh pool/restart + `409 IDEMPOTENCY_CONFLICT` on altered payload; atomic rollback of `leak_incidents`, `audit_events`, `incident_commands`, and `notification_outbox` under injected pre-commit failure followed by clean retry.
2. `httpWorkflowAndContracts.test.ts` (`5` tests): server-side RBAC (`401`, `403` viewer/device enforcement); partial-batch validation, durable deduplication across restart, and bounded historical replay without live dispatch; persisted multi-meter balance parity (`2 × 100 m³/h = 50.0 m³`); full authenticated HTTP lifecycle to `CLOSED` with `DMA-NASIMI-02` isolation, forged-verdict rework, and reload after restart; `/v1/allocation/solve` and `/v1/savings/estimate` numerical regression parity.
3. `outboxAndDependencyFailure.test.ts` (`3` tests): outbox bounded retries with exponential backoff and idempotent delivery once on `X-Idempotency-Key`; dead-lettering after `max_attempts = 3`; honest HTTP `503 DATABASE_UNAVAILABLE` when PostgreSQL is unreachable (zero acknowledged lost writes) and clean recovery without duplicates.
4. `openApiContract.test.ts` (`1` test): live HTTP responses across primary `/v1` routes and error codes verified against `contracts/openapi.yaml` OpenAPI 3.1 schemas.

---

## 3. Contract Verification (`contracts/`)

Output retained in [`verification-evidence/02-contracts-check.json`](./verification-evidence/02-contracts-check.json):

- **OpenAPI `3.1.0` (`contracts/openapi.yaml`, version `1.1.0`):** Validated with `@apidevtools/swagger-parser` across all **13** `/v1` routes, `BearerAuth` + `DeviceTokenAuth` security schemes, discriminated transition payloads, and separated `x-target-architecture-auth` notes for future mTLS.
- **Protobuf v3 (`contracts/telemetry.proto`):** Compiled cleanly using real `protoc` (`libprotoc 3.19.1`, descriptor output `3,041 bytes`). Marked contract-only for runtime ingestion (runtime transport in `v1.1.0` is HTTP/JSON).
- **Measured 60-Record Payload Fixture (`yasamal_dma04_60_records_15s_window`):**
  - Raw Protobuf wire payload: **`5,319 bytes`** (`88.65 bytes/record` avg)
  - Gzipped Protobuf payload: **`631 bytes`**
  - Equivalent JSON payload: **`12,720 bytes`**
  - Replaces the unmeasured v1.0.1 `~1.8 KB` prose estimate with reproducible measurements.
- **Database DDL (`server/migrations/001_initial_schema.sql` vs `contracts/schema.sql`):** `001_initial_schema.sql` is the active standard PostgreSQL 16 schema executed in tests, benchmarks, and drills; `contracts/schema.sql` is clearly labeled as Optional Target Architecture Extensions (TimescaleDB/PostGIS) with the incorrect v1.0.1 cross-meter `AVG(...) * 0.25` view retired.

---

## 4. Reproducible Ingestion Benchmark & `EXPLAIN (ANALYZE, BUFFERS)`

Executed via `npm run benchmark` ([`scripts/benchmark.ts`](./scripts/benchmark.ts); raw JSON in [`verification-evidence/04-benchmark-and-explain.json`](./verification-evidence/04-benchmark-and-explain.json)):
- **Workload:** Seed `20261123`, `5` warmup batches + `60` measured batches of `60` observations (`3,600` measured / `3,900` total persisted rows), `4` concurrent clients, `0` errors.

| Implementation Mode | Elapsed Time | Throughput (req/s) | Throughput (obs/s) | p50 Latency | p95 Latency | p99 Latency | Row Parity |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | :--- |
| **Before (`ROW_BY_ROW` inserts)** | `22,350.09 ms` | `2.68 req/s` | `161.07 obs/s` | `1,239.11 ms` | `3,345.95 ms` | `3,934.07 ms` | `3,900 / 3,900` |
| **After (`UNNEST` bulk upsert)** | `2,735.12 ms` | `21.94 req/s` | `1,316.21 obs/s` | `107.30 ms` | `479.51 ms` | `884.15 ms` | `3,900 / 3,900` |
| **Measured Improvement** | **-87.8%** | **8.17×** | **8.17×** | **-91.3%** | **-85.7%** | **-77.5%** | Verified |

- **PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)` Findings:**
  - Full-table benchmark window (`3,900 / 3,900` rows): planner appropriately chose `Seq Scan` (`11.402 ms`, `shared hit=112`) because 100% of rows matched.
  - Selective 10-second DMA balance query (`650 / 3,900` rows; [`verification-evidence/07-explain-selective.txt`](./verification-evidence/07-explain-selective.txt)): planner chose **`Bitmap Index Scan on idx_telemetry_dma_metric_observed`** (`1.765 ms`, `shared hit=2` index pages, `82` exact heap blocks).

---

## 5. Isolated Backup & Restore Drill

Executed via `npm run drill:backup-restore` ([`scripts/backup-restore-drill.mjs`](./scripts/backup-restore-drill.mjs); raw JSON in [`verification-evidence/05-backup-restore-drill.json`](./verification-evidence/05-backup-restore-drill.json)):

- **Primary Database:** `samt_v1_1` (never overwritten).
- **Backup Artifact:** `pg_dump -Fc` completed in **`2,567.49 ms`** (`85,999 bytes`).
- **Restore Target:** Isolated database `samt_restore_drill` created, restored via `pg_restore` in **`6,478.83 ms`**, verified, and dropped cleanly.
- **Integrity Parity:** All 7 table counts matched the pre-backup snapshot (`dma_zones: 4`, `network_meters: 12`, `telemetry_observations: 3,900`, `leak_incidents: 1` at `v2`, `incident_commands: 0`, `audit_events: 66`, `notification_outbox: 0`).
- **Observed Data-Loss Window:** `4,209 ms` (a post-backup write submitted after the dump completed was confirmed absent from `samt_restore_drill`).
- **Scope Caveat:** Observed numbers measure a local cold logical dump/restore on synthetic data and are **not** production WAL PITR SLA guarantees (future target: `RPO <= 5 min`, `RTO <= 30 min`).

---

## 6. Live Browser End-to-End Verification

Executed via `npm run e2e:browser` ([`scripts/e2e-browser.mjs`](./scripts/e2e-browser.mjs); raw JSON in [`verification-evidence/06-browser-e2e.json`](./verification-evidence/06-browser-e2e.json)) using headless Google Chrome against live Express API + PostgreSQL 16 + Vite frontend:

- Verified `DMA-NASIMI-02` displays an honest empty state (no cross-DMA bleed from `DMA-YASAMAL-04`).
- Verified switching to `viewer` token blocks write transitions with a visible `403` error in the UI.
- Verified modal `Escape` key dismissal.
- Verified submitting verification with insufficient sample count returns `422` in the UI and leaves the incident in `REPAIRED`.
- Verified full authenticated incident progression (`INC-BROWSER-E2E-001`) through `CLOSED` (`v6`) and confirmed `CLOSED` + `v6` persisted after a full browser `page.reload()`.
- Verified **`0` uncaught page errors** and **`0 px` horizontal overflow** at both `1280×800` and `390×844` narrow mobile viewport. *(Note: this verifies specific modal/layout behaviors, not full WCAG 2.1 AA compliance.)*

---

## 7. Honest Scope Matrix (`v1.1.0` Implemented vs. Future Target Architecture)

| Capability | `SAMT v1.1.0` Verified Implementation | Future Target Architecture (Deferred via `ADR-001`) | Status |
| :--- | :--- | :--- | :--- |
| **HTTP Service & Persistence** | Single Node 22 / Express 4 / TypeScript API + PostgreSQL 16 (`5433`) | Multi-region microservices + TimescaleDB/PostGIS cluster | **Implemented & Verified** |
| **Telemetry Validation & Dedup** | Active meter/device/DMA/unit checks + `UNIQUE (meter_id, observation_id)` + `UNNEST` bulk upsert (`1,316 obs/s` local) | Rust/Go mTLS gateway + Kafka/Flink (`40,000 obs/s` target) | **Implemented & Verified (Local)** |
| **Flow Integration & Balance** | Clipped per-meter trapezoidal integrator shared across API & tests (`2 × 100 m³/h = 50 m³`) | TimescaleDB continuous aggregates (must preserve per-meter sum) | **Implemented & Verified** |
| **Incident FSM & Authoritative Verification** | Server-side evidence evaluation, strict `expectedVersion` CAS (`409`), persistent `command_id` idempotency, ACID audit | Distributed workflow orchestration | **Implemented & Verified** |
| **Async Notifications** | PostgreSQL `notification_outbox` + exponential retry/dead-letter + `LocalNotificationReceiver` | External Kafka broker + SMS/push gateway | **Implemented & Verified (Local)** |
| **Authentication & RBAC** | Local static dev bearer/device tokens (`viewer`/`dispatcher`/`device`) with constant-time compare | Short-lived JWT/OIDC + hardware X.509 mTLS 1.3 | **Dev Auth Only** |
| **Binary Telemetry Transport** | Validated & `protoc`-compiled `contracts/telemetry.proto` + measured fixture sizes | Live gRPC streaming ingestion endpoint | **Contract-Only** |
| **CI Pipeline** | [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) verified step-by-step locally | First hosted GitHub Actions run after branch push | **Defined / Local Equivalent Passed** |
