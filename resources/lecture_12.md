# Lecture 12: Design for Usability & Human Factors

**Course:** System Design (UNEC / Fall 2026)  
**Instructor:** Fidan Asgarova  
**Source Deck:** [lecture 12.pdf](file:///d:/github_repos/water/lecture%2012.pdf) (44 slides)  
**Companion Reading:** [lectures_merged.pdf](file:///d:/github_repos/water/lectures_merged.pdf) (Chapter 10 & 14, pp. 109, 295–305)  

---

## 1. Executive Summary & Learning Goals

A software system can possess faultless algorithmic correctness, high throughput, and robust cybersecurity, yet still fail completely in the field if human operators cannot understand or operate it safely. Usability is not merely superficial graphic design or UI styling; **usability is an architectural quality attribute rooted in cognitive psychology and human-computer interaction**. Lecture 12 investigates the dynamics of **Mental Models**, uncovers the fatal consequences of **Mental Model Mismatches** through historic real-world disasters (Boeing 737 MAX, Three Mile Island, automotive electronic shifters), and establishes architectural strategies—such as **Interaction Cost Reduction**, **State Visibility**, and **Defensive Error Handling**—to align the machine's internal state with the operator's cognitive expectations.

### Core Learning Goals
Upon mastering this material, students are able to:
1. **Define Usability as a Quality Attribute:** Measure usability across Jakob Nielsen’s five core dimensions: **Learnability**, **Efficiency**, **Memorability**, **Error Prevention & Recovery**, and **Satisfaction**.
2. **Quantify Interaction Cost:** Calculate the cumulative physical (clicks, typing, navigation) and cognitive (memory burden, interpretation effort) friction imposed on users.
3. **Map Mental Models:** Articulate the critical differences between the **Designer’s Model**, the **System Image**, and the **User’s Mental Model** (Don Norman).
4. **Identify Mental Model Mismatches:** Detect dangerous divergence between an operator's internal assumptions and the software's true operational state.
5. **Mitigate State Confusion:** Engineer clear sensory feedback, visible system status, and reversible actions to prevent catastrophic mode confusion.

---

## 2. Foundational Usability Frameworks: Don Norman's Model

In *The Design of Everyday Things*, cognitive scientist Don Norman demonstrated that users do not interact directly with source code; they interact with the **System Image**:

```
     ┌────────────────────────┐
     │    DESIGNER'S MODEL    │ (The technical reality, algorithms, database state)
     └───────────┬────────────┘
                 │ Expressed through
                 ▼
     ┌────────────────────────┐
     │      SYSTEM IMAGE      │ (The UI screens, sounds, physical levers, messages)
     └───────────┬────────────┘
                 │ Perceived and interpreted by
                 ▼
     ┌────────────────────────┐
     │  USER'S MENTAL MODEL   │ (The user's internal mental belief of how it works)
     └────────────────────────┘
```

* **The Core Vulnerability:** The designer and the user never communicate directly. The user constructs their mental model entirely from the **System Image**. If the system image is ambiguous, misleading, or silent, the user's mental model will diverge from reality, precipitating operational accidents.

---

## 3. Catastrophic Real-World Failures from Mental Model Mismatches

### 3.1 The Boeing 737 MAX Crashes (MCAS Mode Confusion)
* **The Incident:** Two Boeing 737 MAX airliners (Lion Air Flight 610 and Ethiopian Airlines Flight 302) crashed shortly after takeoff, killing 346 people.
* **The Mismatch:** Boeing installed an automated software system (**MCAS**) designed to push the aircraft's nose down to mimic the flight handling of older 737 models. To minimize pilot training costs, Boeing did not disclose the existence of MCAS in flight manuals.
* **The Fatal Divergence:** When a faulty angle-of-attack sensor triggered MCAS, pilots believed they were flying under manual control. As the automated software repeatedly forced the trim nose-down, the pilots fought the control column without understanding why the aircraft was disobeying their physical inputs.

### 3.2 The Monostable Automotive Gear Shifter (Rollaway Deaths)
* **The Incident:** Fiat Chrysler recalled 1.1 million vehicles after dozens of rollover injuries and deaths (including actor Anton Yelchin).
* **The Mismatch:** Traditional automatic shifters physically move into distinct geometric slots (Park, Reverse, Neutral, Drive). The new electronic monostable shifter operated like a joystick, returning to the center position after every push.
* **The Fatal Divergence:** Drivers pushed the lever forward, assumed their physical muscle memory placed the car in "Park", and opened the door. The car remained in "Neutral" or "Reverse", rolling down driveways and crushing drivers against gates.

### 3.3 Three Mile Island Nuclear Meltdown (State vs. Command Confusion)
* **The Incident:** A partial nuclear meltdown occurred in Pennsylvania (1979).
* **The Mismatch:** A light on the control panel illuminated indicating the emergency relief valve was closed.
* **The Fatal Divergence:** The light actually indicated that the *electrical solenoid command* to close had been dispatched, not that the physical mechanical valve had actually sealed shut. The valve remained jammed open for hours, draining reactor coolant while operators believed it was sealed.

---

## 4. Architectural Strategies for Usability & Human Factors

```
┌────────────────────────────────────────────────────────────────────────┐
│                        USABILITY DESIGN HEURISTICS                     │
├────────────────────┬───────────────────────────────────────────────────┤
│ 1. VISIBILITY OF   │ System should always keep users informed about    │
│    SYSTEM STATUS   │ what is going on through appropriate feedback.    │
├────────────────────┼───────────────────────────────────────────────────┤
│ 2. MATCH SYSTEM TO │ Use words, phrases, and concepts familiar to the  │
│    THE REAL WORLD  │ user (real-world metaphors, standard domain terms)│
├────────────────────┼───────────────────────────────────────────────────┤
│ 3. USER CONTROL &  │ Support clear "emergency exits" — undo, redo, and │
│    FREEDOM         │ explicit confirmation for high-consequence actions│
├────────────────────┼───────────────────────────────────────────────────┤
│ 4. ERROR           │ Eliminate error-prone conditions; warn users      │
│    PREVENTION      │ before they commit to destructive actions.        │
├────────────────────┼───────────────────────────────────────────────────┤
│ 5. RECOGNIZE OVER  │ Minimize cognitive load; do not require users to  │
│    RECALL          │ remember IDs across different screens.            │
└────────────────────┴───────────────────────────────────────────────────┘
```

### Minimizing Interaction Cost
Every user action incurs an **Interaction Cost**:
$$\text{Interaction Cost} = \text{Physical Cost (Clicks, Keystrokes, Scrolling)} + \text{Cognitive Cost (Attention, Memory Burden)}$$

Architectures that force operators to switch between three separate software tools, manually copy-paste meter serial numbers, or mentally calculate unit conversions impose excessive interaction costs, dramatically increasing human error rates under operational stress.

---

## 5. Relevance to Project SƏMT / KURA (Report 2 Deliverable)

Human factors from Lecture 12 directly dictate the operator interfaces in Project SƏMT:

| User Persona & Interface | Usability Engineering Strategy (Lecture 12 Applied) |
|---|---|
| **Field Crew Repair PWA (Underground Vaults)** | Utility repair crews operate in muddy, noisy underground chambers with wet touchscreen smartphones. The field view eliminates small dropdowns in favor of large, high-contrast tap targets, supports complete offline form caching, and provides clear visual confirmations when pre/post-repair acoustic readings are uploaded. |
| **Control Room Leak Map (Preventing Mode Confusion)** | The centralized dispatch console displays explicit, unambiguous hydraulic states for District Metered Areas. Color coding distinguishes verified physical leaks from temporary nocturnal anomalies (such as residential rooftop storage tank refilling), preventing dispatchers from sending emergency repair crews to false alarms. |
| **Canal Dispatcher Overrides (Transparent Status)** | When a regional water master manually alters an algorithmic irrigation schedule, the system provides immediate, transparent feedback showing the exact downstream farmers affected, forcing explicit two-step confirmation with documented reason codes. |
