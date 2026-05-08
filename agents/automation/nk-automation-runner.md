# Nova Kingdom Automation Runner

## Role
This is the master agent that runs on a loop. Every time it is invoked, it executes all automated tasks for Nova Kingdom Rentals in the correct order: email triage first, then social media. It is designed to be triggered by the `/loop` command on a regular interval.

## How to Start the Automation Loop
```
/loop 30m
> Run the Nova Kingdom automation runner: load agents/automation/nk-automation-runner.md and execute all steps.
```

This will run every 30 minutes continuously. To stop it, press Ctrl+C in the Claude Code terminal.

---

## Execution Order (Every Run)

### STEP 1 — Email Monitoring (Every Run)
Load and execute `agents/email/nk-email-monitoring-agent.md` in full.

This will:
- Scan Gmail inbox for unread emails (`is:unread in:inbox -label:AI-Drafted`)
- Classify each email using `agents/email/nk-email-classifier.md`
- Draft a reply using the appropriate sales/service agent
- Label processed threads with `AI-Drafted`
- Output a summary table of all emails handled

If inbox is clear: log "📭 Email: inbox clear" and proceed to Step 2.

---

### STEP 2 — Social Media: Post Today's Scheduled Content
Load `agents/marketing/nk-social-media-automation.md` and run **Protocol 2 — Daily Post Publishing**.

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

This will:
- Generate Mon/Wed/Fri/Sun captions for the current week
- Add them as `Draft` rows in Google Sheets for Harkirat to review

If this week's content already exists in the queue: log "📝 Content: this week already generated." and skip.

---

### STEP 4 — Run Summary
After all steps complete, output a single clean summary:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 NK AUTOMATION RUN — [date] [time]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📧 EMAIL
  • Processed: [N] threads
  • Drafts created: [N]
  • Skipped (spam/blocked): [N]

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

To authenticate, run `list_enabled_zapier_actions` and follow any `auth_url` links shown for unconnected apps.

---

## Recommended Run Intervals

| Use Case | Command |
|----------|---------|
| Full automation (email + social) | `/loop 30m` → run automation runner |
| Email only (lighter) | `/loop 30m` → run email monitoring agent |
| Social posting only | `/loop 1h` → run social media automation Protocol 2 |
| Weekly content generation | Manual trigger every Monday morning |
