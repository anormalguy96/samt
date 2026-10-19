# Lecture 9: Service Integration Testing & Contract Testing

**Course:** System Design (UNEC / Fall 2026)  
**Instructor:** Fidan Asgarova  
**Source Deck:** [lecture 9.pdf](file:///d:/github_repos/water/lecture%209.pdf) (24 slides)  
**Companion Reading:** [lectures_merged.pdf](file:///d:/github_repos/water/lectures_merged.pdf) (Chapter 13, pp. 141–143)  

---

## 1. Executive Summary & Learning Goals

In modern distributed microservice architectures, monolithic testing suites break down. Verifying interactions between dozens of independently deployed services via full end-to-end integration environments is notoriously slow, expensive, and fragile. Lecture 9 explores modern **Service Integration Testing**, contrasting the anti-pattern of **Big-Bang Integration Testing** with the state-of-the-art methodology of **Consumer-Driven Contract (CDC) Testing**. Using frameworks like **Pact**, CDC testing allows autonomous engineering teams to verify inter-service compatibility independently without spinning up complex, multi-service testing clusters.

### Core Learning Goals
Upon mastering this material, students are able to:
1. **Critique Big-Bang Testing:** Identify why deploying all microservices simultaneously for integration tests leads to deployment gridlock, flaky test runs, and unlocalized failure diagnostics.
2. **Apply Consumer-Driven Contracts (CDC):** Define the roles of **Consumers** (API clients) and **Providers** (API servers) in establishing automated data contracts.
3. **Execute Contract Testing Workflows:** Trace the multi-step lifecycle of generating, publishing, and verifying contracts using the **Pact framework**.
4. **Manage Provider State Preconditions:** Specify necessary provider setup states (e.g., *"Item exists in inventory with quantity $> 5$"*) to test complex multi-step transaction flows.
5. **Decouple Integration Testing from Network Environments:** Enable asynchronous CI/CD verification where consumer and provider test suites run entirely independently.

---

## 2. The Microservice Integration Dilemma: Big-Bang vs. Contract Testing

```
┌────────────────────────────────────────────────────────────────────────┐
│ BIG-BANG INTEGRATION TESTING (The Fragile Monolith Approach)           │
│ Deploy Service A, B, C, D, E, F simultaneously in a shared staging     │
│ environment. Send an HTTP request to A and verify DB changes in F.     │
│ Failures: Network blip between C and D fails the test; broken staging  │
│ data halts all team deployments; pinpointing the buggy line is slow.   │
├────────────────────────────────────────────────────────────────────────┤
│ CONSUMER-DRIVEN CONTRACT TESTING (The Incremental Approach)            │
│ Break the testing problem into pairwise contracts. Consumer defines    │
│ exactly what request it sends and what fields it expects back.         │
│ Provider verifies it satisfies this contract against its local code.   │
│ Zero network calls; zero shared environments; instant failure localization│
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. The 4-Step Consumer-Driven Contract Workflow (Pact)

```
   CONSUMER CI/CD PIPELINE                              PROVIDER CI/CD PIPELINE
┌─────────────────────────────┐                      ┌─────────────────────────────┐
│ Step 1: Consumer Unit Test   │                      │ Step 3: Provider Test Run   │
│ Mock Provider returns canned│                      │ Replays recorded contract   │
│ response; generates Pact JSON│                      │ against real service code   │
└──────────────┬──────────────┘                      └──────────────▲──────────────┘
               │                                                    │
               ▼                                                    │
┌─────────────────────────────┐                      ┌──────────────┴─────────────┐
│ Step 2: Publish Contract    │ ───────────────────> │ Step 4: Verify Contract    │
│ Uploads Pact JSON file to   │      Contract        │ Validates all fields match;│
│ central Pact Broker         │      Repository      │ passes or breaks build     │
└─────────────────────────────┘                      └────────────────────────────┘
```

1. **Step 1 (Consumer Test):** The consumer team writes a unit test against an in-process mock server configured with Pact. As the test passes, Pact serializes an exact JSON contract containing the request path, query parameters, expected status code, and JSON schema.
2. **Step 2 (Publish Contract):** The resulting JSON pact is published to a shared artifact repository (**Pact Broker**).
3. **Step 3 (Provider Verification):** In a completely separate repository and build pipeline, the provider reads the contract from the Pact Broker.
4. **Step 4 (Provider Assertion):** The Pact runner replays the consumer's recorded requests directly against the provider's local controllers. If the provider renamed a field or changed a data type, the build immediately fails with an exact diff.

---

## 4. Provider States & Contract Preconditions

In real business workflows, endpoints cannot return data unless specific preconditions exist in the database. Contract testing solves this using **Provider States**:

```json
{
  "consumer": { "name": "OrderService" },
  "provider": { "name": "PaymentService" },
  "interactions": [
    {
      "description": "A request to charge a valid credit card",
      "providerState": "Customer with ID 42 exists and has an active credit card with $200 limit",
      "request": {
        "method": "POST",
        "path": "/charges",
        "headers": { "Content-Type": "application/json" },
        "body": { "customerId": 42, "amount": 75.50 }
      },
      "response": {
        "status": 200,
        "headers": { "Content-Type": "application/json" },
        "body": {
          "transactionId": "txn_987654321",
          "status": "APPROVED",
          "chargedAmount": 75.50
        }
      }
    }
  ]
}
```

* **Setup Hook:** Before replaying this interaction, the provider's test framework invokes a setup hook corresponding to `"Customer with ID 42 exists..."`, inserting the temporary test record into the local test database.

---

## 5. Slide Activities: Team Messaging & Music Streaming Architectures

Lecture 9 presents two comprehensive architectural design activities:

### Activity 1: Team Messaging Platform (Slack-like)
* **Core Microservices:** `AuthService`, `ChannelService`, `MessageDispatchService`, `PresenceService`, `NotificationWorker`.
* **Contract Testing Boundary:** Between `ChannelService` (Consumer) and `MessageDispatchService` (Provider). The contract verifies that posting a message with missing attachments returns a structured `400 Bad Request` with an array of validation error codes.

### Activity 2: Music Streaming App (Spotify-like)
* **Core Microservices:** `AudioCatalogService`, `StreamingService`, `UserPlaylistService`, `RoyaltyAccountingService`.
* **Contract Testing Boundary:** When a song finishes playing, `StreamingService` emits a playback event consumed by `RoyaltyAccountingService`. Contract testing guarantees that track play duration (in milliseconds) and artist ISRC codes match expected accounting precision.

---

## 6. Relevance to Project SƏMT / KURA (Report 2 Deliverable)

Contract testing principles directly guide multi-service integration in Project SƏMT:

| Inter-Service Boundary | Contract Testing Specification (Lecture 9 Applied) |
|---|---|
| **Telemetry Ingestion $\rightarrow$ DMA Balance Service** | `DmaBalanceService` (Consumer) defines a contract for the Kafka stream output of `IngestionService` (Provider), asserting that flow records contain valid ISO-8601 timestamps, DMA UUIDs, and positive float volumes. |
| **Leak Localization $\rightarrow$ Work Order Service** | When Minimum Night Flow (MNF) analysis detects a persistent leak, it invokes the `WorkOrderService` REST API. Contract tests verify that the JSON payload contains GIS coordinates, estimated loss rate ($m^3/h$), and priority level. |
| **Allocation Solver $\rightarrow$ Notification Gateway** | The Mixed-Integer Linear Programming (MILP) allocation engine dispatches emergency tanker routes. Contract tests verify that the notification payload conforms to SMS gateway byte limits ($160\text{ characters}$) and handles Azerbaijani special characters (`ə`, `ı`, `ş`, `ç`, `ğ`). |
