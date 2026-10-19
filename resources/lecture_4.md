# Lecture 4: Design for Change & Modifiability

**Course:** System Design (UNEC / Fall 2026)  
**Instructor:** Fidan Asgarova  
**Source Deck:** [lecture 4.pdf](file:///d:/github_repos/water/lecture%204.pdf) (117 slides)  
**Companion Reading:** [lectures_merged.pdf](file:///d:/github_repos/water/lectures_merged.pdf) (Chapter 3 & 4, pp. 162–177, 206–219)  

---

## 1. Executive Summary & Learning Goals

Software systems are never static; they evolve constantly across their operational lifecycle. If a system is not intentionally designed for change, even trivial feature additions or library updates can cause catastrophic cascading failures across the codebase. Lecture 4 investigates **modifiability** and **changeability** as first-class architectural quality attributes. It provides mathematical and conceptual tools—specifically **Dependency Modeling**, **Parnas' Information Hiding Principle**, **Coupling and Cohesion metrics**, and the **Dependency Inversion Principle (DIP)**—to isolate components from the ripple effects of change.

### Core Learning Goals
Upon mastering this material, students are able to:
1. **Categorize Drivers of Software Evolution:** Distinguish functional evolution, platform/infrastructure shifts, and scale-driven changes.
2. **Evaluate Systems via Dependency Models:** Construct dependency graphs to calculate afferent/efferent coupling and predict change propagation.
3. **Apply the Information Hiding Principle:** Identify architectural "secrets" and encapsulate volatile design choices behind immutable interfaces.
4. **Eliminate Shared Secrets:** Detect and refactor anti-patterns where multiple modules depend on shared internal representations.
5. **Implement SOLID Architectural Principles:** Apply the **Interface Segregation Principle (ISP)** and **Dependency Inversion Principle (DIP)** to decouple high-level business policies from low-level infrastructure mechanisms.

---

## 2. The Dynamics of Software Evolution

### 2.1 The Big Ball of Mud Anti-Pattern
Without deliberate architecture, systems degrade into a **Big Ball of Mud** (Foote & Yoder):
* Unregulated cross-module imports and shared database tables.
* Every component depends transitively on every other component.
* Cost of change grows exponentially: fixing a bug in one component causes unexpected regressions in three unrelated modules.
* Developers become afraid to modify or refactor existing code.

```
      BIG BALL OF MUD (Tangled Dependencies)           MODULAR ARCHITECTURE (Inverted Boundaries)
         ┌──────┐      ┌──────┐                                 ┌────────────────┐
         │  UI  ├─────>│  DB  │                                 │ Business Logic │
         └─┬───┬┘      └▲───┬─┘                                 └───────┬────────┘
           │   │        │   │                                           │ (Depends on Interface)
           │   ▼        │   ▼                                           ▼
         ┌─┴──────┐   ┌─┴──────┐                              ┌───────────────────┐
         │ Report ├──>│ Billing│                              │ Repository (Abstr)│
         └────────┘   └────────┘                              └─────────▲─────────┘
        (Every change propagates everywhere)                            │ (Implements)
                                                              ┌─────────┴─────────┐
                                                              │ PostgreSQL Driver │
                                                              └───────────────────┘
```

### 2.2 What Drives Software Change?
Lecture 4 analyzes three independent vectors of change:
1. **Functional Requirements:** Expanding domain capabilities (e.g., adding dynamic water rationing to an existing flow-monitoring tool).
2. **Platform & Third-Party Dependencies:** Underlying platforms deprecating APIs (e.g., Apple macOS Catalina dropping 32-bit application support; the infamous NPM `left-pad` incident breaking global web builds).
3. **Quality Attribute Shifts:** System growing by $100\times$ in traffic, forcing migration from single-node SQL to partitioned sharded databases.

---

## 3. Parnas' Information Hiding & Encapsulation of Secrets

In his seminal 1972 paper, David Parnas demonstrated that decomposing systems based on flowcharts or processing steps leads to high coupling. Instead, systems must be decomposed based on **Information Hiding**:

### 3.1 What is an Architectural "Secret"?
A secret is a design decision that is volatile and likely to change over time. Every module must encapsulate at least one secret that no other module is allowed to know:
* **Hardware & Device Secrets:** Specific register layouts, serial baud rates, or binary communication protocols of physical meters.
* **Data Structure & Storage Secrets:** Specific SQL schemas, indexing algorithms, or in-memory dictionary layouts.
* **Business Policy Secrets:** Exact mathematical weighting formulas or scoring constants.

### 3.2 The Shared Secret Anti-Pattern
When two modules share direct access to an unencapsulated data structure or raw database table:
* Changing the database schema requires simultaneously rewriting and deploying both services.
* The services cannot be versioned or scaled independently.

---

## 4. Coupling, Cohesion, and SOLID Principles

### 4.1 Coupling vs. Cohesion
* **Cohesion:** How strongly related the internal responsibilities of a single module are. Architectural goal: **High Functional Cohesion** (the module does one complete thing and does it well).
* **Coupling:** The degree of interdependence between two distinct modules. Architectural goal: **Low Loose Coupling** (modules interact only through abstract contracts).

### 4.2 The Dependency Inversion Principle (DIP)
$$\text{High-level business policies should not depend on low-level infrastructure details.}$$
$$\text{Both should depend on abstractions.}$$

```java
// VIOLATION: High-level StockTracker directly depends on concrete YahooFinanceScraper
public class StockTracker {
    private YahooFinanceScraper scraper = new YahooFinanceScraper();
    public double getPrice(String symbol) {
        return scraper.fetchFromHttp(symbol);
    }
}

// ADHERENCE: StockTracker depends on abstract StockQuoter interface; implementation injected
public interface StockQuoter {
    double fetchPrice(String symbol);
}

public class StockTracker {
    private final StockQuoter quoter;
    public StockTracker(StockQuoter quoter) {
        this.quoter = quoter;
    }
}
```

### 4.3 Interface Segregation Principle (ISP)
Clients should never be forced to depend on methods they do not use. Rather than one massive interface with 50 methods, create fine-grained, role-based interfaces (`ReadableStream`, `WritableStream`, `Closeable`).

---

## 5. Slide Case Studies: Stock Tracker & Smart Home IoT (MyPlace)

### 5.1 Stock Tracker Evolution
* **Initial State:** Desktop UI, database query engine, and Yahoo Finance scraper bundled into a monolithic class.
* **Problem:** Yahoo Finance changed its HTML structure and deprecated its API. The entire application broke; UI code had to be touched to fix network parsing bugs.
* **Refactoring:** Introduced `StockQuoter` abstraction layer. Swapping Yahoo Finance for Bloomberg API or a local mock required zero modifications to the UI or business calculation components.

### 5.2 MyPlace Smart Home Meter System
* **Scenario:** An IoT home automation platform ingesting temperature, humidity, and electrical power usage across hundreds of sensor hardware manufacturers.
* **Architectural Challenge:** Every hardware manufacturer transmits varying binary packet formats over Zigbee, Z-Wave, or WiFi.
* **Architectural Fix:** Implemented an **Adapter / Ingestion Driver Pattern**. The core analytics engine communicates only with a standardized `Reading` domain entity. Adding support for a new smart plug requires simply deploying a new micro-driver without modifying central telemetry pipelines.

---

## 6. Relevance to Project SƏMT / KURA (Report 2 Deliverable)

The modifiability principles from Lecture 4 are directly applied in the design of SƏMT:

| Project SƏMT Architectural Module | Design for Change Strategy (Lecture 4 Applied) |
|---|---|
| **Edge Hardware Decoupling** | Physical flow meters (electromagnetic, ultrasonic) and pressure transducers use varying field protocols (Modbus, M-Bus, LoRaWAN). SƏMT encapsulates these hardware secrets in the Edge Gateway layer, normalizing all field readings into a uniform Protobuf contract. |
| **Storage Engine Isolation** | The core hydraulic balance engine queries an abstract `TelemetryRepository` interface rather than writing raw TimescaleDB queries directly inside business logic. If the team migrates from TimescaleDB to ClickHouse in the future, core leak localization math remains untouched. |
| **Allocation Policy Encapsulation** | Agricultural quota rules are isolated in a pluggable `AllocationPolicyStrategy` module. Changes to government drought subsidy thresholds do not alter the underlying Mixed-Integer Linear Programming (MILP) optimization solver. |
