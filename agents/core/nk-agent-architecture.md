# NKR Agent Operating System — Architecture

**Version:** 2.0 | **Owner:** Harkirat Singh | **Updated:** May 2026

---

## Philosophy

Many small specialist agents, not one giant agent.
Worker agents do narrow tasks. Manager agents verify their work.
QA agents audit hallucinations, pricing, safety, tone, and missing info.
CEO Agent monitors all managers and proposes improvements.
Human reviews all customer-facing and high-risk decisions.
Gmail Drafts are the owner's action queue. Spreadsheet logs are audit-only.

---

## Hierarchy

```
Human Owner (Harkirat)
│  ← approves all production changes, customer-facing sends, high-risk decisions
│
├── CEO Agent                   [nk-ceo-agent.md]
│   │  ← monitors managers, diagnoses system failures, proposes improvements
│   │
│   ├── Intake Manager          [nk-intake-manager.md]
│   │   └── Workers: Booking Converter, Lead Scorer
│   │
│   ├── Communication Manager   [nk-communication-manager.md]
│   │   └── Workers: Quote Builder, Deposit Chaser, Objection Handler,
│   │                Post-Event Follow-up, Cold Lead Reviver
│   │
│   ├── Operations Manager      [nk-operations-manager.md]
│   │   └── Workers: Booking Pipeline Manager, CRM Manager,
│   │                Delivery/Setup, Weather Decision, Inventory Manager
│   │
│   ├── Sales/Pricing Manager   [nk-sales-pricing-manager.md]
│   │   └── Workers: Quote Builder, Package Recommender, Upsell Specialist,
│   │                Objection Handler, School/Community Events
│   │
│   ├── Marketing/Growth Manager [nk-marketing-growth-manager.md]
│   │   └── Workers: Caption Writer, Reel Script Writer, Content Calendar,
│   │                Ad Copywriter, Review Specialist, SEO Specialist
│   │
│   └── Agent Hiring Manager    [nk-agent-hiring-manager.md]
│       └── Reads: all failure logs, agent registry, QA audit reports
│
└── QA Auditor (cross-cutting)  [nk-quality-control-auditor.md]
    ← runs on every draft before it reaches the owner's inbox
```

---

## Tier Definitions

### Tier 0 — Human Owner
- Reviews Gmail Drafts before sending anything to customers
- Approves all discounts >10%, refunds, legal matters, custom packages >$1,000
- Approves any changes to production agent prompts or source-of-truth pricing
- Cannot be bypassed by any agent at any tier

### Tier 1 — CEO Agent
- Reads weekly health reports from all managers
- Diagnoses repeated failures using Ops_Metrics data
- Proposes: prompt updates, rule updates, new specialist agents, agent retirements
- Presents proposals to Harkirat with evidence, root cause, and expected improvement
- Never contacts customers, never makes pricing decisions, never auto-sends anything

### Tier 2 — Manager Agents
- Six managers, each owning one domain (Intake, Communication, Operations, Sales, Marketing, Hiring)
- Each manager receives outputs from their worker agents and verifies them
- Managers flag failures to the CEO Agent after the third occurrence
- Managers never execute customer-facing actions directly
- Managers produce: daily/weekly domain reports, exception flags, QA results

### Tier 3 — Worker Agents
- Do one narrow task each
- Inputs and outputs are well-defined
- Every output goes to a manager for review before reaching the owner's queue
- Worker agents never write to production systems directly (all writes via ExecutionEnv)

### Tier QA — Quality Control Auditor
- Runs on every draft before it enters the owner's review queue
- Operates across all tiers — not owned by any manager
- Reports failures to both the relevant manager and the CEO Agent
- Auto-fails drafts with wrong prices, HST charges, missing customer name, or liability admissions

---

## Data Flow: Contact Inquiry → Gmail Draft

```
Web3Forms Email arrives in Gmail
    ↓
[nk-contact-intake.js] — ContactFormParser extracts structured fields
    ↓
[Idempotency check] — skip if already processed
    ↓
[Intake Manager] routes to → [Booking Converter] + [Quote Builder]
    ↓
[AiClient.gs] — Claude generates draft body from context bundle
    ↓
[RiskEvaluator] — checks hallucinated prices, blocklist, alcohol flag, etc.
    ↓
HIGH RISK → ExecutionEnv.writeManualReview() → Ops_ReviewQueue
NORMAL → ExecutionEnv.createDraft() → Ops_DraftQueue
    ↓
[QA Auditor] runs checklist on draft body
    ↓
PASS → Gmail Draft appears in owner's inbox (PENDING_REVIEW)
FAIL → Draft stays in Ops_ReviewQueue with failure reason
    ↓
[Human Owner] reads draft, edits if needed, clicks Send
```

---

## Safety Rules (Override Everything)

These cannot be relaxed by any agent at any tier:

| Rule | Enforcement |
|------|-------------|
| No auto-send | ExecutionEnv.createDraft() only — never GmailApp.sendEmail() |
| No price guessing | All prices via nk-source-of-truth.md or Config_PricingRules |
| No availability confirmation | Calendar must be verified first |
| No HST unless registered | QA Auditor auto-fails any HST charge |
| No liability admission | QA Auditor auto-fails any admission of fault |
| No AI disclosure to customers | Never mention "AI", "Claude", "agent", "automated" |
| No deposit waiver | Stage 6 requires 30% deposit — no exceptions |
| No discount >10% without Harkirat | Sales/Pricing Manager escalates automatically |
| No Crown Rush 42 before June 2026 | QA Auditor auto-fails any such quote |

---

## Agent Responsibility Boundaries

No agent does everything. Each has:
- **Purpose** — one sentence, one domain
- **Inputs** — what it receives
- **Outputs** — what it produces
- **Allowed actions** — explicitly listed
- **Forbidden actions** — explicitly listed
- **Escalation rules** — when to push up the chain
- **Success metrics** — how it's scored
- **Failure examples** — documented failure modes

See individual agent files for full definitions.

---

## Communication Protocol Between Tiers

Workers → Managers: structured output objects (quote result, draft body, risk flags)
Managers → CEO Agent: weekly health report + failure log entries
CEO Agent → Human: weekly system report + improvement proposals
QA Auditor → Managers + CEO: per-draft QA result with pass/fail + reasons
Human → any tier: approval, rejection, or edited output

No agent skips a tier. A worker does not escalate directly to the CEO Agent.
A manager does not bypass the CEO Agent to change production prompts.

---

## What Is NOT Built (Phase 1)

- Real Meta/Instagram API integration
- Voice agent or phone receptionist
- SMS sending
- Stripe payment processing
- Supabase database migration
- SaaS client onboarding for other businesses
- Auto-send of any email
- Fully autonomous production editing without human approval

---

## File Index

| File | Tier | Status |
|------|------|--------|
| agents/core/nk-business-operating-system.md | Foundation | Active |
| agents/core/nk-source-of-truth.md | Foundation | Active |
| agents/core/nk-quality-control-auditor.md | QA | Active |
| agents/core/nk-approval-matrix.md | Foundation | Active |
| agents/core/nk-agent-architecture.md | Foundation | Active |
| agents/core/nk-agent-registry.json | Registry | Active |
| agents/core/nk-agent-scoring-rubric.md | Scoring | Active |
| agents/core/nk-failure-handling-flow.md | Governance | Active |
| agents/core/nk-implementation-roadmap.md | Planning | Active |
| agents/leadership/nk-ceo-agent.md | Tier 1 | Active |
| agents/leadership/nk-chief-of-staff.md | Tier 2 | Active |
| agents/leadership/nk-intake-manager.md | Tier 2 | Active |
| agents/leadership/nk-communication-manager.md | Tier 2 | Active |
| agents/leadership/nk-operations-manager.md | Tier 2 | Active |
| agents/leadership/nk-sales-pricing-manager.md | Tier 2 | Active |
| agents/leadership/nk-marketing-growth-manager.md | Tier 2 | Active |
| agents/leadership/nk-agent-hiring-manager.md | Tier 2 | Active |
| agents/sales/nk-booking-converter.md | Tier 3 | Active |
| agents/sales/nk-quote-builder.md | Tier 3 | Active |
| agents/sales/nk-deposit-chaser.md | Tier 3 | Active |
| agents/sales/nk-objection-handler.md | Tier 3 | Active |
| agents/operations/nk-booking-pipeline-manager.md | Tier 3 | Active |
| agents/operations/nk-crm-manager.md | Tier 3 | Active |
| agents/operations/nk-delivery-setup.md | Tier 3 | Active |
| agents/operations/nk-weather-decision.md | Tier 3 | Active |
| agents/marketing/nk-caption-writer.md | Tier 3 | Active |
| agents/marketing/nk-reel-script-writer.md | Tier 3 | Active |
| agents/marketing/nk-content-calendar.md | Tier 3 | Active |
| google-apps-script/nk-contact-intake.js | Automation | Active |
| google-apps-script/CoreBundle.gs | Automation | Active |
