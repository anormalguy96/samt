# Lecture 14: Applied System Ethics, Algorithmic Governance & Design Synthesis

**Course:** System Design (UNEC / Fall 2026)  
**Instructor:** Fidan Asgarova  
**Source Deck:** [lecture 14.pdf](file:///d:/github_repos/water/lecture%2014.pdf) (48 slides)  
**Companion Reading:** [lectures_merged.pdf](file:///d:/github_repos/water/lectures_merged.pdf) (Chapter 14, pp. 77–94, 301–317)  

---

## 1. Executive Summary & Learning Goals

Designing software for complex sociotechnical ecosystems requires navigating difficult ethical dilemmas where desirable human values come into direct conflict. Furthermore, because software is intrinsically malleable, systems can be maliciously **reappropriated** or gamed in ways their creators never intended. Lecture 14 explores the resolution of **Value Tensions**, provides methodologies for anticipating and mitigating **Software Reappropriation**, formalizes **Algorithmic Governance and Explainability**, and synthesizes the entire 14-lecture System Design curriculum into an integrated, end-to-end architectural engineering framework.

### Core Learning Goals
Upon mastering this material, students are able to:
1. **Resolve Value Tensions:** Identify and arbitrate fundamental trade-offs between competing values (e.g., Efficiency vs. Equity, Privacy vs. Auditability, Autonomy vs. Safety).
2. **Anticipate Software Reappropriation:** Formulate "abuse cases" to predict how malleable software features can be weaponized or gamed by bad actors.
3. **Architect Algorithmic Governance:** Embed machine-readable reason codes, human-in-the-loop overrides, and explainable decision paths into automated solvers.
4. **Synthesize the Complete System Design Lifecycle:** Connect requirements engineering, formal abstractions, interface contracts, modifiability, testability, interoperability, scalability, robustness, security, and human factors into a unified architectural methodology.

---

## 2. Navigating Value Tensions in System Architecture

System designers cannot maximize every human value simultaneously. When values conflict, architects must make principled, transparent trade-offs rather than leaving trade-offs to accidental implementation choices:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        MAJOR VALUE TENSIONS IN SYSTEM DESIGN           │
├──────────────────────────┬─────────────────────────────────────────────┤
│ EFFICIENCY VS.           │ An algorithm that maximizes total economic  │
│ FAIRNESS                 │ output might starve marginalized rural      │
│                          │ communities with poor infrastructure.       │
├──────────────────────────┼─────────────────────────────────────────────┤
│ PRIVACY VS.              │ End-to-end encryption protects user privacy │
│ ACCOUNTABILITY           │ but impedes forensic investigations into    │
│                          │ financial fraud or municipal corruption.    │
├──────────────────────────┼─────────────────────────────────────────────┤
│ AUTOMATION VS.           │ Fully automated algorithms optimize reaction│
│ HUMAN AGENCY             │ times but strip human operators of the      │
│                          │ ability to exercise compassionate judgment. │
├──────────────────────────┼─────────────────────────────────────────────┤
│ TRANSPARENCY VS.         │ Openly publishing exact dispatch formulas   │
│ ANTI-GAMING              │ allows stakeholders to audit decisions, but │
│                          │ also enables bad actors to game the system. │
└──────────────────────────┴─────────────────────────────────────────────┘
```

### Principled Resolution Strategy
1. **Explicit Identification:** Document competing values openly in Architecture Decision Records (ADRs).
2. **Multi-Stakeholder Consultation:** Solicit direct input from affected communities rather than letting developers decide social policy.
3. **Threshold Guarantees:** Establish hard mathematical floors (e.g., *"No customer receives less than $50\text{ L/cap/day}$ of drinking water, regardless of economic efficiency optimization"*).

---

## 3. Malleable Software & The Threat of Reappropriation

Software is malleable: once deployed, users and adversaries adapt features to serve goals completely divorced from the designer's intent.

### Case Studies in Malicious Reappropriation
* **Apple AirTags (Stalking & Theft):** Designed as an innocuous tool to locate lost keys and luggage via Apple's Find My crowd-sourced mesh network. Adversaries quickly reappropriated AirTags as untraceable stalking devices slipped into victims' coats or luxury cars to facilitate vehicle theft.
* **Biometric & Facial Recognition:** Developed to expedite frictionless airport boarding, but reappropriated by authoritarian regimes for mass political surveillance and targeting of ethnic minorities.

### Designing Against Reappropriation (Abuse Case Modeling)
Engineers must conduct **Abuse Case Modeling** alongside standard Use Case modeling:
* *"How can an adversarial actor misuse this feature to inflict harm?"*
* *"How can an insider exploit this telemetry to exert unlawful coercion?"*
* *Mitigations:* Built-in anti-stalking beacon alerts, strict rate-limiting, cryptographically verifiable purpose-logging, and irreversible privacy anonymization.

---

## 4. Algorithmic Governance & Machine-Readable Explainability

When automated algorithms allocate scarce public resources (water, electricity, vaccines, school placements), "black box" decisions are socially and legally unacceptable.

```
                    ALGORITHMIC GOVERNANCE ARCHITECTURE
   ┌───────────────────────┐
   │ Optimization Request  │ (Canal Irrigation Quotas)
   └───────────┬───────────┘
               │
               ▼
   ┌───────────────────────┐
   │ Mixed-Integer Linear  │ ──> Solves objective function: Maximize crop yield
   │ Programming (MILP)    │     subject to canal flow constraints
   └───────────┬───────────┘
               │
               ▼
   ┌───────────────────────┐
   │ Explainability Engine │ ──> Generates human-readable audit reason codes:
   │ & Audit Logger        │     "District B received 60% quota due to wilting"
   └───────────┬───────────┘     "point threat under Decree 402, Priority 1."
               │
               ▼
   ┌───────────────────────┐
   │ Operator Intervention │ ──> Allows human water master to override, but
   │ Review Boundary       │     forces documented justification into audit log
   └───────────────────────┘
```

---

## 5. Master Synthesis of the 14-Lecture System Design Curriculum

Across the semester, the 14 lectures form an integrated, disciplined engineering progression:

```
┌────────────────────────────────────────────────────────────────────────┐
│               THE UNEC SYSTEM DESIGN ENGINEERING ROADMAP               │
├────────────────────────────────────────────────────────────────────────┤
│ PHASE 1: FOUNDATIONS & PROBLEM SPACE                                   │
│  * Lecture 1: Problem vs Solution Space, Risk-Driven Design, GCE       │
│  * Lecture 2: C4 Modeling, Context Diagrams, State Machines            │
├────────────────────────────────────────────────────────────────────────┤
│ PHASE 2: STATIC ARCHITECTURE & BOUNDARIES                              │
│  * Lecture 3: Interface Specifications & Design by Contract (DbC)      │
│  * Lecture 4: Design for Change, Information Hiding, Modularity, DIP   │
├────────────────────────────────────────────────────────────────────────┤
│ PHASE 3: DEPENDABILITY & INTEGRATION                                   │
│  * Lecture 5: Design for Testability, Test Seams & Test Doubles        │
│  * Lecture 6: Design for Interoperability, Ontologies, Postel's Law    │
│  * Lecture 7: Design Reviews, Intellectual Control & Assurance Cases   │
├────────────────────────────────────────────────────────────────────────┤
│ PHASE 4: HIGH SCALE & RESILIENCE                                       │
│  * Lecture 8: Scalability, Data Partitioning & Consistent Hashing      │
│  * Lecture 9: Service Integration Testing & Consumer-Driven Contracts  │
│  * Lecture 10: Robustness, HAZOP Analysis & Doer-Checker Patterns      │
├────────────────────────────────────────────────────────────────────────┤
│ PHASE 5: SECURITY, HUMAN FACTORS & ETHICS                              │
│  * Lecture 11: Security Design, STRIDE Modeling & Least Privilege      │
│  * Lecture 12: Usability, Mental Model Alignment & Human Error         │
│  * Lecture 13: Value Sensitive Design & Indirect Stakeholders          │
│  * Lecture 14: Value Tensions, Abuse Modeling & Algorithmic Governance │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Relevance to Project SƏMT / KURA (Report 2 Deliverable)

The ethical and governance principles from Lecture 14 provide the final polish for **Report 2 / 4**:

| SƏMT Subdomain | Algorithmic Governance Implementation (Lecture 14 Applied) |
|---|---|
| **Equitable Water Allocation** | SƏMT eliminates non-transparent, paper-based queueing in rural canals. The MILP allocation engine outputs mathematically auditable justification records for every cubic meter delivered, guaranteeing that commercial agricultural conglomerates cannot divert water from vulnerable smallholders. |
| **Preventing Reappropriation** | High-frequency municipal smart meter telemetry could theoretically be misused by criminals to detect when homeowners are away on vacation (zero consumption). SƏMT mitigates this abuse risk by enforcing differential privacy and strict RBAC isolation between operational utility dispatchers and external billing systems. |
| **Tamper-Evident Audit Trails** | All algorithmic dispatch recommendations and manual human overrides are permanently recorded with cryptographic hashes, ensuring full compliance with State Water Resources Agency (ADSEA) oversight regulations. |
