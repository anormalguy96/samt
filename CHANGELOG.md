# Changelog

All notable changes to SAMT (*Su Əməliyyatlarının Mərkəzləşdirilmiş Təhlili*) are documented in this file.

## [1.1.0] - 2026-11-23 (Branch `feat/samt-v1.1.0`)

### Added
- **Node.js 22 / TypeScript Modular Monolith HTTP API (`server/`):** Live Express + Zod `/v1` service exposing `/health`, `/ready`, `/v1/dmas`, `/v1/telemetry/batch`, `/v1/dma/:dmaId/balance`, `/v1/dma/:dmaId/night-flow`, `/v1/dma/:dmaId/assess`, `/v1/incidents`, `/v1/incidents/:incidentId`, `/v1/incidents/:incidentId/transition`, `/v1/allocation/solve`, `/v1/savings/estimate`, `/v1/audit`, and `/v1/outbox*`.
- **PostgreSQL 16 Persistence & Migrations:** Executable `server/migrations/001_initial_schema.sql`, migration runner, deterministic seeder (`DMA-YASAMAL-04` primary workflow + `DMA-NASIMI-02` isolation DMA), `docker-compose.yml` (`postgres:16.4-alpine`), and secret-free `.env.example`.
- **Shared Application Use Cases (`prototype/src/application/`):** `IngestTelemetryBatchUseCase`, `AssessDmaHydraulicsUseCase`, and `ExecuteIncidentTransitionUseCase` shared identically across server, frontend, and tests.
- **Server-Side RBAC, Concurrency & Transactional Outbox:** Constant-time `viewer`/`dispatcher`/`device` auth middleware, `expected_version` CAS (`409`), `command_id` + SHA-256 payload-hash idempotency across restart, single-transaction ACID commit/rollback, `OutboxDispatcher` with bounded retries, and `LocalNotificationReceiver` deduplicating on `X-Idempotency-Key`.
- **Verification & Governance Artifacts:** `ADR-001`, `SAMT_v1.1.0.md`, `report_3.md`, `.github/workflows/ci.yml`, `scripts/validate-contracts.mjs`, `scripts/benchmark.ts`, `scripts/backup-restore-drill.mjs`, `scripts/e2e-browser.mjs`, and raw evidence under `verification-evidence/`.

### Changed
- **Flow Integration & Balance:** Clipped strictly to `[windowStart, windowEnd]`, separated measured vs. bounded edge-hold volume, prevented single-point duration fabrication, summed per-meter integrals (`2 × 100 m³/h × 0.25 h = 50 m³`), prevented authorized consumption double-counting, and retired the buggy `dma_water_balance_15m` cross-meter average view in `contracts/schema.sql`.
- **Authoritative Incident Verification:** Replaced caller-trusted `isSuccessful` with deterministic server/domain evaluation (`VERIFIED_SYNTHETIC_POLICY`, `FAILED_REWORK_REQUIRED`, `INSUFFICIENT_EVIDENCE`).
- **Repository Semantics:** Hardened `InMemoryIncidentRepository` and `ValidatedJsonFixtureIncidentRepository` alongside `PostgresIncidentRepository` with strict `expectedVersion` CAS, deep-clone isolation, seed validation, and atomic command commit/rollback.
- **Telemetry Ingestion:** Added active-meter, device-to-meter/DMA, role/metric, and canonical unit checks; separated `observed_at`, `transmitted_at`, and server-owned `received_at`; enforced bounded `<= 72h` historical replay without live incident dispatch; switched deduplication to durable PostgreSQL `UNIQUE (meter_id, observation_id)`.
- **Contracts:** Upgraded `contracts/openapi.yaml` to OpenAPI `3.1.0` matching actual `/v1` routes and local auth; aligned and `protoc`-compiled `contracts/telemetry.proto` with measured 60-record fixture byte sizes (`5,319 B` raw / `631 B` gzipped).
- **React Frontend (`prototype/`):** Wired Integrated Mode (`/v1` API, no silent demo fallback, explicit loading/empty/`403`/`409`/`422`/`503` states) alongside isolated Static Demo Mode; fixed strict DMA scoping, injected clock in `useMnfAnalysis`, real validator routing for fault injection, and Torricelli physics note in `TestabilityHarness.tsx`.

## [1.0.1] - 2026-10-20 (Historical Milestone 2 Baseline at `4667e5d`)
- Delivered pure TypeScript domain core, dual client-side repository adapters (`InMemory` and `ValidatedJsonFixture`), `FixedClock` seam, `RecordingAuditSink`, 39 client-side Vitest tests, draft contracts (`openapi.yaml`, `telemetry.proto`, `schema.sql`), `SAMT_v1.0.1.md`, and `report_2.md`.

## [1.0.0] - 2026-10-13 (Historical Milestone 1 Specification)
- Initial domain decomposition, requirements engineering, capacity planning, `SAMT_v1.0.0.md`, and `report_1.md`.
