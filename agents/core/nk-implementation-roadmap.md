# NKR Agent Operating System — Implementation Roadmap

**Version:** 1.0 | **Updated:** May 2026

---

## What This Is

A phased plan for making the NKR Agent OS reliable, auditable, and owner-controlled.
Phase 1 is active right now. Later phases are planned but not committed.
Nothing in a later phase gets built before Phase 1 is stable and tested.

---

## Phase 1 — Foundation (Current)

**Goal:** Every inquiry gets a Gmail Draft. Every draft is QA-checked.
The owner reviews and sends — nothing is automatic.

### What's Included

**Architecture and Governance:**
- [x] Agent architecture document (nk-agent-architecture.md)
- [x] CEO Agent (nk-ceo-agent.md)
- [x] QA Auditor (nk-quality-control-auditor.md) — enhanced
- [x] Agent scoring rubric (nk-agent-scoring-rubric.md)
- [x] Failure handling flow (nk-failure-handling-flow.md)
- [x] Agent registry (nk-agent-registry.json)

**Manager Agents:**
- [x] Intake Manager (nk-intake-manager.md)
- [x] Communication Manager (nk-communication-manager.md)
- [x] Operations Manager (nk-operations-manager.md)
- [x] Sales/Pricing Manager (nk-sales-pricing-manager.md)
- [x] Marketing/Growth Manager (nk-marketing-growth-manager.md)
- [x] Agent Hiring Manager (nk-agent-hiring-manager.md)
- [x] Chief of Staff (nk-chief-of-staff.md) — updated

**Automation (Google Apps Script):**
- [x] CoreBundle.gs — simulation mode, idempotency, risk evaluation, metrics
- [x] nk-contact-intake.js — processes Web3Forms emails → Gmail Drafts
- [x] ReviewQueue (Ops_ReviewQueue) — flags that need human review
- [x] DraftQueue (Ops_DraftQueue) — tracks all drafts
- [x] MetricsLogger (Ops_Metrics) — all events logged

### What Phase 1 Does NOT Include

- Real Meta/Instagram API (no social DM processing yet)
- Voice agent or phone receptionist
- SMS sending
- Stripe payment processing
- Supabase database migration
- SaaS client onboarding
- Auto-send of any message
- Fully autonomous operation without Harkirat review

---

## Phase 1 Validation Steps

Before declaring Phase 1 stable, verify:

**Google Apps Script:**
- [ ] TestHarness.testAll() passes with zero failures
- [ ] 5+ simulation runs reviewed in Sim_Actions and Sim_Drafts
- [ ] Ops_ReviewQueue entries appear correctly for flagged inquiries
- [ ] Ops_Metrics events logged for: INQUIRY_RECEIVED, QUOTE_BUILT, DRAFT_CREATED
- [ ] Idempotency confirmed: processing same email twice does not create duplicate draft
- [ ] simulation_mode = true verified in Config_OpsControls before any live test

**Agent Prompts:**
- [ ] CEO Agent produces a valid weekly report when given a sample health report
- [ ] Intake Manager correctly routes 5 different inquiry types (standard, school, complaint, blocklist, missing-field)
- [ ] Communication Manager correctly fails a draft with wrong price
- [ ] Communication Manager correctly fails a draft with HST charged
- [ ] Sales/Pricing Manager correctly flags a quote with wrong travel fee
- [ ] QA Auditor correctly auto-fails a draft with "Crown Rush 42" before June 2026

**Live Testing (after simulation passes):**
- [ ] Set simulation_mode = false in Config_OpsControls
- [ ] Process one real test inquiry (use a test email address)
- [ ] Confirm Gmail Draft appears in booknovakingdom@gmail.com inbox
- [ ] Confirm draft has correct price, name, deposit, and next step
- [ ] Confirm Ops_Metrics logged the event
- [ ] Confirm ReviewQueue entry created if any field was missing

---

## Phase 2 — Stability and Coverage (Next)

**Trigger:** Phase 1 has been stable for 4+ weeks. Human edit rate <25%.
All agent scores have at least 4 weeks of data.

**Goals:**
- Deposit chaser automation (automated follow-up at Stage 5)
- Post-event follow-up automation (review request after event)
- Content calendar workflow (weekly content planning)
- Competitor intelligence monitoring
- Annual planner integration
- Monthly business intelligence report

**Not included in Phase 2:**
- Social platform APIs
- Payment processing
- Database migration

---

## Phase 3 — Growth Tools (Future)

**Trigger:** Phase 2 stable. Business has 20+ completed bookings. Owner wants more automation.

**Potential additions (all require separate approval):**
- School/org outreach sequences
- Cold lead revival automation
- Upsell recommendations in booking flow
- Loyalty program tracking
- Seasonal pricing automation

**Each Phase 3 item requires:**
- Business case with revenue estimate
- Safety review
- Simulation validation
- Harkirat approval

---

## What We Will Never Build (Without Explicit Harkirat Approval)

These are ruled out indefinitely unless Harkirat explicitly decides otherwise:

- Auto-send of any customer email (zero exceptions)
- Price changes without owner review and source-of-truth update
- Production deployment without simulation validation
- Any agent that bypasses the QA Auditor
- SaaS multi-tenant deployment
- Public-facing AI agent that customers interact with directly

---

## Decision Log

| Date | Decision | Reason |
|------|----------|--------|
| May 2026 | Auto-send permanently off | Owner control is non-negotiable for a real business |
| May 2026 | Meta API deferred to Phase 3+ | Focus on email intake first; DMs are manual for now |
| May 2026 | Supabase migration deferred | Google Sheets sufficient for current scale |
| May 2026 | Voice agent not planned | Phone is currently answered by Harkirat directly |

---

## How to Promote a Phase 2+ Feature to Active Development

1. Agent Hiring Manager identifies the feature as filling a confirmed gap
2. CEO Agent includes it in an improvement proposal
3. Harkirat approves the proposal
4. Feature is implemented in simulation mode
5. TestHarness coverage added
6. 5+ simulation runs reviewed
7. Harkirat approves promotion to live
8. Feature monitored for 2 weeks
9. Agent registry updated with new agent entry and initial scores
