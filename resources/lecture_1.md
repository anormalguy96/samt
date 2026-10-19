# Lecture 1: Introduction to Software System Design

**Course:** System Design (UNEC / Fall 2026)  
**Instructor:** Fidan Asgarova  
**Source Deck:** [lecture 1.pdf](file:///d:/github_repos/water/lecture%201.pdf) (121 slides)  
**Companion Reading:** [lectures_merged.pdf](file:///d:/github_repos/water/lectures_merged.pdf) (Chapter 1, pp. 193–205)  

---

## 1. Executive Summary & Learning Goals

System design is the disciplined engineering practice of defining the architecture, components, interfaces, and data flows of a software system to satisfy both functional requirements and non-functional quality attributes under real-world constraints. Lecture 1 establishes the distinction between programming (writing executable code within an established environment) and system design (structuring the system, managing trade-offs, and allocating responsibilities across software, hardware, and human boundaries).

### Core Learning Goals
Upon mastering this material, students are able to:
1. **Define Software Design:** Explain what software design is, why intentional design is necessary, and contrast it with "default" or ad-hoc implementation.
2. **Apply the Risk-Driven Approach:** Use risk analysis (probability $\times$ consequence of failure) to decide how much design effort to invest and where architectural rigor is critical.
3. **Execute the GCE Paradigm:** Understand and apply the **Generate–Communicate–Evaluate** cycle for architectural decision-making.
4. **Separate Problem Space from Solution Space:** Distinguish between requirements residing in the external environment (the "world") and technical components residing inside the software system (the "machine").
5. **Analyze Quality Attribute Trade-Offs:** Recognize inherent tensions between competing software qualities (e.g., performance vs. maintainability, security vs. usability).

---

## 2. Foundational Concepts

### 2.1 What is Design vs. Implementation?
* **Implementation:** Focusing on algorithmic efficiency, language syntax, framework idioms, and unit execution.
* **Design:** Strategic decision-making regarding the structure of the system, component boundaries, interface protocols, communication paradigms, data storage models, and fault handling.
* **Default Design Anti-Pattern:** Building a system by immediately writing code without an architectural plan. The system architecture becomes the accidental byproduct of quick implementation choices, leading to tightly coupled "Big Ball of Mud" architectures that resist change and scale poorly.

```
       ACCIDENTAL (DEFAULT) DESIGN                    INTENTIONAL SYSTEM DESIGN
  ┌────────────────────────────────────┐        ┌────────────────────────────────────┐
  │ Code written without boundary plan │        │ 1. Problem space decomposition      │
  │ Ad-hoc point-to-point connections  │  VS    │ 2. Clear component responsibilities│
  │ High coupling, hidden dependencies │        │ 3. Explicit interface contracts     │
  │ Fragile under load and change      │        │ 4. Managed quality trade-offs      │
  └────────────────────────────────────┘        └────────────────────────────────────┘
```

### 2.2 Why is Software System Design Hard?
Lecture 1 identifies three primary drivers of design difficulty:
1. **Scale and Structural Complexity:** Modern systems comprise dozens of distributed microservices, polyglot data stores, third-party APIs, and heterogeneous execution environments (cloud, mobile, edge).
2. **Evolving & Incomplete Requirements:** Business domains change, user workloads fluctuate unpredictably, and initial specifications are rarely complete.
3. **Inherent Tensions between Quality Attributes:** Optimizing for one quality attribute almost invariably compromises another:
   * Improving **Performance** (via caching) often degrades **Consistency** (stale data).
   * Enhancing **Security** (via deep packet inspection and mTLS) introduces **Latency**.
   * Increasing **Modifiability** (via abstraction layers) can increase **Complexity**.

---

## 3. Core Architectural Paradigms

### 3.1 The Risk-Driven Design Approach (Fairbanks)
Design is not an all-or-nothing endeavor. The risk-driven approach posits that architectural investment should be proportional to the risk of failure:
$$\text{Architectural Risk} = \text{Probability of Failure} \times \text{Impact / Cost of Failure}$$

* **Low-Risk Components:** Standard CRUD interfaces, internal utility scripts, or well-understood business workflows require minimal formal modeling.
* **High-Risk Components:** Critical data synchronization pipelines, financial ledgers, life-critical systems, or high-throughput telemetry ingestion demand extensive modeling, formal specifications, and assurance reviews.
* **Over-Engineering Hazard:** Spending excessive time modeling low-risk features delays delivery without mitigating meaningful threats.
* **Under-Engineering Hazard:** Omitting architectural modeling on high-risk features leads to catastrophic outages, data loss, or complete system rewrites.

### 3.2 The GCE (Generate–Communicate–Evaluate) Paradigm
Architectural design is an iterative search process through a complex solution space:
```
   ┌────────────┐       Candidates       ┌─────────────┐       Shared Models       ┌────────────┐
   │  GENERATE  │ ─────────────────────> │ COMMUNICATE │ ────────────────────────> │  EVALUATE  │
   └────────────┘                        └─────────────┘                           └────────────┘
         ▲                                                                                │
         │                                   Feedback Loop                                │
         └────────────────────────────────────────────────────────────────────────────────┘
```
1. **Generate:** Formulate multiple candidate architectural solutions rather than fixating on the first intuitive approach.
2. **Communicate:** Document candidates using standard visual abstractions (C4 context models, sequence diagrams, interface contracts) so stakeholders and teammates share intellectual control.
3. **Evaluate:** Critically assess each candidate against prioritized quality attribute scenarios and capacity constraints to select the optimal design.

### 3.3 Problem Space vs. Solution Space (The World and The Machine)
Coined by Michael Jackson, this fundamental distinction clarifies engineering responsibility:
* **The Problem Space (The World):** The environment where the user problem exists. Consists of physical entities, human workflows, geographic constraints, physical laws, and autonomous third parties.
* **The Solution Space (The Machine):** The software application, database, and hardware infrastructure created by the engineer.
* **Shared Phenomena (The Interface):** The narrow boundary where the world and the machine interact (sensors, input forms, network interfaces, actuators).

```
   THE WORLD (Problem Space)               THE MACHINE (Solution Space)
  ┌───────────────────────────────┐       ┌───────────────────────────────┐
  │ Physical water pipes          │  mTLS │ Ingestion microservices       │
  │ Underground pressure leaks    │ <===> │ TimescaleDB time-series store │
  │ Agricultural canal gatekeeper │  PWA  │ Mixed-Integer linear solver   │
  └───────────────────────────────┘       └───────────────────────────────┘
                     ▲                                 ▲
                     └─────── SHARED PHENOMENA ────────┘
                              (Sensor Telemetry)
```

---

## 4. Case Study: Combating Food Waste (Food Rescue App)

Lecture 1 introduces the semester running example—a distributed Food Rescue platform:
* **The Problem Context:** ~40% of all food supply in the United States is wasted (valued at $218 billion annually), while 1 in 8 households faces food insecurity. Perishable food from restaurants, grocers, and caterers must be transported to food banks and shelters before spoiling.
* **Operational Constraints:**
  * Strict time windows: Hot or refrigerated food spoils within 2–4 hours.
  * Volunteer transport: Delivery relies on ad-hoc volunteers using personal vehicles.
  * Connectivity issues: Drivers and shelters frequently operate in poor cellular signal areas.
* **System Design Takeaway:** A naive mobile CRUD form cannot solve this challenge. The architecture requires automated matching engines, push notification dispatchers, cold-chain time-tracking, and offline-capable mobile synchronization.

---

## 5. Course Alignment & Relevance to Project SƏMT / KURA

The principles from Lecture 1 establish the foundation for Project SƏMT (Su Əməliyyatlarının Mərkəzləşdirilmiş Təhlili):

| Lecture 1 Principle | Application in Project SƏMT / Kura |
|---|---|
| **Problem vs. Solution Space** | Distinguishing the physical distribution network (aging pipes, underground vaults, residential rooftop tanks) from SƏMT's cloud analytics layer. |
| **Operational Boundary** | Avoiding the trap of building a generic citizen billing or complaint app (already solved by `mygov`); keeping SƏMT strictly focused on operational telemetry and hydraulic mass balances. |
| **Risk-Driven Design** | Allocating heavy architectural design to the high-throughput boundary telemetry pipeline and the fair allocation solver, while keeping static GIS inventory interfaces simple. |
| **GCE Cycle for Report 2** | Generating alternative time-series storage candidates (PostgreSQL/TimescaleDB vs. InfluxDB), modeling them, and evaluating them against query latency and disk footprint. |
