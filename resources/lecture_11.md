# Lecture 11: Design for Security & Threat Modeling

**Course:** System Design (UNEC / Fall 2026)  
**Instructor:** Fidan Asgarova  
**Source Deck:** [lecture 11.pdf](file:///d:/github_repos/water/lecture%2011.pdf) (84 slides)  
**Companion Reading:** [lectures_merged.pdf](file:///d:/github_repos/water/lectures_merged.pdf) (Chapter 11, pp. 220–233)  

---

## 1. Executive Summary & Learning Goals

Security is not a plugin or firewall appliance that can be bolted onto an insecure software architecture after deployment; **security is an emergent architectural property** that must be engineered from first principles. When designing enterprise and critical infrastructure systems, engineers face an inherent asymmetric disadvantage: the defender must secure every possible attack surface, while an adversary needs to discover only one unvalidated input or unauthenticated trust boundary. Lecture 11 explores the foundational **CIA Triad**, provides hands-on mastery of the **STRIDE Threat Modeling Methodology**, establishes the timeless **Saltzer & Schroeder Secure Design Principles**, and analyzes real-world security architectures including **Process Privilege Separation** and the **Trusted Computing Base (TCB)**.

### Core Learning Goals
Upon mastering this material, students are able to:
1. **Apply the CIA Triad:** Classify security requirements and threat impacts under **Confidentiality**, **Integrity**, and **Availability**.
2. **Execute STRIDE Threat Modeling:** Systematically audit data flow diagrams across trust boundaries to uncover Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, and Elevation of Privilege vulnerabilities.
3. **Map Trust Boundaries:** Identify transitions where data or control flow moves between different privilege domains.
4. **Implement Saltzer & Schroeder Principles:** Apply core tenets—most notably **Least Privilege**, **Complete Mediation**, **Defense in Depth**, and **Fail-Safe Defaults**.
5. **Architect Privilege Separation:** Decompose monolithic backend processes into isolated, least-privilege micro-daemons (e.g., the *qmail* architecture).
6. **Define the Trusted Computing Base (TCB):** Minimize the architectural surface area that must be trusted to ensure global system integrity.

---

## 2. Foundational Security Concepts & The Asymmetric Challenge

```
┌────────────────────────────────────────────────────────────────────────┐
│                        THE CIA SECURITY TRIAD                          │
├────────────────────┬───────────────────────────────────────────────────┤
│ CONFIDENTIALITY    │ Prevention of unauthorized access or disclosure   │
│                    │ of sensitive data (encryption, access control).   │
├────────────────────┼───────────────────────────────────────────────────┤
│ INTEGRITY          │ Prevention of unauthorized modification, deletion,│
│                    │ or corruption of data (cryptographic signatures). │
├────────────────────┼───────────────────────────────────────────────────┤
│ AVAILABILITY       │ Guarantee of timely, reliable access to resources │
│                    │ for authorized principals (redundancy, anti-DoS). │
└────────────────────┴───────────────────────────────────────────────────┘
```

### Why Security is Difficult: The Attacker's Asymmetric Advantage
* **The Defender's Burden:** Must identify all assets, model every potential threat, correctly configure hundreds of cloud components, and make zero mistakes across millions of lines of code.
* **The Attacker's Economics:** Can spend months probing the perimeter; succeeds by exploiting a single forgotten debug endpoint, unpatched library, or weak default password.

---

## 3. The STRIDE Threat Modeling Methodology

Pioneered at Microsoft, **STRIDE** provides a systematic taxonomy for auditing every data flow, process, and data store across defined **Trust Boundaries**:

```
┌───────┬────────────────────────────┬───────────────────────┬──────────────────────────────┐
│ THREAT│ DEFINITION                 │ VIOLATED PROPERTY     │ STANDARD MITIGATION          │
├───────┼────────────────────────────┼───────────────────────┼──────────────────────────────┤
│ **S** │ **Spoofing**               │ Authenticity          │ Mutual TLS, X.509 certs,     │
│       │ Impersonating a user/device│                       │ OAuth 2.0 / JWT tokens       │
├───────┼────────────────────────────┼───────────────────────┼──────────────────────────────┤
│ **T** │ **Tampering**              │ Integrity             │ HMAC signatures, TLS crypto, │
│       │ Modifying data in transit  │                       │ Append-only cryptographic log│
├───────┼────────────────────────────┼───────────────────────┼──────────────────────────────┤
│ **R** │ **Repudiation**            │ Non-Repudiation       │ Immutable audit trails,      │
│       │ Denying performed actions  │                       │ Digital signatures, SIEM logs│
├───────┼────────────────────────────┼───────────────────────┼──────────────────────────────┤
│ **I** │ **Information Disclosure** │ Confidentiality       │ Encryption at rest (AES-256),│
│       │ Leaking private telemetry  │                       │ Zero-logging of PII secrets  │
├───────┼────────────────────────────┼───────────────────────┼──────────────────────────────┤
│ **D** │ **Denial of Service**      │ Availability          │ Rate limiting, Token bucket, │
│       │ Flooding server resources  │                       │ Edge WAF, Queue backpressure │
├───────┼────────────────────────────┼───────────────────────┼──────────────────────────────┤
│ **E** │ **Elevation of Privilege** │ Authorization         │ Role-Based Access (RBAC),    │
│       │ Standard user gets root    │                       │ Least privilege, Param SQL   │
└───────┴────────────────────────────┴───────────────────────┴──────────────────────────────┘
```

### Trust Boundaries Defined
A trust boundary exists wherever data passes from an untrusted or less-trusted entity to a more-trusted entity:
* Between a cellular edge gateway in an underground vault and the cloud API gateway.
* Between a public web frontend and the internal PostgreSQL database.
* Between an external government portal (`opendata.az`) and internal stream processors.

---

## 4. Timeless Principles of Secure Software Design (Saltzer & Schroeder)

Published in 1975, these eight engineering principles remain the definitive foundation of modern cybersecurity:

1. **Least Privilege:** Every program and user must operate with the bare minimum set of privileges necessary to complete the job. (Never run microservices as `root` or `sa`).
2. **Complete Mediation:** Every single access to every object must be checked for authority. Never cache authorization decisions across requests.
3. **Defense in Depth:** Multiple independent security layers must be stacked together. If the network firewall is breached, database encryption and RBAC must still prevent data exfiltration.
4. **Economy of Mechanism (Simplicity):** Keep the security design simple and small. Complex security systems inevitably contain subtle logic flaws that bypass protection.
5. **Fail-Safe Defaults:** Default to deny. Unless explicit access permission has been granted, access is refused.
6. **Open Design (Kerckhoffs's Principle):** Security must not depend on the secrecy of the design or source code. Assume the adversary has full architecture diagrams and source code.
7. **Separation of Privilege:** High-consequence actions require two independent keys or credentials (e.g., multi-party approval before altering national water quotas).
8. **Psychological Acceptability (Usability):** Security controls must not be so cumbersome that operators develop workarounds (like taping passwords to monitors).

---

## 5. Architectural Case Studies: Privilege Separation & The TCB

### 5.1 The *qmail* Privilege Separation Architecture
Traditional Unix mail servers (`sendmail`) ran as a massive monolithic binary with root privileges. A single buffer overflow allowed an attacker to take over the entire server. Dan Bernstein architected **qmail** around extreme privilege separation:
* `qmail-smtpd`: Minimal, unprivileged network daemon exposed to the internet. Reads incoming bytes; drops root immediately; cannot modify local mailboxes.
* `qmail-queue`: Runs under a separate UID; only verifies and spools messages to disk.
* `qmail-send`: Coordinates delivery; never talks directly to the network.
* **Result:** In over two decades of operation, *qmail* had virtually zero remote root vulnerabilities.

### 5.2 The Trusted Computing Base (TCB)
The TCB is the total collection of hardware, software, and firmware components whose correct operation is strictly necessary to enforce the system security policy.
* **Architectural Imperative:** Minimize the size of the TCB. The smaller the TCB, the easier it is to formally audit, verify, and secure.

---

## 6. Relevance to Project SƏMT / KURA (Report 2 Deliverable)

Because SƏMT monitors national civil infrastructure, it is classified as Sovereign Critical Information Infrastructure (CII) under Cabinet of Ministers Decrees No. 229 & 230:

| Security Domain | SƏMT Secure Architecture Implementation (Lecture 11 Applied) |
|---|---|
| **Edge Device Authentication (Anti-Spoofing)** | Every physical edge gateway in the 150 pilot DMAs is provisioned with a private key stored in an encrypted secure hardware element. Telemetry connects over private APN using **Mutual TLS 1.3 (mTLS)** with client certificates, strictly eliminating rogue sensor spoofing. |
| **Tamper-Resistant Audit Logging (Anti-Repudiation)** | Any dispatcher override of an automated irrigation schedule or leak repair status is immutably logged with an HMAC signature and dispatcher digital ID into an append-only audit hypertable. |
| **Sovereign Cloud Isolation (Defense in Depth)** | In strict compliance with Azerbaijani regulatory frameworks, all SƏMT microservices are deployed exclusively within the sovereign government cloud (*Hökumət Buludu* hosted by AzInTelecom) across a **4-Zone XRİTDX Security Architecture** (Edge Zone $\rightarrow$ DMZ Ingestion $\rightarrow$ Core Analytics $\rightarrow$ Isolated Database Zone). |
