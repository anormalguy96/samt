# Lecture 3: Designing Interface Specifications

**Course:** System Design (UNEC / Fall 2026)  
**Instructor:** Fidan Asgarova  
**Source Deck:** [lecture 3.pdf](file:///d:/github_repos/water/lecture%203.pdf) (54 slides)  
**Companion Reading:** [lectures_merged.pdf](file:///d:/github_repos/water/lectures_merged.pdf) (Chapter 9 & 13, pp. 21–40, 129–145)  

---

## 1. Executive Summary & Learning Goals

An interface is a formal boundary across which two independent software systems or components interact. An interface specification serves as an explicit, binding contract between the service provider (callee) and the service consumer (caller). Lecture 3 examines how to design rigorous interface specifications using **Design by Contract (DbC)** principles, exploring the multi-dimensional design space of specifications (deterministic vs. under-determined, declarative vs. operational, strong vs. weak, and general vs. restrictive).

### Core Learning Goals
Upon mastering this material, students are able to:
1. **Define the Structure of a Specification:** Formulate precise contracts specifying preconditions (`requires`), postconditions (`ensures`), parameter types, return values, and explicit exception semantics.
2. **Understand Specifications as Implementation Sets:** Conceive of a specification as defining a mathematical set of acceptable software implementations.
3. **Navigate Specification Dimensions:** Deliberately choose where a specification should sit along four core axes:
   * Deterministic vs. Under-determined
   * Declarative vs. Operational
   * Strong vs. Weak
   * General vs. Restrictive
4. **Allocate Responsibilities:** Make deliberate trade-offs regarding whether validation logic should reside on the client side or the server side.

---

## 2. Anatomy of an Interface Contract (Design by Contract)

Coined by Bertrand Meyer, Design by Contract posits that component interaction is governed by mutual obligations and guarantees:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        INTERFACE SPECIFICATION CONTRACT                │
├───────────────────┬────────────────────────────────────────────────────┤
│ PRECONDITION      │ What the CALLER must guarantee before invocation.  │
│ (`requires`)      │ If violated, callee has zero obligation.           │
├───────────────────┼────────────────────────────────────────────────────┤
│ POSTCONDITION     │ What the CALLEE guarantees upon return, provided   │
│ (`ensures`)       │ all preconditions were satisfied.                  │
├───────────────────┼────────────────────────────────────────────────────┤
│ EXCEPTIONAL EXIT  │ Explicitly defined failure states when input meets │
│ (`throws`)        │ preconditions but execution cannot succeed.        │
└───────────────────┴────────────────────────────────────────────────────┘
```

### The Invalidation Rule
If the caller fails to meet the precondition (`requires`), **the contract is void**. The provider is under no obligation to return a sensible result, handle errors gracefully, or avoid terminating execution. In practice, defensive programming often adds runtime guards, but formally, the caller owns precondition compliance.

---

## 3. Four Core Dimensions of Interface Specifications

```
                       THE SPECIFICATION DESIGN SPACE
        Deterministic <──────────────────────────────> Under-determined
          Declarative <──────────────────────────────> Operational
               Strong <──────────────────────────────> Weak
              General <──────────────────────────────> Restrictive
```

### 3.1 Deterministic vs. Under-Determined Specifications
* **Deterministic:** For any valid input meeting the precondition, there is exactly **one** legal return value.
  * *Example:* `int findFirst(int[] arr, int val)` $\rightarrow$ Returns the *lowest index* $i$ such that $arr[i] == val$.
* **Under-Determined:** Multiple distinct return values are legally acceptable. The implementer is free to return whichever is most computationally efficient.
  * *Example:* `int findAny(int[] arr, int val)` $\rightarrow$ Returns *any index* $i$ such that $arr[i] == val$.
  * *Architectural Value:* Gives implementers freedom to use multi-threaded search, caching, or SIMD vectorization without breaking client contracts.

### 3.2 Declarative vs. Operational Specifications
* **Operational:** Explains step-by-step pseudo-code or algorithms for how the result should be computed.
  * *Anti-Pattern:* Over-constrains the implementer and leaks implementation details into the public contract.
* **Declarative:** States properties of the final output in relation to the inputs, without dictating algorithmic steps.
  * *Example:* *"Returns a list $L'$ containing all elements of input list $L$ sorted in non-decreasing order ($L'[i] \le L'[i+1]$ for all $i$)."*

### 3.3 Strong vs. Weak Specifications
A specification $S_A$ is **stronger** than specification $S_B$ if:
1. $S_A$'s precondition is weaker than or equal to $S_B$'s ($Requires(S_A) \subseteq Requires(S_B)$ — accepts more inputs).
2. $S_A$'s postcondition is stronger than or equal to $S_B$'s ($Ensures(S_A) \implies Ensures(S_B)$ — guarantees more promises).

$$\text{Implementation Set}(S_{\text{strong}}) \subset \text{Implementation Set}(S_{\text{weak}})$$

```
      WEAK SPECIFICATION (Large Set)           STRONG SPECIFICATION (Small Set)
  ┌─────────────────────────────────────┐   ┌─────────────────────────────────────┐
  │ requires: arr is sorted, non-empty  │   │ requires: arr is non-null           │
  │ ensures: returns index or -1        │   │ ensures: returns lowest index,      │
  │ (Easy to implement, hard for caller)│   │          completes in O(log N) time │
  └─────────────────────────────────────┘   │ (Hard to implement, easy for caller)│
                                            └─────────────────────────────────────┘
```

### 3.4 General vs. Restrictive Specifications
* **General:** Operates over broader data types, interfaces, or wider domains (e.g., generic collections, polymorphic tokens).
* **Restrictive:** Tailored strictly to a narrow, specialized use case.

---

## 4. Code Walkthrough: Specifying the Navigation Route Service

Lecture 3 demonstrates designing the interface for a transportation route solver (`RouteService`):

```typescript
/**
 * Computes the optimal driving route between two geographical coordinates.
 * 
 * @requires origin != null && destination != null
 * @requires origin.isValid() && destination.isValid()
 * @requires maxDetourMinutes >= 0
 * 
 * @ensures \result.waypoints.first() == origin
 * @ensures \result.waypoints.last() == destination
 * @ensures \result.totalDurationMinutes <= directDurationMinutes + maxDetourMinutes
 * @ensures \result.waypoints obey all traffic direction regulations
 * 
 * @throws RouteNotFoundException if no contiguous road network connects origin and destination
 * @throws TimeoutException if calculation exceeds 2500ms
 */
function calculateRoute(
    origin: LatLng, 
    destination: LatLng, 
    maxDetourMinutes: number
): RouteResult;
```

### Critical Design Decision: Division of Responsibility
* **Option A (Strict Preconditions):** Caller must ensure points are on a navigable road. Simplifies service logic; crashes if caller makes a mistake.
* **Option B (Tolerant Postconditions):** Service snaps nearest coordinates to roads. Adds computational complexity to service, but makes client integration substantially easier.

---

## 5. Relevance to Project SƏMT / KURA (Report 2 Deliverable)

In **Report 2 / 4**, students must formalize exact REST and gRPC API contracts:

| Project SƏMT Subdomain | Interface Contract Specification Design (Lecture 3 Applied) |
|---|---|
| **Boundary Telemetry Ingestion (gRPC / Protobuf v3)** | **Preconditions:** Binary packet timestamp must be within $\pm 15\text{ minutes}$ of server UTC clock; payload must contain valid X.509 device fingerprint; battery voltage $> 3.2\text{V}$.<br>**Postconditions:** Returns HTTP 202 Accepted; persists packet into Kafka topic `telemetry.dma.raw` with partition key `dma_id`. |
| **DMA Mass Balance Calculation (REST API)** | **Preconditions:** Query parameters must supply ISO-8601 start and end timestamps where $end - start \le 30\text{ days}$.<br>**Postconditions:** Returns net inflow $\Delta V$, estimated physical loss rate, and rolling baseline deviation flag in $< 350\text{ms}$. |
| **Canal Allocation Solver (MILP Dispatch)** | **Preconditions:** Sum of crop irrigation requests $> 0$; upstream reservoir head level confirmed.<br>**Postconditions:** Produces an allocation schedule satisfying human drinking water minimums ($50\text{ L/cap/day}$) before allocating agricultural shares; generates machine-readable audit reason codes. |
