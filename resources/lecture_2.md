# Lecture 2: Design Abstractions & System Modeling

**Course:** System Design (UNEC / Fall 2026)  
**Instructor:** Fidan Asgarova  
**Source Deck:** [lecture 2.pdf](file:///d:/github_repos/water/lecture%202.pdf) (108 slides)  
**Companion Reading:** [lectures_merged.pdf](file:///d:/github_repos/water/lectures_merged.pdf) (Chapter 2 & 4, pp. 162–192)  

---

## 1. Executive Summary & Learning Goals

Abstraction is the central intellectual tool software engineers use to manage cognitive complexity. Without appropriate abstractions, large-scale systems become incomprehensible. Lecture 2 focuses on how software system designers formulate, represent, and evaluate design abstractions across both the problem space (domain entities, external actors, environment assumptions) and the solution space (software components, containers, interfaces, execution state).

### Core Learning Goals
Upon mastering this material, students are able to:
1. **Explain the Role of Abstraction:** Articulate how abstraction reduces cognitive overload by suppressing implementation minutiae while highlighting essential architectural structures and invariants.
2. **Critique Informal Notations:** Identify why ambiguous "box-and-line" drawings fail to provide intellectual control, and how to apply formal semantics.
3. **Master Multi-Level Modeling:** Apply the **C4 Model** (Context, Container, Component, Code) to represent software systems at varying granularities.
4. **Formulate Context & Domain Models:** Map system boundaries, external dependencies, and environmental assumptions.
5. **Construct Behavioral Models:** Develop state machines and sequence diagrams to reason about concurrent interactions, error states, and life-cycle transitions.
6. **Evaluate Model Utility:** Determine whether a design abstraction adequately answers specific architectural questions regarding performance, reliability, and security.

---

## 2. The Nature of Abstraction in System Design

### 2.1 Managing Cognitive Load
A complete software system contains millions of lines of code, billions of physical transistors, complex OS schedulers, and network protocol stacks. No human mind can track all these variables simultaneously.
* **Abstraction Defined:** A conceptual representation that preserves critical structural relationships while omitting irrelevant incidental details.
* **Views and Viewpoints:** A single diagram cannot capture an entire system. Different stakeholders require different architectural views (logical, deployment, process, data).

### 2.2 The Pitfalls of Ambiguous "Box-and-Line" Diagrams
Informal whiteboard sketches are useful for quick brainstorming but fail as architectural specifications:
* **Undefined Box Semantics:** Does a box represent a physical server, a software class, a database table, a thread, or a human user?
* **Undefined Line Semantics:** Does an arrow represent data flow, control flow (RPC/HTTP), network cable connection, inheritance, or temporal dependency?
* **Missing Error Boundaries:** Informal diagrams rarely document timeout behaviors, failure semantics, or trust boundaries.

```
      AMBIGUOUS BOX-AND-LINE                     RIGOROUS C4 CONTAINER MODEL
  ┌────────┐       ┌────────┐             ┌──────────────────────────────────────────────┐
  │ Client │ ----> │ Server │             │ Single Page App (React, Web Browser)         │
  └────────┘       └────────┘             └──────────────────────┬───────────────────────┘
       │                                                         │ HTTPS / JSON (REST)
       ▼                                                         ▼
  ┌────────┐                              ┌──────────────────────────────────────────────┐
  │ Database│                             │ Ingestion API Container (Go, Port 8080)       │
  └────────┘                              └──────────────────────┬───────────────────────┘
  (What is the protocol? Is it                                   │ TCP / SQL (Pool: 20)
   synchronous? What happens if DB is down?)                     ▼
                                          ┌──────────────────────────────────────────────┐
                                          │ Relational DB Container (PostgreSQL 15)      │
                                          └──────────────────────────────────────────────┘
```

---

## 3. Structural Modeling: The C4 Architectural Hierarchy

Lecture 2 introduces the **C4 Model** (devised by Simon Brown) as an industry-standard framework for hierarchical design documentation:

```
┌────────────────────────────────────────────────────────────────────────┐
│ LEVEL 1: SYSTEM CONTEXT                                                │
│ Shows the system in its environment: actors, users, external systems   │
├────────────────────────────────────────────────────────────────────────┤
│ LEVEL 2: CONTAINER DIAGRAM                                             │
│ Shows high-level executable units: web apps, mobile apps, databases,   │
│ microservices, message queues, storage buckets                         │
├────────────────────────────────────────────────────────────────────────┤
│ LEVEL 3: COMPONENT DIAGRAM                                             │
│ Decomposes a single container into major internal modules, controllers,│
│ services, data access layers, and their interface contracts            │
├────────────────────────────────────────────────────────────────────────┤
│ LEVEL 4: CODE DIAGRAM (UML / Class Diagram)                            │
│ Lowest-level classes, interfaces, and design patterns within a         │
│ specific component (often generated from code)                         │
└────────────────────────────────────────────────────────────────────────┘
```

### Context Diagrams & Boundary Definition
* **The System Boundary:** The dividing line between what the development team owns and controls versus the external world.
* **External Systems:** Third-party services, legacy databases, government APIs, payment gateways, and cellular networks.
* **Environmental Assumptions:** Explicitly documented preconditions regarding external behavior (e.g., *"External SMS gateway guarantees delivery within 60 seconds 99% of the time"*).

---

## 4. Behavioral & Dynamic Modeling

### 4.1 Sequence Diagrams (Temporal Interactions)
Sequence diagrams model how components interact over time to fulfill a specific use case:
* **Lifelines:** Represent concurrent processes, threads, or microservices.
* **Synchronous vs. Asynchronous Messages:** Distinguishes blocking request-response calls from non-blocking pub/sub events.
* **Activation Bars:** Illustrate execution duration and waiting periods, highlighting latency bottlenecks and potential deadlocks.

### 4.2 State Machine Diagrams (Lifecycle Dynamics)
State machines model components with rich internal state, defining:
* **States:** Stable conditions of the component (e.g., `Idle`, `Buffering`, `Transmitting`, `ErrorDegraded`).
* **Transitions:** Directed edges triggered by internal or external events.
* **Guards:** Boolean conditions that must evaluate to true before a transition can fire.
* **Actions:** Operations executed upon state entry, exit, or transition.

---

## 5. Detailed Case Study: Electronic Voting System

Lecture 2 uses an electronic voting terminal to illustrate how design models expose subtle architectural flaws:
* **Problem Space Context:** Voters submit confidential ballots; election officials tally votes; physical voting machines sit in public polling stations without continuous internet connectivity.
* **The Component Architecture:**
  1. `Voter Interface`: Captures touchscreen touches and renders confirmation screens.
  2. `Ballot Tabulator`: Encrypts vote data and increments local totals.
  3. `Audit Logger`: Writes immutable records to an append-only physical memory module.
  4. `Network Dispatcher`: Transmits encrypted batches to the central election server when connectivity is established.
* **Using Models to Expose Bugs:**
  * Constructing a **State Machine** revealed an unhandled state: If a voter walked away mid-vote, the machine remained in `BallotOpen` indefinitely, allowing the next voter to vote twice.
  * A **Sequence Diagram** revealed a timing flaw: If power was cut while `Audit Logger` was writing, the in-memory tabulator counted the vote but the audit record was lost, violating election verifiability.

---

## 6. Relevance to Project SƏMT / KURA (Report 2 Deliverable)

In **Report 2 / 4**, students must provide complete C4 architectural models:

| C4 Level | Application to Project SƏMT / Kura |
|---|---|
| **Level 1: System Context** | Positions SƏMT between field hardware (flow meters, pressure sensors), external data portals (`opendata.az`, `mygov`), and operational actors (ADSEA dispatchers, WUA canal managers). |
| **Level 2: Container Diagram** | Formalizes the multi-container topology hosted on *Hökumət Buludu*: Ingestion Gateway (Rust/mTLS), Apache Kafka, Apache Flink, TimescaleDB/PostGIS, Mixed-Integer Linear Programming (MILP) Solver, and Dispatch PWA. |
| **Level 3: Component Diagram** | Deconstructs the *DMA Mass Balance & Leak Localization Service* into internal modules: `WindowedFlowAggregator`, `NightBaselineFilter`, `BurstTransientDetector`, and `WorkOrderDispatcher`. |
| **State Machine Modeling** | Formulates the strict 4-stage life-cycle of a physical leak incident: `Detected` $\rightarrow$ `Assigned` $\rightarrow$ `Repaired` $\rightarrow$ `Verified` (M&V audit). |
