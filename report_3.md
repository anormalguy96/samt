# PROJECT PROGRESS REPORT

**Project title:** SAMT - Su Əməliyyatlarının Mərkəzləşdirilmiş Təhlili  
**Student name:** Elmaddin Mohubbatov  
**Group / Team name:** Group 550RI-E / Team SAMT  
**Course Instructor:** Ms. Fidan Asgarova  
**Date:** November 23, 2026  
**Report number:** 3 / 4

---

## 1. Completed tasks

In Report 2 (`v1.0.1`), SAMT worked only in the browser with 39 unit tests. In Milestone 3 (`v1.1.0`), we turned it into a locally runnable system with a Node.js/TypeScript API and a PostgreSQL 16 database. We also fixed several calculation, security, and concurrency bugs found in the earlier prototype.

### 1.1 Main workflow built (changes since Report 2)
The core workflow now runs end-to-end on real PostgreSQL storage for `DMA-YASAMAL-04`, while `DMA-NASIMI-02` is used to test zone isolation:

1. **Telemetry ingestion (`POST /v1/telemetry/batch`):** Checks device tokens, verifies that each meter is active and belongs to the right DMA, checks units and timestamps, and blocks duplicate records in PostgreSQL. Older buffered readings (up to 72 hours) are saved as historical replay data without triggering false live alerts.
2. **Water balance and night flow (`GET /v1/dma/:id/balance`, `/night-flow`):** Reuses the same TypeScript domain code on stored PostgreSQL readings. Flow integration now stays strictly inside the requested time window, separates missing gaps from measured coverage, and calculates each meter separately before adding them together (two 100 m³/h inlet meters over 15 minutes equal 50 m³). We retired the old incorrect SQL averaging view.
3. **Incident lifecycle and server-side checks (`POST /v1/incidents/:id/transition`):** The server no longer trusts a client-sent "success" flag. It evaluates post-repair night flow, data coverage, and pressure itself. If flow is still too high, the incident goes back to `IN_REPAIR`; if evidence is incomplete, the API returns HTTP `422`.
4. **Concurrency, idempotency, and outbox notifications:** Every incident update checks `expectedVersion` and returns HTTP `409` on conflicting edits. Repeated requests with the same `command_id` return the original result safely across restarts. Incident changes, audit logs, and outbox notifications are saved together in one PostgreSQL transaction, and failed notifications retry with backoff.
5. **Frontend connection:** The React dashboard now talks to the `/v1` API in Integrated Mode, keeps Static Demo Mode clearly separate, and shows real error banners (`403`, `409`, `422`, `503`) instead of silently falling back to fake data.

### 1.2 Verification results (tested locally on November 23, 2026)
- **Automated tests (`npm run test`):** `60/60` tests pass across `12` suites (`47` domain/unit tests and `13` PostgreSQL, HTTP, contract, and outbox tests).
- **API contracts (`npm run contracts:check`):** OpenAPI `3.1.0` (`13` routes) passed validation, and `telemetry.proto` compiled with `protoc`. A 60-record sample measured `5,319 bytes` in raw Protobuf (`631 bytes` gzipped) compared to `12,720 bytes` in JSON.
- **Ingestion benchmark (`npm run benchmark`):** Replacing single-row inserts with bulk `UNNEST` inserts increased speed from `161` to `1,316 observations/sec` (`8.17×` faster) and lowered p95 latency by `85.7%` (`3.35 s` down to `0.48 s`), with all `3,900` rows stored accurately. Selective balance queries used our composite index in `1.77 ms`.
- **Backup and restore drill (`npm run drill:backup-restore`):** We backed up the database with `pg_dump` (`2.57 s`) and restored it into a separate test database (`samt_restore_drill`) in `6.48 s`. All table and audit counts matched the backup snapshot.
- **Browser E2E test (`npm run e2e:browser`):** Headless Chrome tested `DMA-NASIMI-02` isolation, Viewer `403` blocking, `422` missing-evidence errors, full incident closure, and data reload persistence with `0` page errors.

---

## 2. Tools and design artifacts produced

### Tools used
- **Backend and database:** Node.js 22, TypeScript 5.7, Express 4, Zod, `pg`, Docker Compose, PostgreSQL 16.
- **Frontend, testing, and contracts:** React 19, Vite 6, Tailwind CSS, Vitest, Playwright (Chrome), Swagger Parser, `protoc` (`grpc-tools`).

### Main deliverables
1. **Updated spec and ADR:** [`SAMT_v1.1.0.md`](./SAMT_v1.1.0.md), [`CHANGELOG.md`](./CHANGELOG.md), and [`docs/adr/ADR-001-v1.1.0-postgresql-monolith.md`](./docs/adr/ADR-001-v1.1.0-postgresql-monolith.md).
2. **Backend service and schema (`server/`):** Express `/v1` API, dev RBAC middleware, PostgreSQL repositories, outbox dispatcher, and SQL migration [`001_initial_schema.sql`](./server/migrations/001_initial_schema.sql).
3. **Shared use cases (`prototype/src/application/`):** Shared TypeScript workflow logic used by both unit tests and the HTTP server.
4. **Updated contracts and scripts:** [`contracts/openapi.yaml`](./contracts/openapi.yaml), [`contracts/telemetry.proto`](./contracts/telemetry.proto), benchmark/backup/E2E scripts in [`scripts/`](./scripts/), CI workflow [`.github/workflows/ci.yml`](./.github/workflows/ci.yml), and raw logs in [`verification-evidence/`](./verification-evidence/).
5. **Project documentation:** Updated [`TRACEABILITY.md`](./TRACEABILITY.md), [`VERIFICATION.md`](./VERIFICATION.md), and [`README.md`](./README.md).

---

## 3. Technical challenges and trade-offs

### 3.1 Main challenges solved
1. **Avoiding duplicated business logic:** By keeping the domain rules and use cases in pure TypeScript under `prototype/src/`, both Vite and the Node server run the exact same calculations instead of copying formulas into SQL or another language.
2. **Database write bottleneck:** Our first benchmark showed row-by-row SQL inserts reaching only `161 obs/sec` because each batch made 60 round-trips. Switching to one bulk `UNNEST` query per batch gave an `8.17×` speedup.
3. **Local integration issues:** Running database tests in parallel caused table resets to collide, so we configured sequential execution for server suites. We also mapped SAMT's PostgreSQL container to host port `5433` to avoid conflicting with port `5432`.

### 3.2 Key quality scenarios (from course materials)
- **Concurrency and retries (`lectures_merged.pdf`, pp. 4–5, 32, 117):** When two dispatchers update the same incident version at once, one succeeds and the other gets HTTP `409`. Retrying the same `command_id` returns the saved outcome without duplicating audit logs.
- **Database failure handling (`lectures_merged.pdf`, pp. 65–67, 72–75):** When PostgreSQL is unreachable, `/ready` and write routes return HTTP `503`, no lost writes are confirmed, and the UI displays an error banner.
- **Measured optimization (`lectures_merged.pdf`, pp. 104–109):** Using a fixed-seed workload (`3,600` readings across 4 concurrent clients), we measured before and after the bulk insert change and verified row accuracy.

### 3.3 Main architecture trade-offs

| Decision | Chosen for `v1.1.0` | Deferred option | Why |
| :--- | :--- | :--- | :--- |
| **Backend setup** | Single Node/TS service + PostgreSQL 16 (`ADR-001`) | Separate Go/Rust, Kafka, Flink, and TimescaleDB services | Keeps the prototype simple to test and verify before adding distributed complexity (`lectures_merged.pdf`, pp. 75, 128). |
| **Balance calculation** | Run shared TypeScript integrator on stored rows | SQL continuous aggregate view | Fixes the old wrong averaging view and guarantees API and unit tests always agree. |
| **Notifications** | PostgreSQL outbox table + local test receiver | External Kafka + live SMS service | Keeps notifications atomic with incident updates and easy to test locally with retries. |

---

## 4. Personal and peer feedback

### Individual team duties

#### Elmaddin (System Architect & Backend Lead)
- Built the Node.js/TypeScript `/v1` API and PostgreSQL repositories.
- Implemented optimistic version locking (`409`), command idempotency, and server-side verification checks.
- Fixed the flow-window clipping logic and connected the shared TypeScript domain code to the server.

#### Adil (API Contracts & Security)
- Updated the OpenAPI 3.1 specification and compiled `telemetry.proto` with `protoc`.
- Measured the 60-record Protobuf vs. JSON payload sizes and maintained the contract validation script.
- Tested server-side role permissions and error responses (`401`, `403`, `409`, `422`).

#### Zahra (Frontend Integration & E2E Testing)
- Connected the React 19 dashboard to the `/v1` endpoints in Integrated Mode.
- Added status indicators and clear error banners (`403`, `409`, `422`, `503`), while keeping Static Demo Mode separate.
- Verified the end-to-end user flow and reload persistence in headless Chrome.

#### Sanan (Database, Performance & Recovery)
- Designed the PostgreSQL 16 migration script and composite index for DMA balance queries.
- Ran the ingestion benchmark comparing row-by-row inserts with bulk `UNNEST` (`8.17×` speedup).
- Executed and verified the isolated `pg_dump` / `pg_restore` recovery drill.

#### Ali (Documentation, Traceability & QA)
- Updated `SAMT_v1.1.0.md`, `ADR-001`, `TRACEABILITY.md`, and `VERIFICATION.md`.
- Checked course PDF references and documented the architecture trade-offs.
- Verified cross-DMA isolation test cases between `DMA-YASAMAL-04` and `DMA-NASIMI-02`.

### Self-review takeaways
During our review of `v1.0.1` and `v1.1.0`, we caught and fixed three main issues:
1. **Trusting client input:** Moving verification decisions and role checks to the server stopped clients from faking a successful repair check.
2. **Hidden data gaps:** Clipping flow windows prevented missing sensor data from appearing as 100% coverage, and we corrected earlier notes in the test panel and `TRACEABILITY.md`.
3. **Clear project limits:** We clearly separated local dev tokens, synthetic data, and local test runs from production claims.

---

## 5. Next steps (Report 4 roadmap)

### Current limitations
1. **Dev-only authentication:** Static tokens in `.env` test role enforcement locally, but production needs short-lived JWTs or mTLS certificates.
2. **Contract-only Protobuf:** `telemetry.proto` compiles cleanly, but live ingestion currently uses HTTP/JSON.
3. **Synthetic data and cold backups:** All readings are synthetic, and the drill tested logical `pg_dump`/`pg_restore` rather than continuous WAL point-in-time recovery.

### Plan for Milestone 4
1. **Verify hosted GitHub Actions CI:** Confirm `.github/workflows/ci.yml` passes cleanly on GitHub runners and save the run log.
2. **Point-in-time recovery (PITR) drill:** Enable PostgreSQL WAL archiving in Docker Compose and test timed recovery.
3. **Stronger auth and metrics:** Replace static dev tokens with signed JWTs, add basic rate limiting, and expose simple latency/error metrics.
4. **Final report and demo:** Prepare Report 4, presentation slides, and a short live walkthrough of the full incident lifecycle.
