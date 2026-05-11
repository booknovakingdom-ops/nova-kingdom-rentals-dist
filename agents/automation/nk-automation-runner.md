# Nova Kingdom Automation Runner

## Role
This is the master agent that runs on a loop. Every time it is invoked, it executes all automated tasks for Nova Kingdom Rentals in the correct order: email triage, DM monitoring, then social media. It is designed to be triggered by the `/loop` command on a regular interval.

## How to Start the Automation Loop
```
/loop 20m
> Run the Nova Kingdom automation runner: load agents/automation/nk-automation-runner.md and execute all steps.
```

This will run every 20 minutes. To stop it, press Ctrl+C in the Claude Code terminal.

---

## Agents Loaded Every Run

Always load these before any step:
1. `agents/core/nk-source-of-truth.md` — all pricing, products, policies, blocklist
2. `agents/core/nk-business-operating-system.md` — master rules all agents operate inside

These are the truth source. Never quote a price or confirm a policy without checking them first.

---

## Execution Order (Every Run)

### STEP 1 — Email Monitoring (Every Run)
Load and execute `agents/email/nk-email-monitoring-agent.md` in full.

**Agents used by this step (loaded automatically by the email agent):**
| Email Intent | Agent Loaded |
|---|---|
| Booking inquiry | `agents/sales/nk-booking-converter.md` + `agents/sales/nk-quote-builder.md` |
| Price question | `agents/core/nk-source-of-truth.md` + `agents/sales/nk-package-recommender.md` |
| Deposit / payment | `agents/sales/nk-deposit-chaser.md` |
| Complaint | `agents/customer-service/nk-complaint-handler.md` |
| Follow-up inquiry | `agents/sales/nk-cold-lead-reviver.md` |
| Post-event | `agents/customer-service/nk-post-event-followup.md` |
| School / org | `agents/sales/nk-school-community-events.md` |
| Partnership / vendor | `agents/sales/nk-partnership-referral.md` |
| Unknown | Draft holding reply, flag for Harkirat |
| Spam | Skip — no draft |

This will:
- `list_drafts(pageSize=50)` first → store subjects to prevent duplicates
- Scan Gmail: `search_threads(query="is:unread in:inbox", pageSize=20)` (no label filter — deduplication handled by draft-subject check)
- Classify each email using `agents/email/nk-email-classifier.md`
- Draft a reply using the matched agent above
- Output a summary table of all emails handled

If inbox is clear: log "📭 Email: inbox clear" and proceed to Step 2.

---

### STEP 2 — Social Media: Post Today's Scheduled Content
Load `agents/marketing/nk-social-media-automation.md` and run **Protocol 2 — Daily Post Publishing**.

**Agents used:** `agents/marketing/nk-caption-writer.md` · `agents/core/nk-source-of-truth.md`

This will:
- Query Google Sheets `NK Content Queue` for today's `Ready` posts
- Publish to Instagram and/or Facebook via Zapier
- Update each row's status to `Posted`

If no posts are scheduled today: log "📅 Social: no posts scheduled for today." and proceed.

---

### STEP 3 — Weekly Content Generation (Mondays Only)
Check today's day of week.
- If today is **Monday**: load `agents/marketing/nk-social-media-automation.md` and run **Protocol 1 — Weekly Content Generation**
- Any other day: skip this step entirely

**Agents used:** `agents/marketing/nk-caption-writer.md` · `agents/marketing/nk-content-calendar.md` · `agents/core/nk-source-of-truth.md`

This will:
- Generate Mon/Wed/Fri/Sun captions for the current week using the monthly theme
- Apply Crown Rush 42 launch sequence override if in May/June 2026
- Add them as `Draft` rows in Google Sheets for Harkirat to review

If this week's content already exists in the queue: log "📝 Content: this week already generated." and skip.

---

### STEP 4 — DM Monitoring: Instagram & Facebook Messenger (Every Run)
Load and execute `agents/social/nk-dm-monitoring-agent.md` in full.

This will:
- Fetch recent Instagram DM conversations via Instagram for Business API
- Fetch recent Facebook Messenger conversations via Facebook Pages API
- Identify new/unread messages not yet logged
- Classify each DM (booking inquiry, price question, complaint, etc.)
- Log each DM + AI-suggested reply to Google Sheets `NK DM Inbox` tab
- Flag urgent messages (complaints, confirmed payments) in the run summary

If no new DMs: log "💬 DMs: no new messages." and proceed.

---

### STEP 5 — Deposit Chaser (Every Run)
Load `agents/sales/nk-deposit-chaser.md`.

**Search 1 — Customer deposit messages:**
Search Gmail: `("deposit" OR "e-transfer" OR "etransfer" OR "sent payment") is:unread`

For each match:
- Load the FULL thread with `get_thread(FULL_CONTENT)` — read all prior messages to understand the booking context
- If deposit confirmed sent → draft acknowledgement + confirmed booking summary + next steps (invoice, rental agreement, waiver)
- If asking how to pay → draft payment instructions (e-transfer to booknovakingdom@gmail.com, no fee; card +5%)
- Always reply with `replyToMessageId` = latest message ID in the thread
- Apply same duplicate-draft check used in Step 1

**Search 2 — Interac auto-deposit notifications:**
Search Gmail: `from:notify@payments.interac.ca OR from:catch@payments.interac.ca is:unread`

For each Interac notification:
- Extract: amount received, sender name (payer)
- Match the payer name to an open booking thread in the inbox
- If match found: draft a deposit confirmation reply on that booking thread
- If no match found: flag in ACTION REQUIRED — "Interac deposit received from [name] — no matching booking thread found"

If no deposit threads found: log "💳 Deposits: no new payment messages." and proceed.

---

### STEP 6 — Run Summary
After all steps complete, output a single clean summary:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 NK AUTOMATION RUN — [date] [time]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📧 EMAIL
  • Processed: [N] threads
  • Drafts created: [N]
  • Skipped (spam/blocked): [N]

💬 DMs
  • Instagram new: [N]
  • Messenger new: [N]
  • Logged to NK DM Inbox: [N]

💳 DEPOSITS
  • New payment messages: [N]
  • Deposit drafts created: [N]

📱 SOCIAL MEDIA
  • Posted today: [N] ([platforms])
  • Stories (manual required): [N]
  • Failed: [N]

📝 CONTENT GENERATION
  • Status: [Generated N posts / Already done / Skipped (not Monday)]

⚠️  ACTION REQUIRED
  [List any flagged items needing Harkirat's attention]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Error Handling

| Error | Action |
|-------|--------|
| Gmail not accessible | Log "⚠️ Gmail unavailable — skipping email step" |
| Google Sheets not accessible | Log "⚠️ Sheets unavailable — skipping social steps" |
| Instagram post fails | Mark row `Failed` in Sheets, note error, continue |
| Facebook post fails | Mark row `Failed` in Sheets, note error, continue |
| Email draft creation fails | Log email to summary under "ACTION REQUIRED" |

Never stop the entire run because one step fails. Always complete all steps.

---

## Prerequisites Checklist
Before the automation loop will work, these accounts must be authenticated in Zapier MCP:

- [ ] **Instagram for Business** — connect @novakingdomrentals account
- [ ] **Facebook Pages** — connect Nova Kingdom Rentals Facebook Page
- [ ] **Google Sheets** — connect Google account (booknovakingdom@gmail.com)
- [ ] **Gmail** — already connected ✅
- [ ] **Google Sheets**: Create spreadsheet named `NK Content Queue` with worksheet `Queue` and headers in row 1: `post_date | day_of_week | platform | post_type | theme | caption | media_url | status | posted_at | notes`
- [ ] **Google Sheets**: In `NK Content Queue` spreadsheet, add a worksheet tab named `DM Inbox` with headers in row 1: `received_at | platform | sender_name | sender_id | message_text | thread_id | intent | suggested_reply | status | notes`

To authenticate, run `list_enabled_zapier_actions` and follow any `auth_url` links shown for unconnected apps.

---

## Recommended Run Intervals

| Use Case | Command |
|----------|---------|
| Full automation (email + social + DMs) | `/loop 20m` → run automation runner |
| Email only (lighter) | `/loop 20m` → run email monitoring agent |
| Social posting only | `/loop 1h` → run social media automation Protocol 2 |
| Weekly content generation | Manual trigger every Monday morning |
