---
name: nk-external-benchmark-notes
description: Patterns adapted from public agent/orchestration systems and converted into Nova Kingdom Rentals rules.
category: system
role_level: benchmark
---

# External Benchmark Notes

## Patterns Adopted

### 1. Specialized agents need isolated responsibility
Adopted rule: every employee agent must have one clear job, inputs, outputs, and handoff rule. Managers coordinate multi-step work.

### 2. Orchestration is a control layer, not just more agents
Adopted rule: CEO orchestrator routes work, preserves context, enforces policy, manages conflict, and requires human approval for high-risk actions.

### 3. Permission hygiene matters
Adopted rule: agents should only use the tools/data they need. Gmail/CRM/website actions are draft/review-first unless owner explicitly approves.

### 4. Quality gates before output
Adopted rule: quote, website, customer-message, booking, safety, document, and automation gates must pass before final output.

### 5. Progressive disclosure
Adopted rule: source of truth and manager files are loaded first; employee agents are only pulled in when needed. This reduces noise.

### 6. Deliverable-focused prompts
Adopted rule: every agent must produce a usable business artifact: quote, checklist, message, dashboard, plan, dispatch sheet, risk flag, or QA report.

### 7. Feedback loops
Adopted rule: repeated mistakes become rules, tests, and manager corrections inside `nk-feedback-loop.md` and `nk-agent-test-cases.md`.

## Patterns Rejected

### Too many novelty agents
Rejected because Nova Kingdom needs bookings, safety, trust, margin, and operations first.

### Forced criticism
Rejected because auditors should verify facts and real risks, not invent problems to sound useful.

### Fully autonomous sending
Rejected because customer emails/messages, pricing changes, refunds, and legal/safety decisions need owner review.

### Generic agency language
Rejected because Nova Kingdom is an event rental business. All prompts must be rental-specific.
