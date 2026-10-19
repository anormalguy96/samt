# Lecture 10: Design for Robustness & Fault Tolerance

**Course:** System Design (UNEC / Fall 2026)  
**Instructor:** Fidan Asgarova  
**Source Deck:** [lecture 10.pdf](file:///d:/github_repos/water/lecture%2010.pdf) (109 slides)  
**Companion Reading:** [lectures_merged.pdf](file:///d:/github_repos/water/lectures_merged.pdf) (Chapter 10 & 12, pp. 59–76, 109)  

---

## 1. Executive Summary & Learning Goals

No complex software system is immune to unexpected environmental conditions, hardware degradations, network partitions, or erroneous operator inputs. When faced with abnormal disturbances, a naive system crashes catastrophically. Robust software systems, by contrast, are architected to anticipate failures, isolate blast radiuses, gracefully degrade performance, and preserve safety invariants. Lecture 10 explores the formal foundations of **robustness**, analyzes historic catastrophic cyber-physical failures, teaches analytical failure-identification techniques (**HAZOP** and **Fault Tree Analysis**), and details mission-critical design patterns—most notably the **Doer-Checker Pattern**, **Circuit Breakers**, and **Bulkhead Isolation**.

### Core Learning Goals
Upon mastering this material, students are able to:
1. **Differentiate System Dependability Attributes:** Precision definitions distinguishing **Robustness**, **Reliability**, **Fault-Tolerance**, and **Resilience**.
2. **Diagnose Specification & World Mismatches:** Apply Michael Jackson's Satisfaction Argument ($W \land S \implies R$) to identify when false environment assumptions destroy system safety.
3. **Execute HAZOP (Hazard and Operability Study):** Systematically apply standardized guide words (*None, More, Less, Reverse, Other than*) to detect latent failure modes.
4. **Construct Fault Trees (FTA):** Map cascading combinations of component faults using Boolean AND/OR logic gates to determine top-level failure probabilities.
5. **Implement Robust Architectural Patterns:** Deploy **Input Monitors**, the **Doer-Checker Pattern**, **Circuit Breakers**, and **Bulkheads** to stop cascading outages.
6. **Address Human-in-the-Loop Failure Modes:** Architect interfaces that mitigate operator complacency and alarm fatigue.

---

## 2. Terminology: Reliability, Robustness, Fault-Tolerance & Resilience

```
┌────────────────────────────────────────────────────────────────────────┐
│ RELIABILITY: Continuity of correct operation under NOMINAL expected    │
│ conditions over a specified time duration (MTBF / uptime percentage).  │
├────────────────────────────────────────────────────────────────────────┤
│ ROBUSTNESS: Ability to maintain acceptable, safe behavior OUTSIDE of   │
│ nominal conditions (handling unexpected inputs, hardware drift, stress)│
├────────────────────────────────────────────────────────────────────────┤
│ FAULT-TOLERANCE: Masking internal component crashes so that overall    │
│ external service delivery continues uninterrupted (via redundancy).    │
├────────────────────────────────────────────────────────────────────────┤
│ RESILIENCE: Ability to absorb sudden catastrophic shocks, gracefully   │
│ degrade non-critical functions, and autonomously recover to normal.    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Why Software Fails: The Satisfaction Argument

Why do seemingly well-tested software systems fail catastrophically in the real world?
$$\text{World Assumptions } (W) \land \text{Software Specification } (S) \implies \text{System Requirements } (R)$$

Software failures rarely stem from arithmetic syntax bugs. Most disasters occur when **World Assumptions ($W$) are false**:

### Catastrophic Real-World Disasters Analyzed

```
┌────────────────────────────────────────────────────────────────────────┐
│ LUFTHANSA FLIGHT 2904 RUNWAY CRASH (Warsaw, 1993)                      │
│ Requirements (R): Thrust reversers & spoilers must deploy ONLY on ground│
│ Specification (S): Deploy if wheels spin > 72 kts OR struts compress >6.3t│
│ False World Assumption (W): Plane landing on a runway always spins     │
│ wheels or compresses struts immediately.                               │
│ The Reality: Severe aquaplaning on water lifted the tires. Software    │
│ locked reversers for 9 seconds. Plane overran runway and crashed.      │
├────────────────────────────────────────────────────────────────────────┤
│ PANAMA CITY CANCER INSTITUTE OVERDOSE (2000)                           │
│ Radiation software calculated radiation doses through shielding blocks. │
│ Flawed Assumption: Software assumed user drew shielding blocks in      │
│ standard sequence. When technicians drew a custom hole in one stroke,  │
│ software doubled the computed radiation dose, fatally irradiating 28   │
│ patients.                                                              │
├────────────────────────────────────────────────────────────────────────┤
│ AWS S3 GLOBAL CLOUD OUTAGE (2017)                                      │
│ An engineer executed an administrative routine to decommission a small │
│ subsystem. A simple typographical error in command-line arguments      │
│ wiped out primary indexing servers, taking down major global services. │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Analytical Failure Modeling: HAZOP & Fault Tree Analysis

### 4.1 Hazard and Operability Study (HAZOP)
Originally developed in chemical process engineering, HAZOP systematically applies **Guide Words** to every system parameter:

| HAZOP Guide Word | Interpretation | Telemetry Pipeline Example |
|---|---|---|
| **NO / NONE** | No data arrives; complete loss of signal. | Pressure sensor cable severed; zero packets received. |
| **MORE** | Value exceeds maximum physical threshold. | Flow meter reports $50,000\text{ m}^3/h$ on a 100mm pipe (impossible). |
| **LESS** | Value is significantly below baseline. | Minimum night flow drops below physical meter friction threshold. |
| **REVERSE** | Direction of flow or sign is inverted. | Water meter reports negative flow (backflow or reversed wiring). |
| **OTHER THAN** | Data type or protocol corrupt. | Telemetry payload contains unparseable binary garbage. |
| **LATE / EARLY** | Timing or delivery interval violation. | Reading delayed by 48 hours arriving out-of-order over cellular reconnection. |

### 4.2 Fault Tree Analysis (FTA)
Constructing a top-down graphical model using Boolean logic gates:
* **OR Gate:** Output fault occurs if *any* input event occurs (e.g., primary power fails OR backup generator fails).
* **AND Gate:** Output fault occurs only if *all* redundant components fail simultaneously.

---

## 5. Architectural Patterns for High Robustness

### 5.1 Output Monitor: The Doer-Checker Pattern
When business logic requires complex, unpredictable, or ML-driven algorithms (the "Doer"), protect system safety by pairing it with a simple, provably correct, deterministic monitor (the "Checker"):

```
                         DOER-CHECKER PATTERN
   ┌─────────┐              ┌──────────────────────────┐
   │ Inputs  ├─────────────>│           DOER           │
   └────┬────┘              │ (Complex ML / Solver)    │
        │                   └────────────┬─────────────┘
        │                                │ Proposed Output
        │                                ▼
        │                   ┌──────────────────────────┐     Pass      ┌──────────┐
        └──────────────────>│         CHECKER          ├──────────────>│ Executed │
                            │ (Simple Safety Invariant)│               │  Action  │
                            └────────────┬─────────────┘               └──────────┘
                                         │ Violation Detected
                                         ▼
                            ┌──────────────────────────┐
                            │      SAFE FALLBACK       │
                            │ (Fail-Safe Default Rule) │
                            └──────────────────────────┘
```

### 5.2 Circuit Breakers & Bulkhead Isolation
* **Circuit Breaker:** Monitors outbound calls to a downstream service. If failure rate exceeds 50%, the breaker trips (`OPEN`), instantly returning cached or fallback responses without saturating worker threads.
* **Bulkhead Isolation:** Partitions thread pools and memory allocations. A failure in the non-critical report generation service cannot exhaust connection pools needed by the primary telemetry ingestion pipeline.

---

## 6. Relevance to Project SƏMT / KURA (Report 2 Deliverable)

Robustness patterns from Lecture 10 are integral to SƏMT's mission-critical design:

| SƏMT Subdomain | Robustness Engineering Strategy (Lecture 10 Applied) |
|---|---|
| **Doer-Checker in Water Allocation** | **The Doer:** Complex Mixed-Integer Linear Programming (MILP) optimization engine generating agricultural canal distribution schedules.<br>**The Checker:** A deterministic rule-based safety monitor verifying that all municipal drinking water minimums ($50\text{ L/cap/day}$) and hospital reserves are 100% satisfied before canal gates receive water. If the solver hallucinates or encounters an infeasible LP matrix, the Checker rejects the plan and reverts to the proven baseline schedule. |
| **Underground Telemetry Input Monitors** | Deep concrete vaults experience severe battery drop and moisture corrosion. Ingestion workers apply HAZOP validation: readings with pressure $> 25\text{ bar}$ (impossible for secondary distribution) or timestamp drift $> 15\text{ minutes}$ are quarantined to a dead-letter queue. |
| **Eliminating Remote Actuation Risks** | In accordance with cyber-physical safety standards, SƏMT MVP is strictly a read-only advisory platform. It outputs ranked dispatch work orders for human crews; it possesses zero remote network control commands to open or close pressurized main valves. |
