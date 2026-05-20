# Nova Kingdom Rentals — Quote Intake Automation (Google Apps Script)

Processes Web3Forms quote-request emails from the website cart, writes submissions
to a dedicated **"Website Quote Leads"** inbound tab, queues a review task in the
shared Automation Queue, creates a Gmail draft, and blocks a tentative Calendar
hold — **fully automated, never auto-sends, never confirms a booking without a
deposit**.

---

## How It Works

| Trigger | Every 5 minutes |
|---------|----------------|
| Searches Gmail for | Unread emails with subject: *"New Nova Kingdom Rentals Quote Request"* |
| Writes to | **Website Quote Leads** tab — inbound intake (upsert by email + event date) |
| Writes to | **Automation Queue** tab — Task Type: New Quote Review |
| Creates | Gmail **draft** to the customer — Harkirat reviews and sends manually |
| Creates | **Tentative** Google Calendar hold (never confirmed, never blocks other bookings) |
| Labels email | `NK/Intake-Processed` and marks it read |

> **Tab routing:** The existing **"Leads"** tab is the outbound cold-lead CRM (Lead ID,
> Business Name, Campaign, etc.). This script never touches it. Website quote submissions
> go to **"Website Quote Leads"**, which is auto-created on first run if absent.

---

## Important: Two Scripts, Two Separate Projects

The Gmail inbox may already have an older **general inbox triage** automation —
a bound Apps Script on the CRM sheet that uses OpenAI to classify all incoming
emails. This script is **not** that automation.

**Do not paste this script into the existing bound Apps Script project.**
Do not replace the existing script. Do not merge them.

Deploy this as a completely **separate standalone Apps Script project** using
the steps below. The two automations can coexist safely:

- The old script processes general inquiry emails (Facebook leads, phone follow-ups, etc.)
- This script processes *only* Web3Forms quote-request emails with exact subject match
- This script labels every email it handles `NK/Intake-Processed`
- The old script (once its OpenAI bug is fixed — see the last section) should skip
  emails carrying that label

---

## Pre-Flight: Pause the Old Automation First

Before deploying this script, pause the old bound automation to prevent any race
condition during testing.

1. Open the **"AI Lead Engine CRM — Nova Kingdom Rentals"** Google Sheet.
2. Click **Extensions → Apps Script**.
3. In the left sidebar, click the **clock icon (Triggers)**.
4. Find any trigger running on a 5-minute interval (likely `processInbox` or similar).
5. Click the three-dot menu → **Delete** (or disable it).
   - Do **not** delete the script code itself — just the trigger.
6. Close the old Apps Script editor tab.

The old script's code is preserved. You will re-enable it later (see the last
section) after its OpenAI JSON bug is fixed.

---

## Deployment: New Standalone Project

### Step 1 — Create a Standalone Apps Script Project

Do **not** open this from the CRM sheet. Go directly to:

> **script.google.com** → click **New Project**

Name it: `NK Quote Intake`

This creates a standalone (unbound) project. It finds the CRM sheet at runtime
by searching Drive for the sheet's name — no binding needed.

### Step 2 — Paste the Script

1. Delete the default `function myFunction() {}` placeholder.
2. Copy the full contents of `nk-quote-intake.js` (in this same folder).
3. Paste it into the editor (replace everything).
4. Click **Save** (disk icon or `Ctrl+S`).

### Step 3 — Authorize Scopes

1. Select `verifyIntakeSystem` from the function dropdown at the top.
2. Click **Run**.
3. Click **Review permissions** when prompted.
4. Sign in with `booknovakingdom@gmail.com`.
5. Click **Advanced → Go to NK Quote Intake (unsafe)** — normal for personal scripts.
6. Click **Allow**.

Required scopes (all requested automatically):
- Gmail — read threads, apply labels, create drafts
- Google Sheets — read and write CRM spreadsheet
- Google Calendar — create tentative events
- Google Drive — locate the CRM spreadsheet by name

### Step 3b — Run verifyIntakeSystem() First

After authorizing scopes, run `verifyIntakeSystem()` **before** `testQuoteIntake()`.
This function checks everything is wired up correctly and prints results to the
Execution Log. All lines should show ✓.

| Check | What it verifies |
|-------|-----------------|
| CRM spreadsheet | Can be found by name in Drive |
| Website Quote Leads tab | Exists (or will be auto-created on first run — non-fatal) |
| Automation Queue tab | Exists and has required column names in row 1 |
| System tab | Exists and counter cell B2 is readable |
| Gmail label | `NK/Intake-Processed` label exists |
| Old Leads tab | Confirms it's the outbound CRM — script will NOT write there |
| Extra ID tabs | `Booked Customers`, `Payment Tracker` exist (non-fatal) |

If any check shows ✗, resolve the issue before proceeding. Common fixes are in
the [Troubleshooting](#troubleshooting) section below.

### Step 4 — Verify Tab Routing and Column Alignment

**Two separate tabs — understand the difference:**

| Tab | Purpose | Who writes to it |
|-----|---------|-----------------|
| **Leads** | Outbound cold-lead CRM (school boards, festivals, etc.) | Harkirat / outbound agents only |
| **Website Quote Leads** | Inbound website quote submissions | This script only |
| **Automation Queue** | Shared task queue for all follow-up tasks | This script + other automations |

The script never writes to the old "Leads" tab. If `verifyIntakeSystem()` reports it
can't find "Website Quote Leads", that is expected — the tab is created automatically
on first run.

**Website Quote Leads tab — auto-created headers (row 1):**
```
Booking ID | Submitted At | Customer Name | Email | Phone | Event Date | Start Time |
End Time | Event Address | City | Province | Postal Code | Setup Surface | Power Distance |
Water Access | Guests | Selected Items | Subtotal | Delivery Estimate | Sandbag Estimate |
Attendant Estimate | Estimated Total | Deposit Required | Manual Review Flags | Notes |
Source Message ID | Status
```

**Automation Queue tab — actual live headers (row 1, verified 2026-05-20):**
```
Task ID | Related ID | Customer / Business | Task Type | Due Date | Due Time |
Channel | Action Needed | Status | Priority | To Email | Notes |
Scheduled Rule | Completed Date | Due Now | Created At
```

The script maps by header name. If the Automation Queue tab gains extra columns,
they receive blank values and do not cause errors. `QUEUE_COLUMNS_` in the script
lists the columns the script writes to — keep this list in sync with the actual
tab if column names ever change.

**Booking ID sequence — persistent counter + fallback:**

The script uses a three-source sequence strategy so the counter survives test
cleanups, deleted rows, and CRM resets:

1. **System tab counter** (`System!B2`) — written immediately every time a
   booking ID is generated. This is the primary source of truth.
2. **Tab scanner** — reads all NK-YYYY-### IDs from Website Quote Leads,
   Automation Queue, Booked Customers, and Payment Tracker as a secondary check.
3. **Fallback constant** (`NEXT_BOOKING_NUMBER_FALLBACK: 16`) — used only if
   both of the above return 0 (first-ever run).

The next number is `max(counter, scanner, fallback) + 1`. Once the System tab
holds a value, the fallback has no effect.

**System tab** already exists in the CRM (`System!B2 = NK-2026:015` as of
2026-05-20). Do not manually edit B2 unless you need to deliberately advance
or reset the counter.

If your booked-customers or payment tabs have different names, update
`CONFIG.EXTRA_ID_TABS`. Missing tabs are silently skipped.

### Step 5 — Run testQuoteIntake() and Verify

With `testQuoteIntake` selected in the dropdown, click **Run**.

Check all four outputs:

| Output | What to look for |
|--------|-----------------|
| **Website Quote Leads tab** | New row with Booking ID (e.g. `NK-2026-016`), Customer Name *Sarah MacLean*, Event Date *June 28, 2026*, Estimated Total `662.5`, Status *New — Pending Review* |
| **Automation Queue tab** | New row, Task ID `AQ-NK-2026-016`, Related ID `NK-2026-016`, Customer / Business *Sarah MacLean*, Task Type *New Quote Review*, Status *Pending Review*, Priority *High*, To Email *sarah.test@example.com* |
| **Gmail → Drafts** | Email to `sarah.test@example.com`, subject `Nova Kingdom Rentals Quote — NK-2026-NNN`, body with itemized estimate, ends with `Nova Kingdom Rentals` and `https://novakingdomrentals.com` |
| **Google Calendar** | Tentative event on June 28, 2026 titled `🎪 TENTATIVE — NK-2026-NNN — Sarah MacLean` |

If any output is missing or wrong, check the Execution Log and the Troubleshooting
section. Do not install the trigger (Step 6) until all four pass.

**After the test — clean up test data before going live:**

1. **Website Quote Leads tab**: delete the Sarah MacLean row
2. **Automation Queue tab**: delete the `AQ-NK-2026-NNN` test task row
3. **Gmail Drafts**: delete the draft to `sarah.test@example.com`
4. **Google Calendar**: delete the tentative `🎪 TENTATIVE — NK-2026-NNN — Sarah MacLean` event

The System tab counter (`System!B2`) is NOT rolled back — this is correct; the
booking ID is permanently consumed even for test rows.

### Step 6 — Install the Trigger

Only after testQuoteIntake() passes all checks:

1. Select `setupTriggers` from the function dropdown.
2. Click **Run**.

This installs a 5-minute time-based trigger in **this new project only**. It has
no effect on the old bound script's triggers.

Verify: click the clock icon (Triggers) — should show `processNewQuoteEmails`
running every 5 minutes.

### Step 7 — Test With a Real Submission

1. Submit a quote through `novakingdomrentals.com` (or have someone test it).
2. Wait up to 5 minutes, or run `processNewQuoteEmails()` manually from the editor.
3. Verify the same four outputs as Step 5.
4. In Gmail, confirm the email is labelled `NK/Intake-Processed` and marked read.

---

## Customization

### Change the Trigger Interval

Edit `CONFIG.TRIGGER_MINUTES` at the top of the script (default: `5`), then
re-run `setupTriggers()` — it removes and re-installs the trigger cleanly.

### Use a Dedicated Calendar

Set `CONFIG.CALENDAR_ID` to the calendar's ID. Find it in Google Calendar →
Settings → click the calendar name → scroll to **Calendar ID**.

### Change the Deposit Rate

Edit `CONFIG.DEPOSIT_RATE` (default: `0.30` = 30%).

---

## Column Reference

### Website Quote Leads Tab (Inbound Intake)

This tab is **separate** from the outbound "Leads" tab. It captures every website
quote submission as a distinct inbound record.

| Column | Source |
|--------|--------|
| Booking ID | Auto-generated (`NK-YYYY-NNN`) |
| Submitted At | Email received date |
| Customer Name | `name` field from Web3Forms |
| Email | `email` |
| Phone | `phone` |
| Event Date | `eventDate` |
| Start Time / End Time | `startTime`, `endTime` |
| Event Address | `eventAddress` |
| City / Province / Postal Code | `city`, `province`, `postalCode` |
| Setup Surface | `setupSurface` |
| Power Distance | `powerDistanceToOutlet` |
| Water Access | `waterAccess` |
| Guests | `guests` |
| Selected Items | `selectedItems` |
| Subtotal | `subtotal` (numeric) |
| Delivery / Sandbag / Attendant Estimate | From Web3Forms calculator fields |
| Estimated Total | `estimatedTotal` (numeric) |
| Deposit Required | 30% of Estimated Total |
| Manual Review Flags | Auto-populated: "Anchoring review needed", "Power outlet review needed", "Delivery address review needed" |
| Notes | Customer freetext notes |
| Source Message ID | Gmail message ID — links record to the original email |
| Status | `New — Pending Review` |

Rows are matched by **email + event date** to prevent duplicates on re-submission.

### Automation Queue Tab (Shared — Existing)

The script appends to the existing Automation Queue using its live column names.

| Column written | Value |
|----------------|-------|
| Task ID | `AQ-NK-YYYY-NNN` |
| Related ID | Booking ID (e.g. `NK-2026-016`) |
| Customer / Business | Customer name from Web3Forms |
| Task Type | `New Quote Review` |
| Due Date | Today |
| Due Time | `9:00 AM` |
| Channel | `Gmail Draft` |
| Action Needed | "Review website quote submission. Confirm anchoring / power / delivery if flagged. Send deposit link once confirmed." |
| Status | `Pending Review` |
| Priority | `High` |
| To Email | Customer email address |
| Notes | Manual-review flags (anchoring, power, delivery, attendants) |
| Created At | Today |

---

## Draft Email Rules

- Subject: `Nova Kingdom Rentals Quote — NK-YYYY-NNN`
- Addressed to the customer's email
- Full quote body includes: itemized estimate (rentals, delivery, anchoring,
  attendants, total), manual-review flags, deposit amount, business phone
- If key info is missing (no event date, no address, no items): a short
  "we need a few more details" draft is created instead of the full quote
- **Never calls `GmailApp.sendEmail()`** — draft only, always

---

## Calendar Hold Rules

- Created only when `eventDate` is present
- Title: `🎪 TENTATIVE — NK-YYYY-NNN — Customer Name`
- Status: **Tentative** — does not block availability or prevent other bookings
- Description includes all booking details and a clear "not confirmed, no deposit
  received" notice
- Duration: `startTime` to `endTime` if provided; otherwise a 4-hour block

---

## Security Notes

- Runs under the `booknovakingdom@gmail.com` Google account — no external API keys
- No customer data leaves Google's infrastructure
- Gmail drafts are visible only to the Gmail account holder
- Web3Forms API key lives in the Web3Forms dashboard, not in this script

---

---

## Troubleshooting

All sheet writes now produce detailed output in the **Execution Log**
(Apps Script editor → Executions, or the log panel after a manual run).
Each email processed ends with a ── Run summary ── block. Check this first.

### Row not appearing in Website Quote Leads tab

**Most likely cause: the tab didn't exist and auto-creation failed** (permission
issue or sheet quota), or a column header mismatch if you manually edited row 1.

1. Check the Execution Log for "ERROR writing to Website Quote Leads" or
   "ERROR creating ... tab" messages.
2. Run `verifyIntakeSystem()` — it confirms whether the tab exists and lists any
   missing required headers.
3. If the tab exists but fields are blank: the script maps by header name. Any header
   in row 1 that doesn't exactly match `WEB_QUOTE_COLUMNS_` in the script will receive
   a blank value. Compare your row 1 against the list in Step 4 and fix mismatches
   in either the sheet or the `WEB_QUOTE_COLUMNS_` constant in the script.
4. Check the **Error Log** tab — a "column mismatch" error will name which column
   (`Email`, `Event Date`, or `Booking ID`) returned index -1.

**Important:** Do not confuse this tab with the old "Leads" tab. If you see rows
in "Leads" but not in "Website Quote Leads", the script was incorrectly pointed at
the old tab. `CONFIG.WEB_QUOTE_TAB` must equal `"Website Quote Leads"` exactly.

### Duplicate booking IDs

**This should not happen** with the System tab counter in place. If it does:

1. Check `System!B2` — it should hold a value like `NK-2026:016`. If it is blank,
   the counter was never written. Re-run `verifyIntakeSystem()` to diagnose.
2. If two runs executed simultaneously (unlikely with a 5-minute trigger), both may
   have read the same counter before either wrote back. The System tab write happens
   immediately after reading — if you see duplicates in the logs, check whether two
   trigger instances overlapped.
3. To manually advance the counter: set `System!B2` to `NK-2026:NNN` where NNN is
   the number you want the *next* booking to receive minus 1.

### Automation Queue row missing or has blank fields

If the Website Quote Leads row was written but the Queue row is absent:

1. Check the Execution Log for "ERROR writing to Automation Queue".
2. Check the Error Log tab for a "Queue write failed" entry.
3. Common cause: Automation Queue tab was renamed. `CONFIG.QUEUE_TAB` must equal
   the tab's exact name — update the constant and re-run `setupTriggers()`.

If the row exists but key fields are blank (e.g., `To Email`, `Customer / Business`,
`Action Needed`): the actual Automation Queue column name differs from what's in
`QUEUE_COLUMNS_`. Run `verifyIntakeSystem()` — it prints each required queue column
name and its column number. Fix any ✗ by updating `QUEUE_COLUMNS_` to match the
live tab header exactly.

### Gmail draft not created

1. Check the Execution Log for "ERROR creating draft".
2. Most common cause: `data.email` was blank — the draft is created with an empty
   To: field and Gmail may reject it. Verify the Web3Forms email contains an `Email:`
   field in the body.
3. Check that the account has Gmail draft creation permission (authorized in Step 3).

### Calendar hold missing

1. Check the Execution Log for "ERROR creating calendar hold" or "could not parse
   start/end times".
2. If `eventDate` was blank in the submission, the calendar step is skipped by design.
3. If `CONFIG.CALENDAR_ID` is set to a specific calendar ID, confirm that calendar
   is accessible to the `booknovakingdom@gmail.com` account.

### Viewing the Error Log tab

After any live run, check the **Error Log** tab in the CRM sheet. Each row contains:

| Column | Content |
|--------|---------|
| Timestamp | When the error occurred |
| Booking ID | If one was generated before the failure |
| Customer | Parsed name (if available) |
| Email | Parsed email (if available) |
| Event Date | Parsed event date (if available) |
| Error | Full error message |

The Error Log tab is created automatically on first error. It is never written to
on a clean run — if it stays empty, the system is working correctly.

---

## Later: Re-Enabling the Old General Inbox Automation

The old bound Apps Script (on the CRM sheet) processes all types of incoming
Gmail inquiries using OpenAI. It was broken around early May 2026 due to an
OpenAI API change that returns empty responses when `response_format` is not
explicitly set.

### Fix the OpenAI JSON Parsing Bug

Open the old Apps Script (CRM sheet → Extensions → Apps Script) and make two
changes:

**1. Add `response_format` to the OpenAI API fetch call:**

Find the `fetch` call to the OpenAI API (likely in a function called
`classifyEmail_` or `callOpenAI_` or similar). Add this to the request body:

```javascript
response_format: { type: "json_object" }
```

Example — change:
```javascript
const payload = {
  model: "gpt-4o",
  messages: [{ role: "user", content: prompt }],
};
```
To:
```javascript
const payload = {
  model: "gpt-4o",
  messages: [{ role: "user", content: prompt }],
  response_format: { type: "json_object" },
};
```

**2. Add a try/catch with regex fallback to `parseDecisionJson_()`:**

```javascript
function parseDecisionJson_(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    // Fallback: extract first {...} block if OpenAI wraps JSON in prose
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch (_) {}
    }
    return null;
  }
}
```

### Make the Old Script Skip NK/Intake-Processed Emails

So the two automations don't both draft replies to the same Web3Forms email, add
this label check to the old script's Gmail search query.

Find the line in the old script that builds the Gmail search query (usually in
`processInbox` or `checkGmail` or similar). Add `-label:NK/Intake-Processed` to
exclude emails already handled by this script:

```javascript
// Before:
const query = "is:unread in:inbox";

// After:
const query = "is:unread in:inbox -label:NK/Intake-Processed";
```

### Re-Enable the Old Trigger

After both fixes are tested:

1. Open the old Apps Script.
2. Click the clock icon (Triggers).
3. Click **+ Add Trigger**.
4. Select function: `processInbox` (or whatever the main function is called).
5. Set time-based, every 5 minutes.
6. Save.

The two automations now run independently and handle different email types
without stepping on each other.
