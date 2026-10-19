# KURA — EXECUTIVE ARCHITECTURE & SYSTEM SUMMARY
## High-Level Synthesis of System Design & Engineering Specifications

**Document Reference:** `SR-SYS-SUMMARY-2026-V1`  
**Companion Document:** [SAMT_v1.0.0.md](file:///d:/github_repos/water/SAMT_v1.0.0.md)  
**Governing Entities:** Azerbaijan State Water Resources Agency (ADSEA) / United Water Supply Service of Large Cities / IRIA  
**Author / Team:** Team Kura  
**Date:** September 2026  

---

## Quick Navigation / At-a-Glance

| Core Pillar | Key Technical Takeaway | Primary Metric / Standard |
|---|---|---|
| **Mission & Operating Loop** | Closed operational feedback loop: **Sense → Understand → Act → Prove** | Operational engine operating *behind* `mygov` |
| **National Challenge** | High paper access (~95%) vs severe physical distribution loss | **28%** CIS peak average; **up to 55%** in Greater Baku |
| **Domain Architecture** | Domain-Driven Design (DDD) with clear bounded contexts | 2 Core, 3 Supporting, 3 Generic subdomains |
| **Open Data Integration** | Automated ingestion of 4 official open datasets from `opendata.az` | Macro loss, water quality, river GIS, irrigation quotas |
| **Technology Core** | Rust edge + Kafka streaming + Flink analytics + TimescaleDB + PostGIS | Sub-second streaming; $>92\%$ time-series compression |
| **Capacity (National)** | 280,000 endpoints; 5,800 sustained events/s (40,300 burst) | 48.2 GB/day raw $\rightarrow$ 3.37 GB/day compressed |
| **Sovereign Security** | 4-Zone sovereign architecture hosted on *Hökumət Buludu* | Cabinet of Ministers Decrees No. 229 & 230; Read-only MVP |
| **Verification (M&V)** | IPMVP Option B empirical night-flow reduction verification | Pressure-normalized verified $m^3$ water saved |

---

## 1. Problem Statement & The Azerbaijani Context

```
  NOMINAL REALITY (On Paper)              OPERATIONAL REALITY (In the Network)
┌───────────────────────────────┐        ┌────────────────────────────────────┐
│ ~95% Access to improved       │  VS    │ 28% National average NRW loss      │
│ drinking water sources        │        │ Up to 55% loss in Greater Baku     │
└───────────────────────────────┘        └────────────────────────────────────┘
```

1. **The Infrastructure Gap:** Primary reservoirs (Jeyranbatan, Shamkir, Takhtakorpu) supply sufficient bulk treated water, but distribution through aged, unmonitored networks dissipates up to half the volume before reaching endpoints.
2. **Climate & Agricultural Risk:**
   * Drought-impacted cropland increased **2.6× in 3 years**: **68,600 ha (2020)** $\rightarrow$ **178,300 ha (2023)**.
   * **53% of Azerbaijan's GDP** sits in water-dependent economic sectors.
   * Transboundary freshwater dependency exceeds **70%** (originating in Georgia, Armenia, Turkey, Iran, Russia).
3. **The Operational vs. Administrative Divide:**
   * Citizen portals (`mygov`) successfully digitized bill payment and complaints.
   * Distribution operations still lack boundary telemetry, automated leak localization, and objective allocation scheduling.
   * **Kura operates behind `mygov`**, functioning as the real-time operational data layer.

---

## 2. Domain-Driven Design (DDD) Subdomain Map

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                                    KURA SYSTEM                                   │
├──────────────────────────────────────────────────────────────────────────────────┤
│ CORE SUBDOMAINS (High Business Value & Competitive Advantage)                    │
│  ├─ 1. DMA Water Balance & Leak Localization: Inflow - Outflow mass balance,     │
│  │     Minimum Night Flow (MNF 02:00-04:00 AM), 50 Hz acoustic & pressure bursts│
│  └─ 2. Equitable Multi-Criteria Allocation Engine: Mixed-Integer Linear          │
│        Programming (MILP) fair dispatch for canal irrigation and water tankers    │
├──────────────────────────────────────────────────────────────────────────────────┤
│ SUPPORTING SUBDOMAINS (Essential Capabilities)                                   │
│  ├─ 3. Asset Failure Risk Index: Likelihood x Consequence (LoF x CoF) pipe rating│
│  ├─ 4. Field Work Orders & M&V: Offline PWA dispatch, photo evidence, M&V audit  │
│  └─ 5. Open Data Harmonizer: opendata.az baseline ingestion & cross-calibration  │
├──────────────────────────────────────────────────────────────────────────────────┤
│ GENERIC SUBDOMAINS (Standard Infrastructure)                                     │
│  ├─ 6. IoT Device Identity & PKI: mTLS 1.3, X.509 certs, battery telemetry       │
│  ├─ 7. Sovereign Security & CII Audit: RBAC, immutable tamper logs (Decree 229)   │
│  └─ 8. Notification Gateway: SMS, USSD, and e-government dispatch adapters       │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Open Data Integration (`opendata.az`)

Kura grounds its calculations in empirical national data published by official state agencies:

```
                      opendata.az (Azerbaijan Open Data Portal)
                                         │
       ┌──────────────────┬──────────────┴─────┬─────────────────┐
       ▼                  ▼                    ▼                 ▼
┌──────────────┐   ┌──────────────┐     ┌──────────────┐  ┌──────────────┐
│Dataset 1     │   │Dataset 2     │     │Dataset 3     │  │Dataset 4     │
│Su resursları │   │Suyun         │     │Monitorinq    │  │Suvarılan     │
│və istifadə   │   │keyfiyyəti    │     │nöqtələri     │  │torpaqlar &   │
│(Stat. Kom.)  │   │(Birləşmiş Su)│     │(ADSEA)       │  │Su təchizatı  │
└──────┬───────┘   └──────┬───────┘     └──────┬───────┘  └──────┬───────┘
       │                  │                    │                 │
       ▼                  ▼                    ▼                 ▼
Macro Loss Bal.    Cross-Contam. Alert  Intake Boundaries  Fair Allocation
(Top-down audit)   (Chlorine/Turbidity) (Kura/Aras/Samur)  (District Quotas)
```

1. **`Su resursları və onlardan istifadə edilməsi` (State Statistical Committee):**
   * Annual time-series (2015–2024) of natural abstraction, sector consumption, and transmission losses (*nəql edilərkən itən su*).
   * Calibrates top-down national water accounting against aggregated bottom-up DMA metrics.
2. **`Suyun keyfiyyəti - Mərkəzi laboratoriya` (United Water Supply Service / ADSEA):**
   * Daily sample testing & weekly average concentrations (chlorine, turbidity, TDS) in Greater Baku & Absheron.
   * Correlates sudden hydraulic pressure drops with contaminant ingress risks.
3. **`Monitorinq nöqtələri` (ADSEA Water Monitoring Sector):**
   * Geographical GIS coordinates, monitoring frequencies, and background (*f/k*) vs. control (*n/k*) river cross-sections.
   * Models intake boundary conditions for main aqueducts feeding municipal water treatment facilities.
4. **`Su təchizatı` & `Suvarılan torpaqlar` (State Statistical Committee & Min. Agriculture):**
   * District-level irrigated hectares, network pipe lengths, and served populations.
   * Supplies the baseline denominators for agricultural water deficit penalties.

---

## 4. Architecture & Technology Stack Cheat Sheet

```
[Sensors & Boundary Meters]
           │ (Modbus / 4-20mA / Pulse)
           ▼
[Rust Edge Gateways (SQLite 72h Buffer)]
           │ (MQTT v5.0 over mTLS 1.3 / Protobuf payload <120 B)
           ▼
[Sovereign Ingestion DMZ: HAProxy + EMQX Broker Cluster]
           │ (Strict internal event bus)
           ▼
[Apache Kafka / Redpanda (Partitioned by DMA_ID)]
           │
     ┌─────┴─────────────────────────┐
     ▼                               ▼
[Apache Flink Stream Engine]   [Microservices Tier (Go)]
  - 15-min Sliding Water Bal.    - Asset Risk Calculator
  - 02:00-04:00 AM MNF Engine    - Work Order State Machine
  - Transient Burst Detection    - Open Data Ingestion Worker
     │                               │
     └──────────────┬────────────────┘
                    ▼
[Hybrid Storage Tier]
  - TimescaleDB: Partitioned time-series telemetry (LZ4 compressed)
  - PostgreSQL + PostGIS: GIS network topology & audit records
  - Redis Cluster: Active state cache & distributed locks
  - MinIO: Sovereign object store (photos, acoustic WAVs)
                    │
                    ▼
[Presentation & Workflows]
  - Control Room: Next.js 14 + MapLibre GL / Deck.gl GPU rendering
  - Field Crews: Offline-first PWA with IndexedDB / RxDB sync
  - Allocation Solver: Python 3.11 + Google OR-Tools (MILP)
  - Citizen Integration: mygov & National SMS Gateway
```

### Technology Matrix

| Layer | Selected Tech | Core Justification |
|---|---|---|
| **Edge Hardware/OS** | ARM Cortex-M4 / ESP32-S3, **Rust / FreeRTOS** | Memory safety, zero GC pauses, 5–7 yr battery life |
| **Edge Store & Forward** | **SQLite (WAL) / DuckDB embedded** | 72-hour autonomous buffer during cellular blackouts |
| **IoT Protocol** | **MQTT v5.0 over TLS 1.3 + Protobuf** | $<120\text{ bytes/packet}$, message expiry, user properties |
| **Message Streaming** | **Apache Kafka / Redpanda** | Scalable, ordered partition by `DMA_ID`, high throughput |
| **Stream Analytics** | **Apache Flink** | True event-time streaming, sliding windows for MNF |
| **Time-Series DB** | **TimescaleDB (PostgreSQL engine)** | SQL compliance, hypertable partitioning, $>92\%$ compression |
| **Spatial / Asset DB** | **PostgreSQL 16 + PostGIS 3.4** | Complete spatial routing, pipeline intersection analysis |
| **In-Memory Cache** | **Redis Cluster 7.2** | Sub-millisecond sensor state cache, distributed Redlocks |
| **Object Store** | **MinIO (S3-compatible)** | On-premise sovereign storage for geotagged repair photos |
| **Optimization Solver**| **Python 3.11 + Google OR-Tools** | Mixed-Integer Linear Programming for canal/tanker schedules |
| **Web Console** | **Next.js 14 + MapLibre GL / Deck.gl** | GPU vector tile rendering of large pipe networks in Dark Mode |
| **Field Mobile App** | **Offline-First PWA + RxDB / IndexedDB** | Full offline capability in underground utility pits |

---

## 5. Capacity Estimations & System Sizing

```
                               CAPACITY EVOLUTION
   Metric                     Phase 1 (Pilot)     Phase 2 (Baku)      Phase 3 (National)
  ───────────────────────────────────────────────────────────────────────────────────────
   Scope                      1 Baku DMA          150 DMAs            500 DMAs + Canals
   Active Endpoints           1,520 devices       53,100 devices      280,000 devices
   Sustained Ingestion Rate   ~5 events/sec       ~580 events/sec     ~5,800 events/sec
   Peak Transient Rate        ~50 events/sec      ~3,500 events/sec   ~40,300 events/sec
   Daily Raw Data Volume      ~0.04 GB / day      ~4.8 GB / day       ~48.2 GB / day
   Compressed TSDB (Yearly)   ~1.4 GB / year      ~175 GB / year      ~1.23 TB / year
   Network Bandwidth          Negligible          ~4.5 KB/sec         ~29.1 KB/sec (0.23 Mbps)
```

* **Storage Compression Math:** Raw uncompressed daily ingest of $48.2\text{ GB}$ achieves **92–94% compression** in TimescaleDB hypertables, reducing the national footprint to **$3.37\text{ GB/day}$ ($1.23\text{ TB/year}$)**.
* **National Compute Envelope:** 3 Kafka brokers (4 vCPU, 16 GB RAM), 4 Flink workers (8 vCPU, 32 GB RAM), 1 Primary TimescaleDB cluster (16 vCPU, 64 GB RAM, $>15,000\text{ IOPS}$ NVMe).

---

## 6. Requirements Summary

### 10 Functional Requirements (FR)
* **`FR-01` mTLS 1.3 Device Authentication:** Reject unverified certificates or $>15\text{ min}$ clock drift.
* **`FR-02` 15-Minute DMA Mass Balance:** Continuous net volume delta calculation across multi-inlet zones.
* **`FR-03` Minimum Night Flow (MNF):** 02:00–04:00 AM baseline decomposition and statistical anomaly alerts ($\Delta Q > 3\sigma$).
* **`FR-04` Pipe Risk Priority Number (RPN):** Dynamic GIS mapping of $\text{Likelihood} \times \text{Consequence of Failure}$.
* **`FR-05` Closed-Loop Work Orders:** Strict state transitions (`DETECTED` $\rightarrow$ `REPAIRED` $\rightarrow$ `VERIFIED`) requiring geotagged photo proof.
* **`FR-06` Multi-Criteria Allocation:** MILP solver balancing crop wilting ($K_c$), time elapsed, and $50\text{ L/capita/day}$ human survival minimums.
* **`FR-07` Explainable Reason Codes & Audit:** Machine/human-readable justification code for every delivery or deferral.
* **`FR-08` opendata.az Auto-Ingestion:** Nightly ETL pipeline harmonizing national open data indicators.
* **`FR-09` IPMVP Option B Verification:** 14-day post-repair night-flow validation against pre-repair baselines.
* **`FR-10` Azerbaijani Language First:** Sovereign localized UI with secondary English support.

### 10 Non-Functional Requirements (NFR)
* **`NFR-01` Latency:** P95 sensor-to-screen visualization latency $<2.0\text{ seconds}$.
* **`NFR-02` High Availability:** $\ge 99.9\%$ annual uptime for core telemetry pipelines.
* **`NFR-03` Edge Autonomy:** 72-hour offline local buffering on edge gateway flash memory.
* **`NFR-04` Zero Data Loss:** At-least-once message delivery with consumer deduplication keys.
* **`NFR-05` Sovereign CII Compliance:** Strict compliance with Azerbaijani Decrees No. 229 & 230; hosted on *Hökumət Buludu*.
* **`NFR-06` Zero-Trust RBAC:** Complete role-based segregation with 10-year immutable audit log retention.
* **`NFR-07` Scalability:** Linear scale from 1 to 500+ DMAs without architectural refactoring.
* **`NFR-08` Tiered Data Retention:** 1-sec raw data (90 days), hourly rollups (indefinite), daily rollups (10 years).
* **`NFR-09` Offline Field Capability:** IndexedDB local storage in PWA for underground utility vaults.
* **`NFR-10` Open Standards:** REST, GraphQL, and OGC-compliant (WMS/WFS) GIS map feeds.

---

## 7. Sovereign Security & Infrastructure Topology

```
+-------------------------------------------------------------------------------+
|                       CRITICAL INFRASTRUCTURE DEFENSE                         |
+-------------------------------------------------------------------------------+
| Zone 0: OT & Field Layer       - Battery-backed sensors, private APN VPN      |
| Zone 1: Sovereign Ingestion DMZ- WAF, DDoS shield, mTLS 1.3 termination       |
| Zone 2: Sovereign Cloud Core   - Hökumət Buludu (AzInTelecom Baku + Yevlakh DR)|
| Zone 3: Presentation & Gateways- RBAC, mygov adapter, CERT.gov.az SIEM sync   |
+-------------------------------------------------------------------------------+
```

* **Physical Actuator Air-Gap:** The MVP strictly enforces **Read-Only Telemetry**. Remote cloud control of valves/sluice gates is explicitly prohibited to prevent cyber-physical sabotage. All valve interventions are executed manually by certified personnel.
* **National Compliance:** Meets Cabinet of Ministers Decrees No. 229 & 230 (CII protection), FIPS 140-2 Level 3 HSMs, and integration with `CERT.gov.az`.
* **Disaster Recovery:** RPO $<1\text{ minute}$ for operational telemetry ($0\text{ seconds}$ for audit/work orders); RTO $<15\text{ minutes}$ automated cluster failover between Baku and Yevlakh.

---

## 8. Pilot Scope, Verification (M&V) & Acceptance Gates

### 16-Week Pilot Delivery Timeline
* **Weeks 1–4 (Phase 0 - Discovery):** DMA hydraulic boundary selection, CII threat modeling, `opendata.az` ingestion.
* **Weeks 5–8 (Phase 1 - Instrument):** Deploy 4 boundary flow meters & 16 pressure transducers; 4-week baseline capture.
* **Weeks 9–12 (Phase 2 - Understand & Assist):** Launch Flink MNF engine, deploy offline PWA to crews, execute repairs.
* **Weeks 13–16 (Phase 3 - Prove & Verify):** Run IPMVP Option B post-repair verification; present verified pilot scorecard.

### Empirical Water Savings Formula (IPMVP Option B)
$$\text{Saved Volume } (m^3) = \sum_{t=1}^{T} \left[ \left( Q_{\text{MNF, baseline}} - Q_{\text{MNF, post-repair}}(t) \right) \times \left( \frac{P_{\text{post}}(t)}{P_{\text{base}}} \right)^{\alpha} \times 24 \right]$$
* Normalized for line pressure changes ($P_{\text{post}} / P_{\text{base}}$) using pipe leak exponent $\alpha$ (0.5 for rigid pipes, 1.15 for plastic pipes) to ensure savings reflect genuine leak elimination rather than low pumping pressure.

### Falsifiable Kill / Scale Acceptance Gates

```
┌───────────────────────────────────────────────┬───────────────────────────────┐
│ Metric                                        │ Threshold for Scale-Up        │
├───────────────────────────────────────────────┼───────────────────────────────┤
│ Telemetry Ingestion Reliability               │ ≥ 98.5% valid packets         │
│ Edge Autonomy Zero Data Loss                  │ 100% during 48h blackout      │
│ Algorithmic Leak Precision                    │ ≥ 80% confirmed by excavation │
│ Mean Time to Confirm (MTTC)                   │ ≤ 4 hours                     │
│ Verified Physical Loss Reduction              │ ≥ 15% drop in DMA night flow  │
│ Economic Payback Feasibility                  │ Cost per m³ saved ≤ 0.40 AZN  │
└───────────────────────────────────────────────┴───────────────────────────────┘
```

---

## 9. Synthesis & Strategic Value

Kura converts the national water challenge from an invisible crisis into a manageable, data-driven engineering domain. By fusing **localized field telemetry**, **sovereign cloud security (*Hökumət Buludu*)**, **official datasets from `opendata.az`**, and **mathematically auditable allocation algorithms**, the platform provides Azerbaijan with the operational backbone needed to achieve its **2040 digital water modernization goals**.

---
*For in-depth architectural proofs, mathematical models, and database schemas, see the complete specification in [SAMT_v1.0.0.md](file:///d:/github_repos/water/SAMT_v1.0.0.md).*
