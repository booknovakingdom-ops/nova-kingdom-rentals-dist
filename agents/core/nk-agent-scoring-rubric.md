# NKR Agent Scoring Rubric

**Version:** 1.0 | **Updated:** May 2026

---

## Purpose

Score every agent on nine dimensions so performance is measurable, comparable,
and improvable. Scores are updated monthly by the responsible manager agent
and stored in nk-agent-registry.json.

Scores are not vanity. They trigger the failure handling flow when they drop.
They justify retirement recommendations. They guide prompt improvement priorities.

---

## Scoring Dimensions

### 1. Accuracy (1–10, higher is better)
Does the agent produce outputs that are factually correct?

| Score | Description |
|-------|-------------|
| 9–10 | Outputs are correct in >95% of cases, verified against source-of-truth |
| 7–8  | Correct in 85–95% of cases; minor errors caught by QA |
| 5–6  | Correct in 70–84% of cases; QA catches multiple errors per week |
| 3–4  | Correct in 50–69%; significant manual correction required |
| 1–2  | Correct in <50%; outputs cannot be trusted without full human rewrite |

**How to measure:** Count QA-verified correct outputs ÷ total outputs per week.

---

### 2. Hallucination Risk (1–10, lower is better)
Does the agent invent facts, prices, or claims not in its inputs?

| Score | Description |
|-------|-------------|
| 1–2  | Hallucination never detected; all figures traceable to source |
| 3–4  | Occasional hallucination caught by QA; no customer impact |
| 5–6  | Hallucination in 5–10% of outputs; QA catches most |
| 7–8  | Hallucination in >10% of outputs; some reach manager review |
| 9–10 | Hallucination frequent; outputs cannot be used without full verification |

**Auto-trigger:** Score ≥7 for 4 consecutive weeks → retirement recommendation.

---

### 3. Human Edit Rate (%, lower is better)
What % of outputs does Harkirat edit before using or sending?

| Score | Description |
|-------|-------------|
| <10% | Owner uses output largely as-is |
| 10–20% | Minor tone/wording adjustments common |
| 20–35% | Substantial edits required regularly |
| 35–50% | Owner rewrites more than half the content |
| >50%  | Agent output is a rough draft at best |

**How to measure:** Harkirat tracks edits per week (or estimates from feedback).
**Auto-trigger:** >50% for 4 consecutive weeks → retirement review.

---

### 4. Missed-Field Rate (%, lower is better)
What % of outputs are missing required fields?

Required fields vary by agent type. Examples:
- Quote: missing travel fee, deposit amount, or next step = missed field
- Draft: missing customer name = missed field
- Pipeline report: missing overdue flag = missed field

| Score | Description |
|-------|-------------|
| 0%    | All required fields present in every output |
| 1–5%  | Occasional field missing, caught by QA |
| 5–15% | Consistent missing fields; QA flags regularly |
| >15%  | Systemic — the agent does not know its required output format |

---

### 5. Wrong-Price Risk (1–10, lower is better)
What is the risk that this agent quotes or mentions a wrong price?

| Score | Description |
|-------|-------------|
| 1–2  | Agent does not produce prices, or always verifies against source-of-truth |
| 3–4  | Wrong price detected rarely (<1/month); always caught by QA |
| 5–6  | Wrong price detected 1–3×/month |
| 7–8  | Wrong price detected >3×/month; some reaching owner inbox |
| 9–10 | Wrong price systemic; not safe to use for any customer-facing output |

**Auto-trigger:** Score ≥7 for 2 consecutive weeks → immediate CEO Agent flag.

---

### 6. Safety Risk (1–10, lower is better)
Could this agent's outputs cause safety, legal, or insurance harm?

| Score | Description |
|-------|-------------|
| 1–2  | Agent handles no safety-sensitive content; or safety rules always followed |
| 3–4  | Occasional safety rule violation caught by QA before reaching customer |
| 5–6  | Safety violation reaches owner inbox; caught at review stage |
| 7–8  | Safety violation reaches customer (e.g. wrong wind limit quoted) |
| 9–10 | Agent produces outputs that could directly cause harm or legal liability |

**Auto-trigger:** Score ≥5 for any consecutive week → immediate escalation.

---

### 7. Customer-Confusion Risk (1–10, lower is better)
Do customers become confused, ask for clarification, or complain about this agent's outputs?

| Score | Description |
|-------|-------------|
| 1–2  | Customer responses clear and actionable; no confusion reported |
| 3–4  | Rare customer question about something covered in the draft |
| 5–6  | Multiple customers per month ask for clarification on the same thing |
| 7–8  | Confusion causing booking delays or lost leads |
| 9–10 | Outputs are consistently unclear or misleading |

**How to measure:** Track customer replies that are questions about something already stated.

---

### 8. Speed (1–10, higher is better)
Is the agent fast enough for its task's SLA?

| Score | Description |
|-------|-------------|
| 9–10 | Consistently meets or beats SLA |
| 7–8  | Usually meets SLA; occasional delay |
| 5–6  | Meets SLA 70% of the time |
| 3–4  | Frequently misses SLA; backlog builds |
| 1–2  | Too slow to be operationally useful |

SLAs by agent type:
- Intake routing: <2 minutes
- Quote draft: <5 minutes of having complete info
- Pipeline report: <10 minutes when triggered
- Content review: <24 hours

---

### 9. Business Impact (1–10, higher is better)
How much does this agent's performance affect revenue, reputation, or operations?

| Score | Description |
|-------|-------------|
| 9–10 | Agent directly affects booking conversion or prevents significant harm |
| 7–8  | Agent affects customer experience significantly |
| 5–6  | Agent supports operations but errors don't directly lose bookings |
| 3–4  | Agent's output is mainly internal; low customer impact |
| 1–2  | Agent is nice-to-have; business would not suffer much if it failed |

This score is used to prioritize which agents to fix first when resources are limited.

---

## Composite Score Calculation

```
Composite = (
  Accuracy × 1.5
  + (10 - Hallucination Risk) × 1.5
  + (10 - Human Edit Rate ÷ 5) × 1.0   ← normalized: 100% edit = 0 pts
  + (10 - Missed Field Rate × 10) × 1.0 ← normalized: 10% = 0 pts
  + (10 - Wrong Price Risk) × 2.0
  + (10 - Safety Risk) × 2.0
  + (10 - Customer Confusion Risk) × 1.0
  + Speed × 0.5
  + Business Impact × 1.0
) ÷ 11.5
```

Composite ranges:
- 8.0–10.0 → Excellent
- 6.5–7.9  → Acceptable
- 5.0–6.4  → Watch (flag to CEO Agent)
- <5.0     → Critical (retirement review triggered)

---

## Scoring Update Protocol

1. Manager Agent records raw metrics weekly (from Ops_Metrics, QA logs, Harkirat feedback)
2. Manager calculates scores monthly and submits to Agent Hiring Manager
3. Agent Hiring Manager updates nk-agent-registry.json (proposed update)
4. CEO Agent reviews scores in weekly report
5. Any score triggering an auto-trigger is flagged immediately, not waiting for monthly cycle

---

## Score Freeze Rule

An agent's score cannot be updated to show improvement unless:
- The root cause of the previous failure has been documented
- A fix has been implemented (prompt update, rule change, or new specialist)
- At least 3 weeks of post-fix data supports the improvement

Scores cannot be reset by declaring "fresh start" without evidence.
