# Lecture 8: Interface Design & Scalability

**Course:** System Design (UNEC / Fall 2026)  
**Instructor:** Fidan Asgarova  
**Source Deck:** [lecture 8.pdf](file:///d:/github_repos/water/lecture%208.pdf) (120 slides)  
**Companion Reading:** [lectures_merged.pdf](file:///d:/github_repos/water/lectures_merged.pdf) (Chapter 5, 6, 8, 10, pp. 41–76, 112–128)  

---

## 1. Executive Summary & Learning Goals

A software system that performs flawlessly under 100 requests per minute may collapse catastrophically when traffic surges to 100,000 requests per minute. Scalability is not simply adding more hardware; it is the architectural ability of a system to handle growing workloads gracefully by adding resources proportionately. Lecture 8 deconstructs the multidimensional nature of **Workload Characterization**, contrasts **Vertical vs. Horizontal Scaling**, establishes the mathematics of **Data Partitioning (Sharding)** and **Consistent Hashing**, explores **Replication models and CAP Theorem trade-offs**, and analyzes the engineering behind high-scale web platforms.

### Core Learning Goals
Upon mastering this material, students are able to:
1. **Differentiate Performance from Scalability:** Understand that performance measures resource consumption under static load, whereas scalability measures how performance adapts as load grows.
2. **Characterize System Workloads:** Quantify request arrival rates, peak-to-average burst ratios, data payload volumes, and the **Read-to-Write ratio**.
3. **Architect Stateless Application Tiers:** Externalize session state to scale web services horizontally behind Layer 4 and Layer 7 load balancers.
4. **Master Database Scaling Strategies:** Deploy Read-Replicas for read-heavy workloads and Partitioning/Sharding for write-heavy workloads.
5. **Implement Consistent Hashing:** Apply hash rings with virtual nodes to prevent global key reshuffling when storage nodes join or leave.
6. **Navigate CAP and Replication Trade-offs:** Evaluate Synchronous vs. Asynchronous database replication in relation to replication lag and eventual consistency.

---

## 2. Performance vs. Scalability & Workload Characterization

```
┌────────────────────────────────────────────────────────────────────────┐
│ PERFORMANCE: How fast does the system respond to a single request at a │
│ given load? (Measured in latency: p50, p95, p99 in milliseconds).      │
├────────────────────────────────────────────────────────────────────────┤
│ SCALABILITY: How much additional hardware resource is required to      │
│ maintain that performance when the request volume increases by 10x?    │
└────────────────────────────────────────────────────────────────────────┘
```

### The Dimensions of Workload Characterization
1. **Throughput & Request Rate:** Requests per second (RPS) or events per second.
2. **Read-to-Write Ratio:**
   * *Read-Heavy (e.g., News sites, Social feeds):* $100:1$ to $1000:1$. Solved via aggressive multi-tier caching (CDN, Redis) and read-only database replicas.
   * *Write-Heavy (e.g., IoT telemetry, Financial ledgers):* $1:1$ to $1:10$. Requires message buffering (Kafka), append-only time-series databases, and horizontal sharding.
3. **Payload Size Distribution:** Few massive megabyte requests vs. millions of lightweight sub-kilobyte packets.

---

## 3. Vertical vs. Horizontal Scaling

```
       VERTICAL SCALING (Scale Up)                     HORIZONTAL SCALING (Scale Out)
  ┌─────────────────────────────────────┐         ┌──────────┐ ┌──────────┐ ┌──────────┐
  │ Bigger CPU, more RAM, faster NVMe   │   VS    │ Server 1 │ │ Server 2 │ │ Server 3 │
  │ Limits: Physical ceiling, cost curve│         └──────────┘ └──────────┘ └──────────┘
  │ Single Point of Failure (SPOF)      │         (Elastic, fault-tolerant, commodity)
  └─────────────────────────────────────┘
```

### Making Application Services Horizontally Scalable
* **The Golden Rule:** The web/application tier must be strictly **Stateless**.
* **State Externalization:** User sessions, locks, and temporary files must not reside in server memory. They are offloaded to distributed caching tiers (Redis clusters) or shared object storage (S3/MinIO).
* **Load Balancing Algorithms:**
  * *Round Robin / Weighted Round Robin:* Distributes requests uniformly or based on static machine capacity.
  * *Least Connections:* Routes traffic to the server currently handling the fewest active TCP connections.
  * *IP Hash / Source Hash:* Guarantees requests from a specific client IP consistently reach the same backend.

---

## 4. Scaling the Data Tier: Replication & Partitioning

When data volume exceeds the storage or I/O capacity of a single physical server, the database must scale across multiple nodes.

### 4.1 Read Scaling: Primary-Replica Replication
* **Primary (Leader) Node:** Handles all write operations (`INSERT`, `UPDATE`, `DELETE`) and writes changes to a Write-Ahead Log (WAL).
* **Replica (Follower) Nodes:** Replicate WAL logs asynchronously and serve read queries (`SELECT`).
* **Replication Lag & Eventual Consistency:** Under asynchronous replication, followers may lag behind the leader by milliseconds or seconds. A client that writes to the leader and immediately reads from a follower may observe stale data (**Read-Your-Writes violation**).

### 4.2 Write Scaling: Database Partitioning (Sharding)
Dividing a single logical table across multiple independent physical database instances:

```
┌────────────────────────────────────────────────────────────────────────┐
│ RANGE-BASED PARTITIONING                                               │
│ Shard 1: Keys A–M | Shard 2: Keys N–Z                                  │
│ Pitfall: Severe Hotspots! If 80% of users have last names starting with│
│ "M", Shard 1 is overwhelmed while Shard 2 sits idle.                   │
├────────────────────────────────────────────────────────────────────────┤
│ HASH-BASED PARTITIONING (Modulo Hashing)                               │
│ Shard = Hash(key) % N                                                  │
│ Pitfall: Catastrophic Reshuffling! Changing N (adding a 4th server)    │
│ alters the modulo of almost every key, forcing a complete data rehash. │
├────────────────────────────────────────────────────────────────────────┤
│ CONSISTENT HASHING (The Industry Standard)                             │
│ Maps both servers and data keys to a 360-degree virtual circular ring. │
│ When a server is added or removed, only K/N keys are relocated.        │
│ Virtual nodes ensure uniform statistical load distribution.            │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Slide Case Study: The "Twitter Fail Whale" (Timeline Generation)

Lecture 8 analyzes the evolution of Twitter's timeline architecture:
* **The Naive Approach (Fan-out on Read):** When a user opens their timeline, execute a relational SQL join: `SELECT * FROM tweets JOIN follows WHERE follows.user_id = me ORDER BY timestamp DESC`.
  * *Failure:* As users followed hundreds of accounts, this complex relational join brought database servers to a standstill, displaying the famous "Fail Whale" error screen.
* **The Scalable Redesign (Fan-out on Write):**
  1. Maintain an in-memory Redis timeline list for every active user.
  2. When user $A$ tweets, an asynchronous worker pushes the tweet ID directly into the Redis lists of all user $A$'s followers.
  3. Reading a timeline becomes a blindingly fast $O(1)$ memory lookup: `LRANGE timeline:user_123 0 20`.
* **The Hybrid Edge Case (Celebrities):** For accounts with 50+ million followers (Lady Gaga, Elon Musk), fan-out on write would require writing 50 million Redis records per tweet. Twitter handles celebrities via a hybrid model: celebrity tweets are merged at read-time into standard fan-out timelines.

---

## 6. Relevance to Project SƏMT / KURA (Report 2 Deliverable)

Scalability calculations directly govern the architectural design of SƏMT in **Report 2 / 4**:

| SƏMT Scalability Requirement | Implementation Strategy (Lecture 8 Applied) |
|---|---|
| **High Write Ingestion Load** | At national scale (280,000 sensors), steady-state ingestion generates $\approx 403\text{ readings/s}$, with transient burst loads reaching $20,400\text{ readings/s}$ during pressure surges. SƏMT partitions incoming Kafka topics by `dma_id` using Consistent Hashing, distributing write loads across independent worker nodes. |
| **TimescaleDB Hypertable Partitioning** | High-frequency telemetry tables are automatically partitioned into time-space chunks (1-day intervals $\times$ 16 DMA hash buckets). Queries for 02:00–04:00 AM Minimum Night Flow prune 95% of database disk blocks without scanning irrelevant dates. |
| **Read/Write Decoupling** | Field operator dashboard queries (reads) are served from read-replicas and cached in Redis, guaranteeing that heavy analytical GIS queries never lock the core ingestion pipeline. |
