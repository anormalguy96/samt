# SAMT (Su Əməliyyatlarının Mərkəzləşdirilmiş Təhlili)
### Centralized Water Operations Analytics & Constrained Allocation (`v1.1.0`)

**Course Alignment:** Software System Design (CMU 17-423 / 17-723 Alignment)  
**Author / Architect:** Elmaddin Mohubbatov (Group 550RI-I / Team SAMT)  
**Current Version:** `SAMT v1.1.0` (`feat/samt-v1.1.0`, preserving `v1.0.0` and `v1.0.1` historical specs & reports)  
**Runtime Stack:** React 19 + TypeScript 5.7 + Vite 6 + Tailwind CSS 3.4 | Node.js 22 + Express 4 + Zod + `pg` | PostgreSQL 16 (`postgres:16.4-alpine`) | Vitest 4.1.12

> [!NOTE]
> SAMT `v1.1.0` is an academic decision-support prototype operating exclusively on **synthetic hydraulic data**. Physical valve/pump actuation, live utility SCADA integration, public internet deployment, and real-world physical savings measurement are explicitly out of scope.

---

## 1. What `SAMT v1.1.0` Delivers

SAMT `v1.1.0` turns the Milestone 2 browser-only prototype into a **locally runnable, persistent operational workflow** reusing the exact same pure TypeScript domain core (`prototype/src/domain/` and `prototype/src/application/`) across the HTTP API, PostgreSQL 16 persistence layer, automated test suites, and React 19 UI:

```text
Synthetic Telemetry -> Authenticated /v1 HTTP Ingestion -> Validation & Durable Dedup
  -> PostgreSQL 16 Readings -> Clipped Per-Meter DMA Balance & Night-Flow Assessment
  -> Reviewable Incident (CAS + Idempotent Commands) -> Authorized Crew Repair
  -> Server-Side Evidence Verification -> Closure, Durable Audit & Transactional Outbox
```

Key verified properties in `v1.1.0`:
- **Primary & Isolation DMAs:** `DMA-YASAMAL-04` runs the full operational lifecycle; `DMA-NASIMI-02` verifies strict cross-DMA data isolation.
- **Clipped Per-Meter Integration & Balance:** Integrates each meter individually clipped to `[windowStart, windowEnd]`, excludes unmeasured long gaps from `coverageRatio`, never fabricates duration for a single point, and sums boundary meters (`2 × 100 m³/h × 0.25 h = 50.0 m³`).
- **Authoritative Server-Side Verification:** Ignores caller-supplied `isSuccessful` flags; evaluates comparable pre/post nocturnal windows, coverage (`>= 80%`), sample count (`>= 8`), evidence provenance, and Torricelli pressure normalization on the server.
- **ACID Concurrency, Idempotency & Outbox:** Strict `expectedVersion` compare-and-swap (`409 VERSION_CONFLICT`), persistent `command_id` + SHA-256 payload-hash idempotency across server restarts, single-transaction commit of incident + command receipt + audit + `notification_outbox`, and bounded retries with dead-lettering against an idempotent local receiver.
- **Server-Side RBAC & Honest Degradation:** Local dev tokens enforce `viewer`, `dispatcher`, and `device` roles on the server (`401`/`403`); database outages return honest HTTP `503` without silently falling back to static demo data.
- **Preserved Mathematical Regression Cases:** Constrained allocation (`900/705` and `610`) and illustrative Torricelli savings (`100 @ 4 bar vs 50 @ 1 bar = 0.0 m³/h`, visible negative savings) remain verified via both pure domain tests and `/v1` API endpoints.

---

## 2. Prerequisites & Local Setup

### Prerequisites
- **Node.js:** `v20+` (verified on `v22.11.0`) and **npm** `v10+` (verified on `11.13.0`)
- **Docker + Docker Compose:** for PostgreSQL `16.4-alpine` (mapped by default to host port **`5433`** to avoid colliding with local PostgreSQL instances on `5432`)

### Quick Start (PostgreSQL 16 + API Server + React UI)

```bash
# 1. Configure local environment variables (do not commit .env)
cp .env.example .env

# 2. Install workspace dependencies
npm --prefix prototype install
npm --prefix server install

# 3. Start PostgreSQL 16 on localhost:5433
npm run db:up

# 4. Run SQL migrations and seed synthetic DMAs & meters
npm run db:migrate
npm run db:seed

# 5. Start the Node/TypeScript HTTP API (http://localhost:4000)
npm run dev:server

# 6. In a second terminal, start the React 19 UI (http://localhost:5173, proxies /v1 to :4000)
npm run dev:web
```

> **Windows PowerShell note:** Use `Copy-Item .env.example .env` instead of `cp`, and run commands sequentially with `;` rather than `&&` in older Windows PowerShell 5.1 shells.

### Local Development Credentials (from `.env.example`)
These tokens are strictly for local development and automated verification:
- **Dispatcher (`BearerAuth`):** `dev-dispatcher-token-samt-v1` (read + incident transitions + assessments + outbox dispatch)
- **Viewer (`BearerAuth`):** `dev-viewer-token-samt-v1` (read-only; mutating routes return `403 FORBIDDEN`)
- **Edge Device (`X-Device-Token`):** `GW-YAS-01` → `dev-device-token-gw-yas-01`, `GW-NAS-01` → `dev-device-token-gw-nas-01`

---

## 3. Exact Verification Commands

All checks below can be executed from the repository root (`postgres:16.4-alpine` must be running for server tests, benchmark, backup/restore drill, and browser E2E):

```bash
# Strict TypeScript checking across prototype/ and server/
npm run typecheck

# All 60 automated tests (47 domain/unit tests + 13 live PostgreSQL/HTTP/contract/outbox tests)
npm run test

# OpenAPI 3.1 schema validation + real protoc (libprotoc 3.19.1) compilation + 60-record fixture sizing
npm run contracts:check

# Build server TypeScript output and single-file React bundle
npm run build

# Reproducible ingestion benchmark (ROW_BY_ROW vs UNNEST bulk upsert, seed=20261123)
npm run benchmark

# Isolated pg_dump / pg_restore verification drill (uses temporary samt_restore_drill DB)
npm run drill:backup-restore

# Live headless Google Chrome E2E across UI -> API -> PostgreSQL 16
npm run e2e:browser
```

---

## 4. Local Demonstration Script (Integrated Mode vs. Static Demo Mode)

### Part A — Integrated Mode (`API + PostgreSQL 16`)
1. Open `http://localhost:5173` while `npm run dev:server` and `samt-postgres` are running. Confirm the header shows **Integrated Mode (API + PostgreSQL 16)** and healthy backend status.
2. **DMA Isolation Check (`DMA-NASIMI-02`):** Select **Nəsimi DMA-02** in the GIS tab (`tab-gis`), then open **İş Əmrləri (`tab-workorders`)**. Verify it displays an empty state with zero bleed from `DMA-YASAMAL-04`.
3. **RBAC Check (`403 FORBIDDEN`):** Switch the auth role selector in the header to **Viewer (Read-Only)** and attempt a transition or assessment. Confirm the server rejects the request with HTTP `403` and the UI surfaces the error banner cleanly.
4. **Full Operational Lifecycle (`DMA-YASAMAL-04`):** Switch back to **Dispatcher**, select **Yasamal DMA-04**, ingest synthetic telemetry / run hydraulic assessment (`POST /v1/dma/DMA-YASAMAL-04/assess`), and step the created incident through:
   - `DETECTED → ASSIGNED` (assign crew + positive ETA; also enqueues a `notification_outbox` record)
   - `ASSIGNED → IN_REPAIR` (start repair)
   - `IN_REPAIR → REPAIRED` (record repair method and evidence)
   - **Guard Counter-tests on Verification:**
     - Submitting insufficient post-repair samples (`< 8`) returns HTTP `422` and keeps the incident in `REPAIRED`.
     - Submitting elevated post-repair flow (even with a forged `is_successful: true`) triggers server-side rework back to `IN_REPAIR`.
   - Submitting compliant post-repair evidence (`>= 8` samples, `>= 80%` coverage, post-repair flow within baseline envelope) advances `REPAIRED → VERIFIED` (`VERIFIED_SYNTHETIC_POLICY`) and then `VERIFIED → CLOSED`.
5. **Persistence & Concurrency Proof:** Hard-reload the browser (`Ctrl+R`) and verify the `CLOSED` incident, its incremented `version`, and the PostgreSQL `audit_events` trail reload intact from the database.

### Part B — Static Demo / Test Mode & Mathematical Tools
1. Switch to **Static Demo / Test Mode** in the header (or open the standalone bundle `prototype/dist/index.html`) to inspect isolated client-side tools:
   - **Test Seam (`tab-testability`):** Time-travel the `FixedClock` seam to `03:00 AZT` and trigger telemetry validation fault scenarios (`TelemetryValidator`).
   - **Hexagonal Inspector (`tab-hexagonal`):** Inspect interchangeable `InMemoryIncidentRepository` vs. `ValidatedJsonFixtureIncidentRepository` demo stores.
   - **Allocation Solver (`tab-allocation`):** Verify `900` supply / `705` demand (`0` deficit, `195` residual) and `610` scarce priority-weighted allocation.
   - **Savings Estimator (`tab-opendata`):** Verify the Torricelli counterexample (`100 m³/h @ 4.0 bar` vs. `50 m³/h @ 1.0 bar`, `α = 0.5` → **`0.0 m³/h`** physical savings).

---

## 5. Repository Documentation & Historical Records

### Current `SAMT v1.1.0` Deliverables
- [`SAMT_v1.1.0.md`](./SAMT_v1.1.0.md) — Updated technical & architectural specification (C4 views, data model, contracts, security, empirical verification, and future roadmap).
- [`report_3.md`](./report_3.md) — Milestone 3 Progress Report (delta from Report 2, verified metrics, ATAM scenarios, self-review, Report 4 plan).
- [`docs/adr/ADR-001-v1.1.0-postgresql-monolith.md`](./docs/adr/ADR-001-v1.1.0-postgresql-monolith.md) — ADR reconciling earlier distributed roadmaps with the verified modular monolith + PostgreSQL 16 priority.
- [`TRACEABILITY.md`](./TRACEABILITY.md) — Course traceability matrix with directly verified physical PDF page anchors.
- [`VERIFICATION.md`](./VERIFICATION.md) — Full test, contract, benchmark, `EXPLAIN`, backup/restore drill, and live Chrome E2E record.
- [`CHANGELOG.md`](./CHANGELOG.md) — Version history (`1.0.0`, `1.0.1`, `1.1.0`).
- [`contracts/openapi.yaml`](./contracts/openapi.yaml), [`contracts/telemetry.proto`](./contracts/telemetry.proto), [`contracts/schema.sql`](./contracts/schema.sql), and [`server/migrations/001_initial_schema.sql`](./server/migrations/001_initial_schema.sql).
- [`verification-evidence/`](./verification-evidence/) — Retained raw logs and JSON outputs from every local verification run.

### Preserved Historical Records (Unmodified by `v1.1.0`)
- [`report_1.md`](./report_1.md), [`report_2.md`](./report_2.md), [`SAMT_v1.0.0.md`](./SAMT_v1.0.0.md), [`SAMT_v1.0.1.md`](./SAMT_v1.0.1.md).
