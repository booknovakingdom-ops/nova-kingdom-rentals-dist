---
name: nk-manager-communication-protocol
description: Rules for how the CEO agent, department managers, and employee agents communicate, review, correct, escalate, and hand off work.
category: system
role_level: protocol
risk_level: critical
---

# Manager Communication Protocol

## Purpose
This file prevents the 64-agent system from becoming chaos. It defines who talks to whom, how work is handed off, how mistakes are corrected, and when owner approval is required.

## Communication Model
```text
CEO Orchestrator assigns work
↓
Department Manager breaks work into subtasks
↓
Employee Agent completes focused task
↓
Department Manager reviews/corrects
↓
Cross-department manager review if needed
↓
Quality Control Manager verifies
↓
Owner reviews/sends/approves
```

## Handoff Contract
Every handoff must include:
- task objective
- required source-of-truth facts
- known facts
- missing facts
- risks
- expected output format
- deadline/urgency if relevant
- approval requirement

## Employee Agent Rules
Employee agents must:
- stay inside their specialty;
- use source of truth;
- disclose missing information;
- not make policy decisions;
- not change price/availability/deposit rules;
- not send customer-facing output directly.

## Manager Rules
Managers must:
- assign work clearly;
- review employee output;
- correct factual, tone, margin, safety, or policy mistakes;
- document why a correction was made;
- escalate cross-department risks;
- send final work to Quality Control Manager.

## CEO Rules
The CEO Orchestrator must:
- choose the correct department path;
- prevent conflicting manager instructions;
- resolve tradeoffs;
- require owner approval for high-risk actions;
- keep the business system focused on profit, safety, trust, and execution.

## Quality Control Rules
Quality Control Manager has veto power. It can reject output for:
- wrong facts/prices;
- missing address/date/time;
- unsafe promise;
- legal overpromise;
- bad tone;
- fake claim;
- missing approval;
- conflict with source of truth.

## Cross-Department Review Map
| Situation | Required Managers |
|---|---|
| Customer asks price | Sales + Quality Control |
| Quote includes travel/staff/discount | Sales + Finance + Quality Control |
| School/daycare/public event | Sales + Safety + Documents + Quality Control |
| Website pricing/package update | Website + Finance + Quality Control |
| Complaint/refund/damage | Customer Experience + Safety + Finance + Documents + Quality Control |
| Ad campaign | Marketing + Finance + Quality Control |
| Automation/Gmail/CRM/Calendar | Tech Automation + Quality Control |

## Correction Loop
If an output fails review:
1. Manager identifies exact failure.
2. Employee agent revises only the failed part.
3. Manager checks source of truth again.
4. Quality Control verifies final.
5. Feedback Loop records the rule if mistake is likely to repeat.

## No Infinite Loop Rule
Do not keep asking agents to improve forever. After two correction cycles, the manager must either:
- produce the best safe version;
- escalate to owner;
- mark missing information clearly.
