# Nova Kingdom Rentals — Quote Intake Automation (Google Apps Script)

Processes Web3Forms quote-request emails from the website cart, writes leads to
the Google Sheet CRM, queues a review task, creates a Gmail draft, and blocks a
tentative Calendar hold — **fully automated, never auto-sends, never confirms a
booking without a deposit**.

---

## How It Works

| Trigger | Every 5 minutes |
|---------|----------------|
| Searches Gmail for | Unread emails with subject: *"New Nova Kingdom Rentals Quote Request"* |
| Writes to | **Leads** tab (upsert by email + event date) |
| Writes to | **Automation Queue** tab (Task Type: New Quote Review) |
| Creates | Gmail **draft** to the customer — Harkirat reviews and sends manually |
| Creates | **Tentative** Google Calendar hold (never confirmed, never blocks other bookings) |
| Labels email | `NK/Intake-Processed` and marks it read |

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

1. Select `testQuoteIntake` from the function dropdown at the top.
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

### Step 4 — Verify Column Alignment and Booking ID Tabs

Before running any test, open the CRM sheet and check these two tabs:

**Leads tab — expected headers (row 1):**
```
Booking ID | Customer | Phone | Email | Address | Event Date | Event Time |
Rental Item | Quote Total | Deposit Required | Deposit Received | Balance |
Payment Method | Status | Next Action | Next Action Date | Agreement Sent |
Waiver Signed | Insurance Requested | Staff Needed | Lead Source | Notes
```

**Automation Queue tab — expected headers (row 1):**
```
Task ID | Booking ID | Task Type | Status | Priority | Channel | Action |
Customer | Email | Phone | Event Date | Quote Total | Notes | Created |
Assigned To | Completed
```

If row 1 of either tab is blank, the script will write these headers automatically
on first run. If headers already exist but differ (different column names or order),
the script maps by header name — any column name it doesn't recognise will receive
a blank value. Adjust the column names in the sheet or in `LEADS_COLUMNS_` /
`QUEUE_COLUMNS_` at the bottom of the script to match before proceeding.

**Booking ID sequence — verify fallback and tab names:**

The script scans four tabs (`Leads`, `Automation Queue`, `Booked Customers`,
`Payment Tracker`) for the highest existing `NK-YYYY-NNN` before assigning the
next ID.

If your existing bookings use a **different format** (e.g. `B001`, `B002`) the
scanner will find no matches and fall back to `CONFIG.NEXT_BOOKING_NUMBER_FALLBACK`.
This is set to `14` by default — meaning the first new booking ID will be
`NK-2026-014`. Adjust this number before going live if your sequence is already
past 14.

The fallback only applies when the scanner finds zero NK-format IDs. Once real
`NK-2026-NNN` IDs exist in the sheet, the scanner takes over automatically and
the fallback has no effect.

If your sheet uses different tab names for booked customers or payments, update
`CONFIG.EXTRA_ID_TABS`. Tabs that don't exist are silently skipped.

### Step 5 — Run testQuoteIntake() and Verify

With `testQuoteIntake` selected in the dropdown, click **Run**.

Check all four outputs:

| Output | What to look for |
|--------|-----------------|
| **Leads tab** | New row, Booking ID continues from your highest existing ID (e.g. if NK-2026-013 exists, new row gets NK-2026-014), customer *Sarah MacLean*, event date *June 28, 2026*, quote total `$662.50` |
| **Automation Queue tab** | New row, Task Type *New Quote Review*, Status *Pending Review*, Priority *High*, Assigned To *Harkirat* |
| **Gmail → Drafts** | Email to `sarah.test@example.com`, subject `Nova Kingdom Rentals Quote — NK-2026-NNN`, clean body with no DRAFT warning, ends with `Nova Kingdom Rentals` and `https://novakingdomrentals.com` |
| **Google Calendar** | Tentative event on June 28, 2026 titled `🎪 TENTATIVE — NK-2026-NNN — Sarah MacLean` |

If any output is missing or wrong, fix the issue (usually column alignment) before
installing the trigger. Do not proceed to Step 6 until all four pass.

**After the test — clean up test data before going live:**

1. **Leads tab**: delete the Sarah MacLean row
2. **Automation Queue tab**: delete the corresponding test task row
3. **Gmail Drafts**: delete the draft to `sarah.test@example.com`
4. **Google Calendar**: delete the tentative `🎪 TENTATIVE — NK-2026-NNN — Sarah MacLean` event

This prevents the test row from permanently occupying a booking ID slot and keeps the CRM clean for real bookings.

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

### Leads Tab

| Column | Source |
|--------|--------|
| Booking ID | Auto-generated (`NK-YYYY-NNN`) |
| Customer | `name` field from Web3Forms |
| Phone | `phone` |
| Email | `email` |
| Address | `eventAddress`, `city`, `province`, `postalCode` joined |
| Event Date | `eventDate` |
| Event Time | `startTime – endTime` |
| Rental Item | `selectedItems` |
| Quote Total | `estimatedTotal` (numeric) |
| Deposit Required | 30% of Quote Total |
| Status | `1 - New Lead` |
| Lead Source | `Website Quote Cart` |
| Notes | Surface, guests, water access, power/anchoring flags, delivery source |

Rows are matched by **email + event date** to prevent duplicates. Re-submissions
update non-empty fields in place without creating a second row.

### Automation Queue Tab

| Column | Value |
|--------|-------|
| Task Type | New Quote Review |
| Status | Pending Review |
| Priority | High |
| Channel | Email |
| Action | Create Gmail draft reply |
| Notes | Flags: anchoring review, power outlet review, delivery manual, attendants |

---

## Draft Email Rules

- Always starts **and** ends with `DRAFT — REVIEW BEFORE SENDING`
- Subject: `Re: Nova Kingdom Rentals Quote — NK-YYYY-NNN`
- Addressed to the customer's email
- Includes: full quote breakdown, manual-review flags, deposit amount,
  e-transfer address, phone number
- If key info is missing (no event date, no address, no items): sends a short
  "we need a few more details" draft instead
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
