# Lecture 5: Design for Testability

**Course:** System Design (UNEC / Fall 2026)  
**Instructor:** Fidan Asgarova  
**Source Deck:** [lecture 5.pdf](file:///d:/github_repos/water/lecture%205.pdf) (86 slides)  
**Companion Reading:** [lectures_merged.pdf](file:///d:/github_repos/water/lectures_merged.pdf) (Chapter 12 & 13, pp. 95–111, 141–143)  

---

## 1. Executive Summary & Learning Goals

Testing is not an afterthought that occurs once coding finishes; **testability is a core architectural quality attribute** that must be engineered into the software structure from day one. A poorly designed system is impossible to test effectively without fragile, slow, and flaky end-to-end setups. Lecture 5 explores the dual concepts of **Controllability** and **Observability**, identifies how external dependencies sabotage testability, and demonstrates architectural patterns—including **Test Seams**, **Dependency Injection**, and **Test Doubles**—to make complex distributed systems thoroughly testable in automated CI/CD pipelines.

### Core Learning Goals
Upon mastering this material, students are able to:
1. **Define Testability:** Characterize how easily a software system permits the discovery and localization of faults through automated tests.
2. **Diagnose Testability Bottlenecks:** Identify challenges related to **Controllability** (inability to drive the system into specific edge states) and **Observability** (inability to verify internal state transformations).
3. **Architect Test Seams:** Create strategic points in the architecture where test harnesses can inject alternative behaviors without modifying production source code.
4. **Deploy Test Doubles:** Select and implement the correct test double category (**Dummies**, **Stubs**, **Spies**, **Mocks**, **Fakes**) for a given testing scenario.
5. **Separate Business Logic from Infrastructure:** Apply Hexagonal (Ports & Adapters) architecture to test domain algorithms in isolation from databases, networks, and hardware.

---

## 2. The Twin Pillars of Testability: Controllability & Observability

```
                       THE TESTABILITY EQUATION
   ┌───────────────────────┐                    ┌───────────────────────┐
   │     CONTROLLABILITY   │                    │     OBSERVABILITY     │
   ├───────────────────────┤                    ├───────────────────────┤
   │ Can I force the system│        TESTABLE    │ Can I inspect the     │
   │ into the exact state  │ <================> │ system's state and    │
   │ needed to test the    │         SYSTEM     │ outputs to verify     │
   │ scenario?             │                    │ correctness?          │
   └───────────────────────┘                    └───────────────────────┘
```

### 2.1 Controllability Challenges
* **Hardcoded Clocks:** If a discount applies only on Christmas Day, a method calling `new Date()` cannot be tested on July 14th without altering the operating system clock.
* **Unreachable Error Branches:** Hardcoding a database driver inside a class makes it impossible to simulate a network timeout, socket disconnect, or disk-full error in a unit test.
* **Non-Deterministic Sources:** Calls to random number generators, external third-party HTTP endpoints, or hardware GPS sensors prevent deterministic test reproduction.

### 2.2 Observability Challenges
* **Void Return Types with Hidden Mutations:** A method that updates a private internal database record but returns `void` cannot be evaluated without querying the physical database.
* **Swallowed Exceptions:** Catching errors internally and writing them to an unstructured console log obscures failures from test assertions.

---

## 3. Test Seams & Test Doubles Taxonomy

### 3.1 What is a Test Seam?
Coined by Michael Feathers (*Working Effectively with Legacy Code*):
> *"A seam is a place where you can alter behavior in your program without editing in that place."*

The primary mechanism for establishing test seams in modern software is **Dependency Injection (DI)** combined with interface polymorphism.

### 3.2 The Test Double Hierarchy (Meszaros Taxonomy)
Lecture 5 details the five distinct types of test doubles:

| Test Double | Purpose | Typical Use Case |
|---|---|---|
| **Dummy** | Passed around to satisfy parameter lists; never actually invoked or inspected. | Supplying an unused `Logger` or `Context` parameter to a constructor. |
| **Fake** | Has a working business implementation, but takes shortcuts that make it unsuitable for production. | An in-memory Hash-Map database or fake in-memory payment gateway. |
| **Stub** | Provides pre-programmed, canned answers to method calls made during the test. | Forcing an `ExchangeRateService` to return `1.70 AZN/USD` deterministically. |
| **Spy** | A stub that also records execution metadata (call counts, passed arguments) for later assertion. | Verifying that `notificationSender.send()` was invoked exactly twice with recipient `"admin@adsea.gov.az"`. |
| **Mock** | Pre-programmed with expected method signatures and arguments; automatically fails the test if unexpected calls occur. | Strict interaction testing verifying exact sequencing between order and billing services. |

---

## 4. Design Principles for High Testability

### Principle 1: Separate Business Logic from Infrastructure Code
Business algorithms should never make network calls, read environment variables, or execute SQL directly:

```
        HEXAGONAL ARCHITECTURE (PORTS & ADAPTERS)
  ┌────────────────────────────────────────────────────────┐
  │ INFRASTRUCTURE (ADAPTERS)                              │
  │   PostgreSQL Driver, Kafka Consumer, Cellular Modem   │
  │        │                               ▲               │
  │        ▼ (Implements Port)             │ (Calls Port)  │
  │ ┌──────────────────────────────────────────────┐       │
  │ │ CORE DOMAIN LOGIC (PORTS / INTERFACES)       │       │
  │ │   Hydraulic Mass Balance, Leak Filter,       │       │
  │ │   Water Allocation Linear Solver             │       │
  │ └──────────────────────────────────────────────┘       │
  └────────────────────────────────────────────────────────┘
```

### Principle 2: Make Time Injectable
Never instantiate system time directly inside business logic:

```python
# UNTESTABLE: Bound to real physical time
class DiscountService:
    def is_holiday_discount_active(self) -> bool:
        today = datetime.now()
        return today.month == 12 and today.day == 25

# TESTABLE: Clock abstraction injected via seam
class Clock(ABC):
    @abstractmethod
    def now(self) -> datetime: pass

class DiscountService:
    def __init__(self, clock: Clock):
        self._clock = clock

    def is_holiday_discount_active(self) -> bool:
        today = self._clock.now()
        return today.month == 12 and today.day == 25
```

---

## 5. Walkthrough Example: Shopping Cart Checkout

Lecture 5 analyzes refactoring an un-testable e-commerce checkout flow:
* **Initial Anti-Pattern:** The `Order.checkout()` method directly initialized `new DatabaseConnection()`, `new StripePaymentGateway()`, and `new SmtpEmailClient()`. Testing checkout required an internet connection, a valid credit card, and an active SQL server.
* **Refactored Architecture:**
  1. `PaymentProcessor` interface injected into `OrderService`.
  2. `OrderRepository` interface injected to handle persistence.
  3. `NotificationDispatcher` interface injected for confirmation messages.
* **Testing Result:** 100% of checkout business logic (tax calculation, discount validation, inventory decrement logic) runs in under 12 milliseconds using in-memory stubs, completely isolated from network or database downtime.

---

## 6. Relevance to Project SƏMT / KURA (Report 2 Deliverable)

Testability principles from Lecture 5 are vital for SƏMT because real physical water hardware is inaccessible during laboratory software development:

| SƏMT Subdomain | Testability Design (Lecture 5 Applied) |
|---|---|
| **Boundary Telemetry Ingestion** | We cannot deploy 2,000 physical ultrasonic meters underground to test ingestion. We create a **Synthetic Telemetry Generator (Fake)** that streams simulated 15-second flow and 50 Hz acoustic pressure bursts directly into Kafka test topics. |
| **Minimum Night Flow (MNF) Analysis** | In production, MNF analyzes flow between 02:00 AM and 04:00 AM. In unit testing, we inject a mock `Clock` to test overnight leak baseline filtering on recorded historical datasets in fractions of a second. |
| **Water Allocation Solver** | The Mixed-Integer Linear Programming (MILP) solver is decoupled from live ADSEA and WUA database connections, accepting plain in-memory domain fixtures (`FarmRequest`, `CanalCapacity`) to verify equitable allocation math deterministically. |
