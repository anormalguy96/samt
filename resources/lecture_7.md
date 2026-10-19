# Lecture 7: Design Reviews & Assurance Cases

**Course:** System Design (UNEC / Fall 2026)  
**Instructor:** Fidan Asgarova  
**Source Deck:** [lecture 7.pdf](file:///d:/github_repos/water/lecture%207.pdf) (64 slides)  
**Companion Reading:** [lectures_merged.pdf](file:///d:/github_repos/water/lectures_merged.pdf) (Chapter 14, pp. 77–94)  

---

## 1. Executive Summary & Learning Goals

Building a complex software architecture is only half the battle; an engineer must be able to prove, justify, and defend **why** the proposed architecture satisfies its critical quality attributes. Lecture 7 examines the formal engineering methodologies used to evaluate software architectures before costly implementation begins. It explores industrial **Design Reviews (RFCs)**, contrasts **Intellectual Control** with **Statistical Control** (Fairbanks), introduces the formal structure of **Assurance Cases** (Claims, Sub-claims, Evidence), and analyzes the boundaries of AI-assisted architectural design.

### Core Learning Goals
Upon mastering this material, students are able to:
1. **Formulate Architectural Arguments:** Construct structured design arguments demonstrating why a chosen architecture satisfies a specific functional requirement or quality attribute.
2. **Differentiate Intellectual vs. Statistical Control:** Articulate why empirical testing alone (statistical control) is mathematically insufficient for complex software, and how structural reasoning provides intellectual control.
3. **Build Structured Assurance Cases:** Deconstruct high-level safety, security, or reliability claims into verifiable sub-claims supported by concrete empirical or formal evidence.
4. **Conduct Professional Design Reviews:** Follow the Request for Comments (RFC) process practiced at premier technology companies (Google, Amazon) to critique architectures systematically.
5. **Critique AI-Generated Designs:** Identify the limitations of LLM-generated architectures, specifically their inability to guarantee intellectual control or assume legal/ethical liability.

---

## 2. Industrial Design Reviews: The RFC Process

At leading engineering organizations (e.g., Google, Amazon, Stripe), major features or system rewrites are never started by writing code. They begin with an **Architecture Decision Record (ADR)** or **Request for Comments (RFC)** document:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   THE ARCHITECTURAL RFC LIFECYCLE                      │
├────────────────────────────────────────────────────────────────────────┤
│ 1. Problem Formulation: Context, constraints, non-goals                │
│ 2. Proposed Architecture: C4 diagrams, data models, API schemas        │
│ 3. Alternative Candidates: Rejected options and rationale why          │
│ 4. Trade-off Analysis: Performance vs Cost, Consistency vs Latency     │
│ 5. Cross-Team Review: Security, SRE, and peer engineering critique     │
│ 6. Consensus & Sign-Off: Intellectual alignment before implementation  │
└────────────────────────────────────────────────────────────────────────┘
```

### Why Design Reviews Matter
* **Catching Architectural Flaws Early:** Fixing an architectural flaw during the design phase costs $\approx 100\times$ less than refactoring a distributed production database after launch.
* **Collective Intellectual Ownership:** Exposes blind spots, aligns cross-functional teams, and prevents single points of human failure in engineering knowledge.

---

## 3. Intellectual Control vs. Statistical Control (George Fairbanks)

How do engineers know that a system works safely and reliably?

```
┌────────────────────────────────────────────────────────────────────────┐
│ STATISTICAL CONTROL (Empirical / Black-Box)                            │
│ "We ran 50,000 automated end-to-end tests and observed zero crashes." │
│ Limitations: Software input spaces are astronomically large. Unlike    │
│ physical systems, software exhibits discontinuous behavior: an input   │
│ of 1,000,000 might succeed, while 1,000,001 causes an integer overflow.│
├────────────────────────────────────────────────────────────────────────┤
│ INTELLECTUAL CONTROL (Structural / White-Box)                          │
│ "We understand the system's internal structure, invariants, and        │
│ boundary proofs. We can reason through every failure state."           │
│ Mechanisms: Invariants, mathematical proofs, Design by Contract,       │
│ bounded execution paths, explicit state machines.                      │
└────────────────────────────────────────────────────────────────────────┘
```

**The Core Takeaway:** While statistical control (testing) is necessary, it can never substitute for intellectual control. Testing proves the presence of bugs, never their absence.

---

## 4. The Anatomy of an Assurance Case

An **Assurance Case** is a reasoned, auditable argument that a system achieves a critical requirement, supported by a body of evidence. Often formalized using **Goal Structuring Notation (GSN)**:

```
                           [ TOP-LEVEL CLAIM ]
              "The system achieves Quality Attribute X"
                                    │
                                    ▼
                        [ STRATEGY / ARGUMENT ]
              "Argue by decomposition across components"
                                    │
            ┌───────────────────────┴───────────────────────┐
            ▼                                               ▼
     [ SUB-CLAIM 1 ]                                 [ SUB-CLAIM 2 ]
  "Component A satisfies Y"                       "Component B satisfies Z"
            │                                               │
            ▼                                               ▼
       ( EVIDENCE )                                    ( EVIDENCE )
   [Benchmark test logs]                           [Formal schema proofs]
```

### Case Study: Sidewalk Delivery Robot Collision Avoidance
* **Top-Level Claim:** *"Autonomous delivery robot will not strike pedestrians while navigating urban sidewalks."*
* **Sub-Claim 1 (Sensing):** *"The perception subsystem detects obstacles $> 10\text{ cm}$ within a $5\text{ m}$ radius under all lighting conditions."*
  * *Evidence:* Sensor fusion test logs combining 3D LiDAR and stereo cameras across 500 hours of rain, fog, and nighttime testing.
* **Sub-Claim 2 (Braking):** *"The mechanical braking system brings the robot to a complete stop from top speed ($6\text{ km/h}$) within $1.2\text{ meters}$."*
  * *Evidence:* Mechanical dynamometer test data and hydraulic line pressure logs.
* **Sub-Claim 3 (Fail-Safe):** *"If perception sensors fail or become obscured, the robot immediately executes a controlled emergency stop."*
  * *Evidence:* Hardware watchdog circuit diagrams and fault injection test suites.

---

## 5. Case Study: IntelliGuard Security Camera (HW1 Review)

Lecture 7 examines peer design critiques of a smart home camera system:
* **The Claim:** *"IntelliGuard guarantees homeowner privacy by never streaming or recording video while authorized occupants are inside the house."*
* **Peer Review Flaws Uncovered:**
  1. *Missing Assumption:* The design assumed homeowner presence was determined via smartphone Bluetooth beacons. If the user's phone battery died, the camera classified them as "away" and recorded private home video.
  2. *Unvalidated Seam:* Video was uploaded to an AWS S3 bucket before being tagged with privacy permissions; an asynchronous worker deleted it if the user was home, creating a window of vulnerability.

---

## 6. Relevance to Project SƏMT / KURA (Report 2 Deliverable)

Assurance cases from Lecture 7 are utilized in **Report 2 / 4** to justify critical operational guarantees:

| SƏMT Critical Requirement | Assurance Case Structure (Lecture 7 Applied) |
|---|---|
| **Tamper-Proof National Water Accounting** | **Top Claim:** SƏMT audit logs cannot be falsified by compromised municipal operators.<br>**Sub-Claim 1:** Ingestion records are cryptographically signed at the edge using X.509 client certs.<br>**Sub-Claim 2:** Cloud audit logs are written to immutable, append-only TimescaleDB hypertables with external write-once replication.<br>**Evidence:** Cryptographic signature verification benchmarks and database RBAC privilege audit reports. |
| **IPMVP Option B Leak Verification** | **Top Claim:** Reported water savings reflect genuine underground pipe hole elimination rather than throttled customer supply pressure.<br>**Sub-Claim:** Post-repair flow measurements are mathematically normalized by the pressure ratio $(P_{\text{post}} / P_{\text{base}})^\alpha$.<br>**Evidence:** Empirical pressure-flow step-testing calibration logs. |
| **Fail-Safe Physical Network Protection** | **Top Claim:** SƏMT will never cause a water hammer or pipe burst.<br>**Sub-Claim:** SƏMT MVP is strictly a read-only advisory system with zero direct valve actuation commands.<br>**Evidence:** Architectural container isolation and network firewall rule audits. |
