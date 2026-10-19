# Lecture 13: Value Sensitive Design & Responsible Software Engineering

**Course:** System Design (UNEC / Fall 2026)  
**Instructor:** Fidan Asgarova  
**Source Deck:** [lecture 13.pdf](file:///d:/github_repos/water/lecture%2013.pdf) (48 slides)  
**Companion Reading:** [lectures_merged.pdf](file:///d:/github_repos/water/lectures_merged.pdf) (Chapter 14, pp. 91–94, 301–305)  

---

## 1. Executive Summary & Learning Goals

Software systems are never value-neutral tools; **code embodies ethical choices, encodes social priorities, and exercises power over human lives**. When software engineers optimize purely for narrow organizational metrics (clicks, revenue, engagement, or raw throughput), systems routinely produce severe unintended societal externalities—from psychological harm and algorithmic discrimination to the destruction of public goods. Lecture 13 introduces **Value Sensitive Design (VSD)** (pioneered by Batya Friedman), a principled architectural methodology that integrates human values—such as **Privacy**, **Fairness**, **Autonomy**, and **Accountability**—directly into system design from inception. It teaches engineers to identify both **Direct and Indirect Stakeholders**, analyze the famous **Waze Effect**, and evaluate the ethical responsibilities of technologists.

### Core Learning Goals
Upon mastering this material, students are able to:
1. **Articulate Ethical Responsibilities:** Recognize that software engineers possess immense social agency and bear moral accountability for the downstream societal consequences of their code.
2. **Identify Systemic Societal Harms:** Diagnose how algorithmic optimization creates unintended social externalities (e.g., addiction loops, mental health impacts, algorithmic exclusion).
3. **Apply the Value Sensitive Design (VSD) Framework:** Systematically incorporate human values into software requirements, component boundaries, and data models.
4. **Distinguish Direct from Indirect Stakeholders:** Map populations who interact with the system directly versus external communities whose lives are altered by the system's operational outputs.
5. **Analyze the "Waze Effect":** Deconstruct how optimizing individual utility can systematically degrade collective public welfare.

---

## 2. The Myth of Value-Neutral Software & Societal Harms

Software is often mistakenly viewed as a purely mathematical instrument that merely executes instructions. In reality, every architectural choice encodes human values:
* Prioritizing **Speed** over **Verification** values efficiency over correctness.
* Collecting telemetry without consent values **Data Monetization** over **Personal Privacy**.
* Optimizing social media algorithms for "engagement" systematically amplifies sensationalism, outrage, and addiction, degrading public mental health and democratic discourse.

```
       NARROW ORGANIZATIONAL METRICS                    VALUE SENSITIVE DESIGN
  ┌─────────────────────────────────────┐         ┌─────────────────────────────────────┐
  │ "Optimize for daily active users    │   VS    │ "What human values are at stake?    │
  │  and average session duration."     │         │  Who is harmed if this succeeds?    │
  │ (Ignores societal externalities)    │         │  How do we ensure equity & safety?" │
  └─────────────────────────────────────┘         └─────────────────────────────────────┘
```

---

## 3. Direct vs. Indirect Stakeholders & The "Waze Effect"

A critical failure of traditional software engineering is ignoring populations who do not have an account in the database.

```
┌────────────────────────────────────────────────────────────────────────┐
│ DIRECT STAKEHOLDERS: Individuals who directly interact with the        │
│ software system (e.g., app users, dispatchers, utility operators).     │
├────────────────────────────────────────────────────────────────────────┤
│ INDIRECT STAKEHOLDERS: Individuals or communities who never touch the  │
│ software, but whose lives, safety, property, or environment are        │
│ impacted by the system's outputs and routing decisions.                │
└────────────────────────────────────────────────────────────────────────┘
```

### The Waze Case Study
* **The System Goal:** The navigation app Waze calculated optimal driving routes to save individual drivers 2–3 minutes on their morning commutes.
* **The Direct Stakeholders:** Drivers who enjoyed slightly shorter commute times.
* **The Unintended Externalities on Indirect Stakeholders:**
  * Waze rerouted thousands of speeding vehicles down narrow, quiet residential side streets that were never engineered for high-volume traffic.
  * Residents suffered continuous noise pollution, exhaust fumes, blocked driveways, and dangerous conditions for neighborhood children playing outside.
  * Municipal infrastructure wore out prematurely without tax revenue to repair it.
* **System Design Lesson:** An algorithm that optimizes an isolated individual objective function without modeling systemic community impacts creates severe negative externalities for indirect stakeholders.

---

## 4. The Value Sensitive Design (VSD) Tripartite Methodology

Pioneered by Batya Friedman and Peter Kahn, VSD employs an iterative, tripartite approach to engineering:

```
                  ┌───────────────────────────────┐
                  │   CONCEPTUAL INVESTIGATIONS   │
                  │ Philosophical analysis of     │
                  │ values, rights, and tensions  │
                  └───────────────┬───────────────┘
                                  │
         ┌────────────────────────┴────────────────────────┐
         ▼                                                 ▼
┌───────────────────────────────┐         ┌───────────────────────────────┐
│    EMPIRICAL INVESTIGATIONS   │         │    TECHNICAL INVESTIGATIONS   │
│ Field interviews, stakeholder │ <=====> │ Architectural mechanisms,     │
│ surveys, lived human impact   │         │ data schemas, algorithm logic │
└───────────────────────────────┘         └───────────────────────────────┘
```

### Core Human Values in System Design
1. **Human Welfare & Safety:** Protection from physical harm, toxic exposure, or resource deprivation.
2. **Privacy & Bodily Autonomy:** Control over personal data and protection against unauthorized surveillance.
3. **Fairness & Distributive Justice:** Equitable distribution of public resources without discriminatory bias.
4. **Accountability & Auditability:** Systems must provide transparent explanations and immutable audit logs so decisions can be questioned and reviewed.
5. **Environmental Sustainability:** Minimizing carbon footprint, energy consumption, and natural resource waste.

---

## 5. Relevance to Project SƏMT / KURA (Report 2 Deliverable)

Value Sensitive Design is deeply woven into Project SƏMT because water is a fundamental human right and a scarce national resource:

| SƏMT Stakeholder Group | VSD Architectural Alignment (Lecture 13 Applied) |
|---|---|
| **Direct Stakeholders (ADSEA & Utility Dispatchers)** | The platform provides high-efficiency hydraulic mass balances, automated leak alerts, and ranked repair queues, empowering utility workers to localize physical losses rapidly. |
| **Indirect Stakeholders (Downstream Farmers & Villagers)** | Smallholder farmers in downstream canal reaches often suffer catastrophic crop failure when upstream commercial farms illegally divert irrigation water. SƏMT models downstream farmers as first-class indirect stakeholders, embedding mathematical minimum water thresholds into the allocation engine. |
| **Preventing The "Waze Effect" in Water Trucking** | Municipal emergency water tankers must not be routed purely on shortest road travel times if doing so systematically starves remote hillside settlements with poor road access. The allocation engine incorporates a **Wait-Time Equity Weight** to guarantee fair distribution regardless of geographical convenience. |
