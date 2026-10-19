# PROJECT PROGRESS REPORT

**Project title:** SƏMT - Su Əməliyyatlarının Mərkəzləşdirilmiş Təhlili
**Student name:** Elmaddin Mohubbatov  
**Group / Team name:** Group 550RI-I / Team Səmt
**Date:** October 6, 2026  
**Report number:** 1 / 4  

---

## 1. Completed Tasks

### Domain Definition and Project Boundary
We investigated the core challenges in Azerbaijan's water distribution infrastructure: while reported access to drinking water is high (approximately 95%), physical transmission and distribution losses remain substantial, estimated at around 28% nationally and up to 55% in parts of Greater Baku. The goal of SƏMT is to provide an operational intelligence layer that monitors network hydraulic behavior, assists in localizing physical losses, and supports fair water allocation.

To keep the project manageable and avoid duplicating administrative systems, we established a clear project boundary: SƏMT does not handle citizen billing, tariff collection, or administrative complaints, which are already addressed by government portals such as `mygov`. Instead, SƏMT functions as an internal operational data system that ingests field telemetry, calculates water balances, and provides decision support for utility operators and agricultural dispatchers.

### Stakeholder Identification
We identified four primary stakeholder groups:
* **Azerbaijan State Water Resources Agency (ADSEA):** System oversight, national water accounting, and policy thresholds.
* **United Water Supply Service of Large Cities:** Municipal drinking-water network operations, District Metered Area (DMA) maintenance, and repair dispatch.
* **Water User Associations (WUAs) and agricultural operators:** Regional irrigation canal scheduling, farm-level water requests, and drought allocation.
* **Citizens and subscribers:** End-users who receive water services and view outage notifications through existing public portals.

### Domain Decomposition
Using Domain-Driven Design (DDD) principles, we decomposed the system domain into preliminary Bounded Contexts:

* **Core subdomains:**
  * *DMA Water Balance & Leak Localisation:* Evaluates net hydraulic flow (inflow minus outflow) across discrete network zones, analyzes Minimum Night Flow (MNF) between 02:00 and 04:00 AM, and identifies flow anomalies.
  * *Water Allocation Engine:* Formulates scheduled deliveries for irrigation canals and emergency municipal tanker routes based on crop water requirements, delivery wait times, and available supply.
* **Supporting subdomains:**
  * *Asset Risk Scoring:* Evaluates pipeline failure likelihood based on pipe age, material, soil conditions, and past break records to prioritize inspections.
  * *Work Order Lifecycle:* Tracks leak incidents through identification, crew assignment, repair completion, and post-repair verification.
  * *External Data Harmonisation:* Ingests reference statistical data from `opendata.az` to compare local measurements against published macro indicators.
* **Generic subdomains:**
  * *Device Identity & Authentication:* Manages edge gateway registration and secure authentication using TLS 1.3 with client certificates.
  * *Security & Audit Logging:* Maintains role-based access control and immutable logs of operator interventions.
  * *Notification dispatch:* Routes operational alerts via SMS or external webhooks.

### Requirements Engineering
We drafted preliminary functional and non-functional requirements to guide architecture choices:

**Functional Requirements:**
* **FR-01 (Device Ingestion):** Ingest flow and pressure readings over TLS 1.3 with mutual authentication, rejecting messages with timestamps exceeding a 15-minute clock drift.
* **FR-02 (DMA Mass Balance):** Calculate net volume deltas across defined DMA boundary meters at 15-minute intervals.
* **FR-03 (Night Flow Analysis):** Analyze 02:00–04:00 AM flow data against rolling baselines to detect abnormal night-time consumption indicating leakage.
* **FR-04 (Anomaly Alerts):** Generate automated alert events when observed flow deviates significantly from expected statistical thresholds.
* **FR-05 (Asset Risk Ranking):** Calculate a risk score for registered pipe segments using available GIS attributes (age, material, historical repair frequency).
* **FR-06 (Work Order Tracking):** Support an incident status lifecycle (`Detected` → `Assigned` → `Repaired` → `Verified`) with timestamped records.
* **FR-07 (Allocation Scheduling):** Generate rule-assisted delivery schedules for irrigation canals and emergency water delivery trucks.
* **FR-08 (Audit Trail):** Record machine-readable reason codes for generated allocation schedules and log manual operator overrides.
* **FR-09 (Reference Data Comparison):** Provide scheduled comparisons between aggregated DMA flows and regional reference datasets from `opendata.az`.
* **FR-10 (Post-Repair Verification):** Compare post-repair night-flow measurements against pre-repair baselines to verify physical water saved.

**Non-functional requirements:**
* **NFR-01 (Latency):** Target P95 ingestion-to-dashboard visualization latency of under 3.0 seconds under normal operating loads.
* **NFR-02 (Availability):** Target 99.5% service availability for the core telemetry ingestion pipeline during pilot operations.
* **NFR-03 (Edge Buffering):** Edge gateways must be capable of buffering at least 48 hours of sensor readings locally in non-volatile storage during network outages.
* **NFR-04 (Message Delivery):** Transport telemetry with at-least-once delivery from gateway to broker, using device-timestamp identifiers to support consumer deduplication.
* **NFR-05 (Data Residency):** Telemetry and infrastructure records must reside on national government cloud infrastructure (*Hökumət Buludu*).
* **NFR-06 (Access Control):** Enforce role-based access control (RBAC) separating administrative, dispatcher, and viewer privileges.
* **NFR-07 (Horizontal Scalability):** Core ingestion interfaces must allow adding DMAs incrementally without restructuring database schemas.
* **NFR-08 (Tiered Retention):** Retain high-frequency raw telemetry for 90 days; retain downsampled hourly and daily summaries indefinitely.
* **NFR-09 (Field Usability):** Field interface must allow mobile form completion and local caching when operating in areas with poor cellular coverage.
* **NFR-10 (Open Interfaces):** Provide standardized REST interfaces for integration with external municipal systems.

### Capacity estimation (Back-of-the-Envelope)
To understand data volumes and system sizing, we estimated traffic and storage across three deployment stages: a single-DMA pilot, a 150-DMA municipal phase, and an eventual national network.

**Device count assumptions (National Scale):**
* 2,000 boundary flow meters (inlets and outlets across 500 DMAs).
* 8,000 dynamic pressure transducers (average 16 per DMA).
* 20,000 canal level and gate sensors nationwide.
* 250,000 commercial and bulk smart meters.
* Total endpoints: ~280,000 devices.

**Traffic and ingestion calculations:**
* *Boundary flow meters:* 1 reading every 15 s, batched into 1 transmission per minute (4 readings/packet).  
  $2,000 \text{ devices} / 60 \text{ s} \approx 33.3 \text{ packets/s}$ (133.3 readings/s).
* *Pressure transducers (steady state):* 1 transmission per minute (1 reading/packet).  
  $8,000 \text{ devices} / 60 \text{ s} \approx 133.3 \text{ packets/s}$ (133.3 readings/s).
* *Canal level sensors:* 1 transmission every 5 minutes (300 s).  
  $20,000 \text{ devices} / 300 \text{ s} \approx 66.7 \text{ packets/s}$ (66.7 readings/s).
* *Smart bulk meters:* 1 transmission per hour (3,600 s).  
  $250,000 \text{ devices} / 3,600 \text{ s} \approx 69.4 \text{ packets/s}$ (69.4 readings/s).
* **Steady-state ingestion:**  
  Total packets/s: $33.3 + 133.3 + 66.7 + 69.4 \approx 302.7 \text{ packets/s}$.  
  Total measurement readings: $133.3 + 133.3 + 66.7 + 69.4 \approx 402.7 \text{ readings/s}$.
* **Transient burst mode:** If an estimated 5% of pressure transducers (400 devices) detect a steep pressure transient and record at 50 Hz for 60 seconds:  
  $400 \times 50 = 20,000 \text{ readings/s}$ additional burst traffic.  
  Peak ingestion load $\approx 20,400 \text{ readings/s}$.

**Network and storage estimates:**
* *Payload size:* Estimated at ~120 bytes per binary packet (using Protocol Buffers encoding).
* *Bandwidth (steady state):* $302.7 \text{ packets/s} \times 120 \text{ bytes} \approx 36.3 \text{ KB/s}$ (~0.29 Mbps), which is lightweight across cellular channels.
* *Daily data generation:* $402.7 \text{ readings/s} \times 86,400 \text{ s} \approx 34.8 \text{ million readings/day}$.
* *Raw storage estimate:* At ~50 bytes per uncompressed relational record, uncompressed data volume is roughly $1.74 \text{ GB/day}$ (~635 GB/year).
* *Compressed storage assumption:* Assuming an 80% to 90% reduction via time-series columnar compression (based on documented time-series database benchmarks), compressed storage is estimated at ~175–350 MB/day (~65–130 GB/year).

### Initial High-Level System Model
We outlined an initial high-level system boundary and data flow:
1. Field telemetry from flow and pressure sensors is collected by local edge gateways.
2. Gateways transmit readings over cellular connections using TLS 1.3 with client certificates to an ingestion gateway in the cloud.
3. Ingestion services buffer and route time-series measurements to storage and stream processing services.
4. Stream processing routines evaluate sliding-window mass balances and night-flow deviations.
5. Persistent storage maintains time-series metrics alongside relational GIS network topology.
6. A web-based console provides operator visualization, while field personnel interact through a mobile-friendly work order view.

---

## 2. Tools and Design Artifacts Produced

### Tools and Platforms

**Tools utilised so far (Weeks 1–3):**
* **Azerbaijan Open Data Portal (`opendata.az`):** Researched official national datasets published by the State Statistical Committee and ADSEA (water abstraction, transmission loss series, water quality, and regional network coverage) to ground our problem statement in empirical data.
* **Research and Domain Discovery Tools:** Reviewed government water decrees, utility reports, and e-government platforms to identify the structural gap between administrative complaint systems (`mygov`) and unmonitored physical distribution networks.
* **Version Control and Markdown Documentation:** Used Git and Markdown to maintain project notes, capacity calculations, and requirement specifications.

**Tools planned for upcoming stages:**
* **Architecture Modeling:** **Draw.io** and **Mermaid.js** to formalize C4 System Context and Container diagrams and visualize multi-tier security zones.
* **Interface Specification & Data Contracts:** **OpenAPI 3.0 / Swagger** for defining RESTful service interfaces, and **Protocol Buffers (Protobuf v3)** for modeling binary edge telemetry payloads ($<120\text{ bytes/packet}$).
* **API Development & Testing:** **Postman** to design endpoint schemas, mock simulated gateway sensor streams, and validate request/response contracts.
* **UI/UX Prototyping:** **Figma** to wireframe the operator control room console and the mobile field crew interface.
* **Data Prototyping & Solvers:** **Python (Jupyter, Pandas, NumPy, Google OR-Tools)** to test prototypes of the Minimum Night Flow (MNF) rolling baseline filter and the linear programming allocation model.

### Design Artifacts Produced
* **Problem Statement & System Boundary Definition:** Documented the operational vs. administrative divide and established the scope of SƏMT running behind citizen-facing interfaces.
* **Requirements Specification Matrix:** Initial formulation of 10 Functional Requirements (FR-01 to FR-10) and 10 Non-Functional Requirements (NFR-01 to NFR-10) with quantitative targets.
* **Capacity and Sizing Model:** Documented mathematical calculations estimating device counts, steady-state vs. burst throughput, and storage growth across pilot and national phases.
* **Domain Decomposition Map:** High-level Domain-Driven Design (DDD) partitioning separating the core hydraulic balancing and allocation engine from supporting asset-risk and audit subdomains.

### Engineering Concepts and Skills Acquired
* Translating an empirical civil infrastructure challenge into distinct software boundary definitions.
* Identifying the architectural gap between administrative e-government systems and operational telemetry layers.
* Formulating structured functional and non-functional requirements with concrete, testable metrics.
* Performing back-of-the-envelope capacity estimations from first principles based on physical sampling intervals and message payloads.

---

## 3. Technical Challenges and Trade-offs

### Primary Challenges Encountered
* **Intermittent Edge Connectivity:** Physical meters in underground concrete utility chambers experience severe cellular signal attenuation, requiring resilient local data buffering to prevent telemetry loss.
* **Night Consumption Variations:** In Greater Baku, residential buildings frequently utilize private rooftop water tanks (*su çənləri*) that refill overnight via float valves. Differentiating legitimate tank refilling from actual underground pipe bursts during 02:00–04:00 AM represents a significant calibration challenge.
* **Relational Topology vs. Time-Series Data:** Pipe networks are spatial graphs requiring GIS geometric operations, whereas sensor data is high-frequency time-series. Managing both workloads without excessive system complexity requires careful architectural consideration.
* **Cyber-Physical Security Boundaries:** Interfacing critical municipal water systems with software creates potential risks if control paths are exposed.

### Preliminary Trade-off Analyses

* **Trade-off 1: Separate Time-Series and Spatial Databases vs. Unified Relational Engine with Extensions**
  * *Option A:* Deploy a dedicated NoSQL time-series database (e.g., InfluxDB) for metrics and a relational GIS database (e.g., PostgreSQL/PostGIS) for pipe topology.
  * *Option B (Candidate under evaluation):* Deploy a single PostgreSQL instance utilizing the TimescaleDB extension for time-series hypertables and PostGIS for spatial queries.
  * *Preliminary Evaluation:* While dedicated NoSQL databases offer high write throughput, leak localization queries fundamentally require joining real-time sensor measurements directly with pipe attributes (diameter, material, upstream valve location). A hybrid PostgreSQL/TimescaleDB/PostGIS approach avoids cross-database synchronization and distributed joins. This remains our primary candidate for testing in Week 6.

* **Trade-off 2: Micro-Batching vs. Event-Time Stream Processing**
  * *Option A:* Micro-batch processing (e.g., Spark Streaming) evaluating metrics every few seconds.
  * *Option B (Candidate under evaluation):* True event-driven stream processing (e.g., Apache Flink) with native watermarking.
  * *Preliminary Evaluation:* Micro-batching introduces artificial windowing delays and struggles with delayed, out-of-order telemetry caused by cellular reconnection. Event-time processing with watermarks handles late-arriving packets more cleanly for 15-minute rolling balances and night-flow baselines.

* **Trade-off 3: Full Remote Actuation vs. Read-Only Telemetry Architecture**
  * *Option A:* Cloud microservices directly issuing commands to motorized boundary valves and canal gates.
  * *Option B (Selected for MVP):* Read-only telemetry architecture where the software generates alerts and dispatch recommendations, but valve actuation remains a manual, human-in-the-loop task performed by utility crews.
  * *Decision:* In accordance with Critical Information Infrastructure guidelines, eliminating automated remote control commands from cloud services removes the risk of cyber-physical attacks causing accidental pressure surges or water hammer damage.

* **Trade-off 4: Edge Storage Strategy**
  * *Option A:* Storing unsent telemetry packets in gateway RAM.
  * *Option B (Candidate under evaluation):* Embedded crash-resilient storage (such as SQLite with Write-Ahead Logging) on non-volatile flash memory.
  * *Preliminary Evaluation:* In-memory buffers lose backlogged telemetry during power fluctuations or battery changes. Persistent flash logging ensures readings are preserved during extended cellular blackouts.

### Current Architectural Open Questions / Blockers
* **Night Tank Inflow Calibration:** Determining empirical baselines to filter out residential tank float-valve refills from true network leakage during Minimum Night Flow analysis.
* **External Integration Standards:** Clarifying required interface standards and data formats for eventual notification exchange with municipal systems and `mygov`.
* **Underground Signal Attenuation:** Validating whether standard cellular NB-IoT/LTE-M modules maintain sufficient connectivity from deep concrete vaults or if external antenna extensions will be required.

---

## 4. Personal & Peer Feedback

Instructor and Team Feedback Received:

During our initial consultation, Ms. Fidan inspired our direction by speaking about food rescue systems in the United States and Europe, which motivated us to explore how resource waste and redistribution could be addressed systematically in water networks. When reviewing our initial concept, she advised us to narrow our scope and avoid common student project traps such as trying to build a generic citizen reporting or billing app, since government platforms like `mygov`, and state agencies like ADSEA, already cover those areas, presumably. Instead, she encouraged us to keep our focus on physical water loss and distribution challenges. She also suggested that we'd rather look closely at local conditions in Azerbaijan, such as household water storage tanks, when framing our assumptions for future analysis.

Peer Support and Team Collaboration:

Our teamwork so far has mainly revolved around desk research, idea brainstorming, and refining our project direction.

Adil assessed the practical viability and relevance of the concept, evaluating whether the proposed direction was sufficiently worthwhile and impactful for our team to pursue.

Zahra focused on idea optimization, helping us evaluate different project angles and steer our concept toward operational monitoring and fair distribution rather than administrative management.

Sanan reviewed sector reports and case studies on municipal water distribution networks to understand how leak localisation is approached in practice.

Ali formulated our core project idea thoroughly and carefully checked opendata.az to determine whether any relevant datasets were actually available to support our concept.

These team discussions were valuable in filtering out overly ambitious features early on and establishing a realistic foundation for our upcoming architectural work.

## 5. Next Architectural Steps

Future Design Tasks and Priority Features:

Our immediate priority is moving from conceptual research to architectural modeling. In the next phase, we plan to draft preliminary C4 architecture diagrams, define basic interface requirements, and outline our data schemas. We also want to explore synthetic sensor data generation so we can begin testing analysis concepts before dealing with real hardware.

Plan Adjustments and Proposed Innovations:

As we refined our project idea, we agreed to keep the system strictly advisory rather than proposing automated remote valve control, which would be far too risky and complicated. We also proposed focusing on a verification approach for leak repairs, where post repair data can eventually be compared against baseline measurements to confirm whether an intervention actually reduced water loss.