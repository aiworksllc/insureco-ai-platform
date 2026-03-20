# InsureCo AI Platform

A real-world reference implementation of an AI-governed insurance SaaS platform, demonstrating compliance with the **EU AI Act** and **NIST AI Risk Management Framework** using [Sentinel-Ops](https://yadriworks.ai/docs).

## The Problem

Insurance companies deploying AI agents face strict regulatory requirements:

- **EU AI Act** classifies insurance AI (underwriting, claims, fraud detection) as **high-risk** (Annex III, Section 5)
- **NIST AI RMF** requires governance, risk mapping, measurement, and management of AI systems
- Traditional approaches rely on manual audits and self-attestation — they don't scale to autonomous agents making thousands of decisions per day

## The Solution

Every AI agent action passes through a **Safe Operating Envelope (SOE)** enforced by Sentinel-Ops before execution. The SOE defines what each agent can do, what data it can access, and what authority it has — then enforces it deterministically.

```
Agent wants to act ──> SOE Gate evaluates ──> ALLOW / DENY / ESCALATE
                                                  │
                                    Immutable audit trail (Art. 12)
```

## Architecture

```
InsureCo Platform
├── ClaimsBot ──────── [HIGH RISK] Auto-adjudicates claims < €5,000
├── UnderwriteAI ───── [HIGH RISK] Risk scoring without protected characteristics
├── FraudHunter ────── [HIGH RISK] Pattern detection (flag-only, no adjudication)
└── PolicyAdvisor ──── [LIMITED]   Customer Q&A chatbot (read-only)
         │
         ▼
    Sentinel-Ops SOE Gate
    ├── Deterministic pre-filter (<1ms, 95% of calls)
    ├── Sentinel AI (ambiguous cases, 5% of calls)
    ├── Arbiter (cumulative risk scoring)
    ├── Chronicle (immutable audit trail)
    └── Beacon (cross-agent anomaly detection)
```

## Quick Start

```bash
# Clone
git clone https://github.com/aiworksllc/insureco-ai-platform.git
cd insureco-ai-platform

# Deploy SOE definitions to Sentinel-Ops
export SOE_API_URL=https://your-sentinel-ops-endpoint
export SOE_API_KEY=your-api-key
node deploy/deploy-soe.js

# Run the demo scenarios
node demo/run-scenarios.js

# Run a specific agent's scenarios
node demo/run-scenarios.js --agent claims-bot
```

## Demo Scenarios (14 total)

### ClaimsBot — Auto-Adjudication

| # | Scenario | Expected | EU AI Act |
|---|----------|----------|-----------|
| 1 | Approve €2,800 claim (under €5K limit) | ALLOW | Art. 12 — logged |
| 2 | Escalate €12,500 claim (over limit) | ESCALATE | Art. 14 — human oversight |
| 3 | Approve €800 windshield claim | ALLOW | Art. 12 — logged |
| 4 | Read customer protected data | **DENY** | Art. 10 — data governance |

### UnderwriteAI — Risk Scoring

| # | Scenario | Expected | EU AI Act |
|---|----------|----------|-----------|
| 5 | Score low-risk customer (credit 742) | ALLOW | Art. 13 — transparent factors |
| 6 | Score high-risk customer (credit 655, 7 claims) | ALLOW | Art. 13 — transparent factors |
| 7 | Access ethnicity for underwriting | **DENY** | Art. 10 — protected characteristics |

### FraudHunter — Pattern Detection

| # | Scenario | Expected | EU AI Act |
|---|----------|----------|-----------|
| 8 | Analyze suspicious claim (rapid succession) | ALLOW | Art. 14 — flag, don't decide |
| 9 | Access another tenant's data | **DENY** | Data isolation |
| 10 | Modify a claim (unauthorized) | **DENY** | Read-only agent |

### PolicyAdvisor — Customer Chatbot

| # | Scenario | Expected | EU AI Act |
|---|----------|----------|-----------|
| 11 | Answer coverage question | ALLOW | Art. 52 — AI disclosure |
| 12 | Modify a policy | **DENY** | Read-only agent |
| 13 | Read claims data | **DENY** | Scope boundary |
| 14 | Execute system command | **DENY** | No bash access |

## SOE Definitions

Each agent has a JSON envelope in `soe-definitions/` that defines:

- **Identity** — role, authority level, environment scope
- **Data Access** — read/write allow/deny glob patterns
- **Tool Actions** — which tools/commands are permitted
- **Risk Budget** — cumulative risk threshold before envelope tightens
- **Classification** — EU AI Act risk level, relevant articles, NIST AI RMF categories

Example (ClaimsBot):
```json
{
  "agentId": "claims-bot",
  "classification": {
    "euAiAct": "high-risk",
    "annex": "III-5b",
    "articles": ["Art.6", "Art.12", "Art.14"]
  },
  "dataAccess": {
    "readAllow": ["data/claims/**", "data/policies/**", "data/customers/*"],
    "readDeny": ["data/customers/*/protected", "data/customers/*/protected/**"]
  }
}
```

## Compliance Matrix

See [docs/compliance-matrix.md](docs/compliance-matrix.md) for the full mapping of:
- EU AI Act articles to SOE constraints to demo scenarios
- NIST AI RMF functions to SOE implementation evidence
- Agent risk classification with specific obligations

## Project Structure

```
insureco-ai-platform/
├── platform/
│   ├── server.js                 # Insurance SaaS API
│   ├── soe-client.js             # Sentinel-Ops client (evaluate + deploy)
│   ├── data/seed.js              # Mock customers, policies, claims
│   └── agents/
│       ├── claims-bot/           # Auto-adjudication
│       ├── underwrite-ai/        # Risk scoring
│       ├── fraud-hunter/         # Fraud detection
│       └── policy-advisor/       # Customer chatbot
├── soe-definitions/              # SOE envelope per agent
│   ├── claims-bot.soe.json
│   ├── underwrite-ai.soe.json
│   ├── fraud-hunter.soe.json
│   └── policy-advisor.soe.json
├── demo/
│   └── run-scenarios.js          # 14 demo scenarios
├── docs/
│   └── compliance-matrix.md      # EU AI Act + NIST mapping
├── deploy/
│   └── deploy-soe.js             # Deploy SOE definitions
└── tests/
    ├── compliance/               # Compliance verification tests
    └── e2e/                      # End-to-end scenarios
```

## Key Design Principles

1. **Fail-closed** — if the SOE gate is unreachable, all agent actions are denied
2. **Deterministic enforcement** — glob/regex matching, no AI hallucination in the critical path
3. **Protected characteristics isolation** — underwriting cannot access ethnicity, disability, religion, or political affiliation at the data layer, not just policy
4. **Separation of duties** — FraudHunter can flag but not adjudicate; PolicyAdvisor can read but not write
5. **Human-in-the-loop** — claims above threshold are escalated, never auto-approved
6. **Transparent scoring** — every risk score includes factor breakdown and natural language explanation
7. **Immutable audit** — every SOE decision is logged; even the agents cannot modify the trail

## License

Apache 2.0

## Built With

- [Sentinel-Ops](https://yadriworks.ai/docs) — Safe Operating Envelope for AI Agents
- Node.js 20+
