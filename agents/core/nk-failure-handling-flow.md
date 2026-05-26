# NKR Agent Failure Handling Flow

**Version:** 1.0 | **Updated:** May 2026

---

## Purpose

When an agent produces a bad output, that failure is tracked, categorized, and
escalated if it recurs. The goal is to fix the system, not just catch the error.
Owner control is preserved at every stage — no automatic production changes.

---

## Failure Types

| ID | Failure Type | Examples |
|----|-------------|---------|
| F-01 | Wrong price | Travel fee miscalculated, wrong unit price, deposit at 25% not 30% |
| F-02 | Hallucinated fact | Price not in source-of-truth, invented service, non-existent package |
| F-03 | Missing required field | No customer name, no next step, no deposit amount in quote |
| F-04 | Wrong routing | Complaint routed to Quote Builder, school inquiry to Booking Converter |
| F-05 | Safety violation | Wind limit misstated, alcohol approval not flagged, wrong shutdown rule |
| F-06 | Tone failure | Too formal, robotic, missing warmth, sounds like a form letter |
| F-07 | Brand violation | "NK", "cheap", "bouncy castle" used; wrong unit name format |
| F-08 | Policy violation | HST charged, Crown Rush 42 before June 2026, auto-send attempted |
| F-09 | Duplicate processing | Same inquiry processed twice, duplicate draft created |
| F-10 | Dropped inquiry | Inquiry received but no draft, no review entry, no metric logged |
| F-11 | Availability confirmed without check | Calendar not verified before confirming date |
| F-12 | Unauthorized disclosure | AI/Claude mentioned to customer, liability admitted |

---

## Three-Strike Rule

One failure = fix and log.
Two failures of same type from same agent = escalate to manager.
Three failures of same type from same agent = manager flags to CEO Agent.

### Strike 1 — Worker Agent Fails

Detected by: QA Auditor, Communication Manager, or Harkirat during review.

Actions:
1. Flag failure in Ops_Metrics (event_type: QA_FAIL or QA_AUTOFAIL)
2. Route draft to ReviewQueue with failure reason
3. Responsible Manager logs in agent's failure_log (nk-agent-registry.json)
4. Manager notes: date, failure type (F-01 through F-12), brief description

Nothing automatic happens to the agent. Normal operation continues.

---

### Strike 2 — Same Failure Recurs

Detected by: Manager reviewing weekly failure log.

Actions:
1. Manager adds second entry to agent's failure_log
2. Manager includes "Strike 2" status
3. Manager includes a preliminary root cause hypothesis
4. Manager runs a manual review of the agent's last 10 outputs to confirm pattern
5. Manager reports Strike 2 in weekly report to CEO Agent

CEO Agent acknowledges in next weekly report. No production change yet.

---

### Strike 3 — Pattern Confirmed

Detected by: Manager submitting third failure log entry.

Actions:
1. Manager submits Strike 3 entry with full failure log to CEO Agent
2. CEO Agent triggers diagnosis within 5 business days
3. CEO Agent produces an Improvement Proposal (see nk-ceo-agent.md format)
4. CEO Agent proposes one of:

   **Option A — Prompt Update**
   When: The agent is doing the right task but the instructions are ambiguous.
   Fix: CEO Agent writes redlined prompt update, attaches to proposal.
   Risk: Prompt changes can have unintended side effects — test in simulation first.

   **Option B — Rule Update**
   When: A pricing, policy, or routing rule is missing or ambiguous.
   Fix: Proposed update to nk-source-of-truth.md or Config_PricingRules.
   Risk: Rule changes affect all agents that read from source-of-truth.

   **Option C — New Specialist Agent**
   When: The failure reveals a task that no current agent handles well.
   Fix: Agent Hiring Manager writes new agent proposal.
   Risk: Adds system complexity — justify with clear business case.

   **Option D — Retire/Replace Agent**
   When: The agent's fundamental approach is wrong and a prompt fix won't help.
   Fix: Agent Hiring Manager proposes retirement + replacement plan.
   Risk: Transition period — replacement must be validated before retirement.

5. CEO Agent presents proposal to Harkirat as Gmail Draft for approval
6. **No production change until Harkirat approves**

---

## Implementation Gate

After Harkirat approves:
1. Implement fix in simulation mode first
2. Run TestHarness.testAll() — all tests must pass
3. Run minimum 5 simulation rounds through Sim_Drafts and Sim_Actions
4. CEO Agent reviews simulation output and confirms fix addresses the failure
5. CEO Agent presents simulation results to Harkirat
6. Harkirat approves promotion to live mode
7. Monitor for 2 weeks post-promotion — if same failure recurs, restart from Strike 1

---

## Strike Clock Reset Rules

A failure's strike count resets to 0 when:
- A fix has been approved and implemented
- The fix has been validated in simulation
- 30 days pass with no recurrence of the same failure type from the same agent

A failure's strike count does NOT reset when:
- The owner simply edits the draft manually and moves on
- A different agent produces the same failure type
- The failure is swept under a "one-off" label without documentation

---

## Failure Log Entry Format (in nk-agent-registry.json)

```json
{
  "date": "2026-05-26",
  "failure_type": "F-01",
  "description": "Travel fee calculated from business address instead of customer address. Customer was 32km away, fee calculated as 17km.",
  "detected_by": "Communication Manager",
  "impact": "Draft reached QA with wrong total — auto-fail caught it",
  "strike_number": 1,
  "status": "open",
  "proposal_id": null
}
```

---

## Auto-Fail Fast Path

Some failures skip the three-strike tracker and trigger immediate escalation:

| Failure | Immediate Action |
|---------|-----------------|
| Safety violation reaching a customer (F-05) | CEO Agent + Harkirat notified same day |
| AI disclosed to customer (F-12) | CEO Agent + Harkirat notified same day |
| Liability admitted to customer (F-12) | CEO Agent + Harkirat + Insurance notified |
| Duplicate booking created (F-09) | Operations Manager + Harkirat notified same day |
| Dropped inquiry confirmed (F-10) | CEO Agent + Harkirat notified, customer contacted manually |
| Wrong price reaches customer (F-01 post-send) | CEO Agent + Harkirat, correct immediately |

---

## Governance Principle

The system is only as trustworthy as its failure tracking.
An unlogged failure is a silent failure — it will recur.
Every QA fail, every Harkirat edit, every customer confusion report is a data point.
Log it. Track it. Fix it.

Harkirat does not need to read the failure log daily.
He needs to know about it when it's about to affect a customer.
The three-strike system is what makes that work.
