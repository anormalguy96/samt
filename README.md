# SAMT (Su Əməliyyatlarının Mərkəzləşdirilmiş Təhlili)
### Centralized Water Operations Analytics & Constrained Allocation
**Course Alignment:** Software System Design (CMU 17-423 / 17-723 Alignment)  
**Author / Architect:** Elmaddin Mohubbatov (Group 550RI-I / Team SAMT)  
**Technology Stack:** React 19, TypeScript 5.7, Vite 6, Tailwind CSS 3.4, Vitest 4.1.12

---

## 1. Project Overview

SAMT is an academic prototype for municipal water distribution monitoring and regional canal allocation in Azerbaijan. The system demonstrates key software engineering concepts from the System Design curriculum:
- **Shared Phenomena & Requirements:** Jackson-Zave specification boundaries separating environment phenomena from machine assertions ($SPEC \wedge ASM \Rightarrow REQ$).
- **State Machine Modeling:** Pure event-driven finite state machine with strict guards, typed errors, and hydraulic verification rework loops.
- **Design by Contract (DbC):** Rigorous preconditions, postconditions, and invariant checks on sensor telemetry and API boundaries.
- **Hexagonal Architecture (Ports & Adapters):** Pure framework-independent domain core with interchangeable in-memory and JSON fixture repository adapters.
- **Design for Testability:** Injectable `FixedClock` test seam enabling deterministic nocturnal Minimum Night Flow (MNF) analysis at 03:00 AZT during daylight hours, alongside recording test spies.
- **Constrained Fair Allocation:** Deterministic progressive-filling heuristic with priority redistribution and computed Gini equity metrics.
- **Torricelli Pressure Normalization:** M&V savings estimator correcting baseline leakage using Torricelli orifice scaling ($Q_{\text{leak}} \propto P^\alpha$).

---

## 2. Getting Started

### Prerequisites
- **Node.js:** v20.0.0 or higher (verified on Node v22.11.0)
- **npm:** v10.0.0 or higher (verified on npm 11.13.0)

### Installation & Execution
```bash
# Navigate to the prototype application directory
cd prototype

# Install dependencies
npm install

# Run automated domain & integration test suite (Vitest)
npm test

# Run tests with detailed verbose output
npx vitest run --reporter=verbose

# Start the interactive development server
npm run dev

# Build the portable single-file distribution (dist/index.html)
npm run build
```

---

## 3. Automated Test Suite (39 Tests across 8 Test Suites)

All domain logic, port contracts, mathematical regressions, and end-to-end workflows are tested with zero external dependencies:

```text
✓ src/tests/volumeIntegration.test.ts       (4 tests) - Trapezoidal Riemann integration (corrects 1,500 m³ bug)
✓ src/tests/constrainedAllocation.test.ts   (5 tests) - Progressive filling & Gini equity (satisfies all 705 demand)
✓ src/tests/nightFlowEvaluation.test.ts     (3 tests) - [02:00, 04:00) Asia/Baku night window & 03:00 clock seam
✓ src/tests/incidentStateMachine.test.ts    (6 tests) - Canonical lifecycle, guards, and failed verification rework
✓ src/tests/telemetryValidation.test.ts     (8 tests) - DbC bounds, clock drift, duplicates, and replay handling
✓ src/tests/portConformance.test.ts         (8 tests) - Identical contract tests across dual real adapters & spies
✓ src/tests/endToEndSyntheticWorkflow.test.ts (1 test) - Full connected pipeline from sensor to verification
✓ src/tests/illustrativeSavings.test.ts     (4 tests) - Torricelli pressure normalization counterexample
```

---

## 4. Step-by-Step Synthetic DMA Demonstration Script

The application is structured into 9 cohesive tabs demonstrating the full operational lifecycle:

### Step 1: Examine Topology & Select Pilot DMA
1. Open the **GIS Şəbəkə (GIS Network)** tab (`tab-gis`).
2. Click on **Yasamal DMA-04** (red node, coordinate 40.4093° N, 49.8671° E).
3. Observe that selecting Yasamal DMA-04 updates the global domain context across all tabs.

### Step 2: Testability Seam & Time-Travel to Night Window
1. Open the **Test Seam (Testability)** tab (`tab-testability`).
2. Click **"03:00 Gecə pəncərəsinə keç" (Jump to 03:00 Night Window)**.
3. Observe the clock seam jumping to `03:00:00 AZT` (within the `[02:00, 04:00)` Asia/Baku MNF window).
4. Verify that the nocturnal badge shows `"Gecə pəncərəsi aktivdir"`.
5. Toggle **Qəfil partlayış (Burst Anomaly)** to inject a simulated $38.4\text{ m}^3/\text{h}$ burst transient.

### Step 3: Inspect Diurnal Curve & Minimum Night Flow
1. Open the **MNF Balans (Diurnal & Night Flow)** tab (`tab-balance`).
2. Observe the shaded nocturnal region between `02:00` and `04:00`.
3. Review the decomposed metrics:
   - Total MNF: $78\text{ m}^3/\text{h}$
   - Legitimate domestic usage: $12\text{ m}^3/\text{h}$
   - Rooftop tank refill: $18\text{ m}^3/\text{h}$
   - Net physical loss: $48\text{ m}^3/\text{h}$

### Step 4: Advance Incident Finite State Machine
1. Open the **İş Əmrləri (Work Orders)** tab (`tab-workorders`).
2. Select the incident for **DMA-YASAMAL-04** in state `DETECTED`.
3. Click **"Briqada təyin et" (Assign Crew)**:
   - Select crew (e.g., *Briqada 04 - Əsas təmir heyəti*), verify ETA ($25\text{ min}$) and phone number.
   - Click Confirm. State transitions to `ASSIGNED`.
4. Click **"Təmirə başla" (Start Repair)**. State transitions to `IN_REPAIR`.
5. Click **"Təmir aktını qeyd et" (Record Repair Evidence)**:
   - Fill in repair method (e.g. *Boru klamplaşdırma və qaynaq*), acoustic frequency, and fixture photo.
   - Click Confirm. State transitions to `REPAIRED`.
6. Click **"Hidravlik yoxlama keçir" (Evaluate Verification)**:
   - Enter post-repair MNF ($26.5\text{ m}^3/\text{h}$). Since this is within the baseline envelope ($\le 30\text{ m}^3/\text{h}$), verification succeeds and transitions to `VERIFIED`.
   - *(Optional Counter-test: If post-repair MNF is left high at $65\text{ m}^3/\text{h}$, verification fails and the incident automatically reverts to `IN_REPAIR` for rework).*
7. Click **"İşi bağla" (Close Work Order)**. State transitions to `CLOSED`.

### Step 5: Verify Hexagonal Architecture & Interchangeable Adapters
1. Open the **Hexagonal (Ports & Adapters)** tab (`tab-hexagonal`).
2. Toggle between:
   - **In-Memory Repository:** Mutable in-memory store.
   - **Validated JSON Fixture Repository:** Seeded from pre-validated JSON fixtures with copy-on-write semantics.
3. Observe that incidents persist across both adapters and satisfy identical port contract tests.

### Step 6: Solve Constrained Water Allocation
1. Open the **Bölgü Həlledici (Allocation Solver)** tab (`tab-allocation`).
2. Adjust the available reservoir supply slider (e.g. set to $900\text{ thousand m}^3$).
3. Click **"Bölgünü hesabla" (Run Allocation)**:
   - Total demand = $705\text{ thousand m}^3$.
   - Observe that all $705\text{ thousand m}^3$ are satisfied (0 deficit, 195 residual in reservoir).
4. Lower the supply to $610\text{ thousand m}^3$ and run allocation:
   - Observe priority-weighted progressive filling redistributing scarce water according to canal capacities and weights, computing the real satisfaction Gini coefficient.

### Step 7: Calculate Pressure-Normalized Water Savings
1. Open the **Açıq Məlumat (Savings Estimator)** tab (`tab-opendata`).
2. Set baseline flow to $100\text{ m}^3/\text{h}$ at $4.0\text{ bar}$, post-repair flow to $50\text{ m}^3/\text{h}$ at $1.0\text{ bar}$ with $\alpha = 0.5$.
3. Observe that the calculated physical savings are **$0.0\text{ m}^3/\text{h}$**, preventing false claims resulting from pressure drops.
4. Set post-repair flow to $25\text{ m}^3/\text{h}$ at $1.0\text{ bar}$ to observe a verified physical savings of $25.0\text{ m}^3/\text{h}$ and $87,600\text{ AZN/year}$ illustrative cost avoidance.

---

## 5. Architectural Documents & Specifications
- [`TRACEABILITY.md`](file:///d:/github_repos/water/TRACEABILITY.md): Complete course traceability matrix mapping Lecture PDF pages to design decisions, code, and test cases.
- [`VERIFICATION.md`](file:///d:/github_repos/water/VERIFICATION.md): Empirical test and build verification record.
- [`contracts/openapi.yaml`](file:///d:/github_repos/water/contracts/openapi.yaml): Validated OpenAPI 3.0.3 specification for REST endpoints.
- [`contracts/telemetry.proto`](file:///d:/github_repos/water/contracts/telemetry.proto): Validated Protocol Buffers v3 contract for edge streaming.
- [`contracts/schema.sql`](file:///d:/github_repos/water/contracts/schema.sql): Validated PostgreSQL 16 + PostGIS 3.4 + TimescaleDB 2.14 DDL schema.
- [`report_2.md`](file:///d:/github_repos/water/report_2.md): Fully rewritten academic Milestone 2 report.
