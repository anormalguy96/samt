# Lecture 6: Design for Interoperability

**Course:** System Design (UNEC / Fall 2026)  
**Instructor:** Fidan Asgarova  
**Source Deck:** [lecture 6.pdf](file:///d:/github_repos/water/lecture%206.pdf) (40 slides)  
**Companion Reading:** [lectures_merged.pdf](file:///d:/github_repos/water/lectures_merged.pdf) (Chapter 13, pp. 129–145)  

---

## 1. Executive Summary & Learning Goals

In modern software engineering, virtually no production system operates in total isolation. Enterprise systems must continuously communicate and exchange data with external partners, legacy mainframes, government databases, third-party SaaS APIs, and physical edge devices. Lecture 6 examines **interoperability** as a critical system quality attribute, contrasting shallow **syntactic compatibility** with deep **semantic understanding**, analyzing famous real-world interoperability disasters, and establishing concrete design principles—including **Shared Data Ontologies**, **Postel's Robustness Principle**, and **Schema Evolution**—to build seamless, long-lived system integrations.

### Core Learning Goals
Upon mastering this material, students are able to:
1. **Define Interoperability:** Formulate interoperability as the measurable capability of two or more heterogeneous systems to exchange information and execute collaborative business processes.
2. **Distinguish Syntactic from Semantic Interoperability:** Differentiate the ability to parse byte streams (JSON, XML) from the ability to correctly interpret domain semantics and units.
3. **Analyze Systemic Integration Disasters:** Understand the root causes of major interoperability failures (e.g., Mars Climate Orbiter, Electronic Health Record silos).
4. **Construct Shared Data Ontologies:** Establish canonical vocabularies, standardized measurement units, and schema definitions across organizational boundaries.
5. **Apply Postel’s Robustness Principle:** Design communication endpoints that preserve stability in evolving distributed ecosystems.
6. **Balance Interoperability vs. Changeability:** Manage the tension between publishing rigid external integration contracts and retaining internal agility to refactor.

---

## 2. Syntactic vs. Semantic Interoperability

```
┌────────────────────────────────────────────────────────────────────────┐
│                   THE TWO LEVELS OF INTEROPERABILITY                   │
├──────────────────────────┬─────────────────────────────────────────────┤
│ SYNTACTIC                │ Can the receiving system parse the data     │
│ INTEROPERABILITY         │ format without syntax errors?               │
│                          │ Examples: Valid JSON, UTF-8, Proto3 binary  │
├──────────────────────────┼─────────────────────────────────────────────┤
│ SEMANTIC                 │ Do both systems agree on the exact meaning, │
│ INTEROPERABILITY         │ units, context, and assumptions of the data?│
│                          │ Examples: Metric vs Imperial, UTC vs Local  │
└──────────────────────────┴─────────────────────────────────────────────┘
```

A message can be syntactically flawless while causing a fatal semantic failure:
```json
// Syntactically valid JSON, but semantically ambiguous:
{
  "thrust": 450.0,
  "timestamp": "10-11-2026",
  "temperature": 32.0
}
// Is thrust in Newtons or Pound-force?
// Is the date October 11th or November 10th?
// Is temperature 32 Celsius (hot) or 32 Fahrenheit (freezing)?
```

---

## 3. Real-World Case Studies: The High Cost of Interoperability Failures

### 3.1 The Mars Climate Orbiter Crash (1999)
* **The Incident:** NASA's $125 million Mars Climate Orbiter spacecraft burned up in the Martian atmosphere instead of entering stable orbit.
* **The Root Cause:** Ground software built by contractor Lockheed Martin computed thruster impulse in English imperial units (**pound-force seconds**), while NASA's trajectory software expected metric SI units (**Newton-seconds**).
* **The Failure:** 1 pound-force second $= 4.45\text{ Newton-seconds}$. The discrepancy caused a cumulative trajectory error of over 100 miles. Both software systems compiled and exchanged data without throwing syntax exceptions, but semantic incompatibility destroyed the mission.

### 3.2 Electronic Health Records (EHR) & Clinical Silos
* **The Incident:** Patients transferred between regional medical clinics suffered severe adverse drug interactions and duplicate medical procedures.
* **The Root Cause:** Different hospital software vendors formatted patient records, lab test ranges, and medication dosages in proprietary databases without standardized medical ontologies (e.g., HL7 FHIR, SNOMED CT).

---

## 4. Principles for Achieving Semantic Interoperability

### 4.1 Develop a Shared Data Ontology
A shared ontology establishes an explicit, formal specification of a shared conceptualization:
* **Canonical Domain Terms:** Unambiguous entity definitions agreed upon by all communicating services.
* **Explicit Measurement Units:** Eliminating bare numbers; embedding units into schemas (e.g., `flow_rate_liters_per_second`, `pressure_bar`, `elevation_meters`).
* **Temporal Rigor:** Mandating UTC ISO-8601 strings (`2026-10-18T17:45:00Z`) or epoch milliseconds, banning ambiguous local time strings.

```
       WITHOUT ONTOLOGY (Point-to-Point Chaos)          WITH CANONICAL ONTOLOGY
          ┌───┐            ┌───┐                            ┌───┐            ┌───┐
          │ A │ <========> │ B │                            │ A │ ──┐    ┌── │ B │
          └───┘ \        / └───┘                            └───┘   │    │   └───┘
                 \      /                                           ▼    ▼
                  \    /                                      ┌────────────────┐
                   ▼  ▼                                       │ CANONICAL DATA │
                  ┌────┐                                      │    ONTOLOGY    │
                  │ C  │                                      └────────────────┘
                  └────┘                                            ▲    ▲
          (N*(N-1)/2 custom translators)                    ┌───┘    └───┐
                                                            │ C │        │ D │
                                                            └───┘        └───┘
                                                           (Linear 2*N adapters)
```

### 4.2 Postel's Robustness Principle (RFC 760)
$$\text{"Be conservative in what you do, be liberal in what you accept from others."}$$
* **Conservative Sending:** Always produce strictly conforming data that matches the exact published specification and includes all required headers and metadata.
* **Liberal Receiving:** Parse input gracefully; ignore unexpected or newly added fields if they do not impact the current operation; provide sensible defaults for missing optional values rather than abruptly crashing.

### 4.3 Schema Evolution & Backward Compatibility
To prevent downstream integrations from breaking as systems evolve:
* **Additive Changes Only:** New fields must be marked optional; never delete or rename existing fields in published public APIs.
* **Explicit Versioning:** Use URL versioning (`/api/v1/dma`, `/api/v2/dma`) or content negotiation headers (`Accept: application/vnd.samt.v2+json`).

---

## 5. Architectural Trade-off: Interoperability vs. Changeability

* **The Tension:** Maximum interoperability demands frozen, immutable public APIs to avoid breaking external enterprise consumers. Conversely, internal changeability requires engineers to refactor code, rename classes, and optimize database schemas.
* **The Architectural Solution (Anti-Corruption Layer / ACL):**
  Place an **Anti-Corruption Layer (ACL)** between internal domain models and external partner APIs. The external contract remains frozen, while internal microservices remain free to evolve independently.

---

## 6. Relevance to Project SƏMT / KURA (Report 2 Deliverable)

Interoperability is a cornerstone of SƏMT's design, as the platform must ingest data from multiple government agencies:

| External System | SƏMT Interoperability Strategy (Lecture 6 Applied) |
|---|---|
| **Azerbaijan Open Data Portal (`opendata.az`)** | Ingesting 4 heterogeneous national datasets published in CSV and JSON by the State Statistical Committee and ADSEA. SƏMT normalizes varying administrative district naming conventions (`Baku`, `Bakı şəhəri`, `Abşeron`) into canonical administrative GIS polygons. |
| **National Citizen Portal (`mygov`)** | SƏMT exposes standardized RESTful endpoints to push scheduled water outage notifications to `mygov` without coupling SƏMT's core telemetry ingestion to `mygov`'s citizen authentication system. |
| **Field Sensor Telemetry (Protobuf v3)** | Telemetry schemas strictly enforce SI units (`flow_m3_per_hour`, `pressure_bar`, `temp_celsius`), preventing catastrophic unit conversion bugs across domestic and imported electromagnetic meters. |
