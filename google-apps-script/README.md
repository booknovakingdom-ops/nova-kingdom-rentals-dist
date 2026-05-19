# Nova Kingdom Rentals — Quote Intake Automation (Google Apps Script)

Connects Web3Forms quote-request emails to the existing Google Sheet CRM,
creates Gmail drafts, and blocks tentative Calendar holds — **fully automated,
never auto-sends, never confirms a booking without a deposit**.

---

## What It Does

| Trigger | Every 5 minutes |
|---------|----------------|
| Searches Gmail for | Unread emails with subject: *"New Nova Kingdom Rentals Quote Request"* |
| Writes to | **Leads** tab (upsert by email + event date) |
| Writes to | **Automation Queue** tab (Task Type: New Quote Review) |
| Creates | Gmail **draft** to the customer — Harkirat reviews and sends manually |
| Creates | **Tentative** Google Calendar hold (never confirmed, never blocks other bookings) |
| Labels email | `NK/Intake-Processed` and marks it read |

---

## Prerequisites

- Google account that owns the Gmail inbox (`booknovakingdom@gmail.com`)
- Access to "AI Lead Engine CRM — Nova Kingdom Rentals" Google Sheet
- Google Apps Script bound to that Sheet

---

## Deployment

### Step 1 — Open Apps Script

1. Open the **"AI Lead Engine CRM — Nova Kingdom Rentals"** Google Sheet.
2. Click **Extensions → Apps Script**.
3. Delete any placeholder code in the editor.

### Step 2 — Paste the Script

1. Copy the full contents of `nk-quote-intake.js`.
2. Paste it into the Apps Script editor (replace everything).
3. Click **Save** (disk icon or `Ctrl+S`).

### Step 3 — Authorize Scopes

1. In the editor, select the function `setupTriggers` from the function dropdown.
2. Click **Run**.
3. Click **Review permissions** when prompted.
4. Sign in with `booknovakingdom@gmail.com`.
5. Click **Advanced → Go to [project name] (unsafe)** if needed (normal for personal scripts).
6. Click **Allow**.

Required scopes:
- Gmail (read, labels, create drafts)
- Google Sheets (read/write)
- Google Calendar (create events)
- Google Drive (find spreadsheet by name)

### Step 4 — Install the Trigger

Running `setupTriggers` (Step 3) also installs the time-based trigger automatically.

To verify: **Triggers** (clock icon in left sidebar) → should show
`processNewQuoteEmails` running every 5 minutes.

---

## Testing

### Run the Built-In Test Case

1. In the Apps Script editor, select `testQuoteIntake` from the dropdown.
2. Click **Run**.
3. Check:
   - **Leads tab**: new row with Booking ID `NK-YYYY-001`, name *Sarah MacLean*
   - **Automation Queue tab**: new row, Task Type *New Quote Review*, Status *Pending Review*
   - **Gmail → Drafts**: email to `sarah.test@example.com` starting with `DRAFT — REVIEW BEFORE SENDING`
   - **Google Calendar**: tentative event on June 28, 2026 titled `🎪 TENTATIVE — NK-YYYY-001 — Sarah MacLean`

### Test With a Real Submission

1. Submit a quote through the live cart at `novakingdomrentals.com`.
2. Wait up to 5 minutes for the trigger to fire, or run `processNewQuoteEmails()` manually from the editor.
3. Check Gmail, Leads tab, Queue tab, and Calendar.

---

## Column Expectations

### Leads Tab

| Column | Source |
|--------|--------|
| Booking ID | Auto-generated (NK-YYYY-NNN) |
| Customer | `name` field |
| Phone | `phone` field |
| Email | `email` field |
| Address | `eventAddress + city + province + postalCode` |
| Event Date | `eventDate` |
| Event Time | `startTime – endTime` |
| Rental Item | `selectedItems` |
| Quote Total | `estimatedTotal` |
| Deposit Required | 30% of Quote Total |
| Status | "1 - New Lead" (initial) |
| Lead Source | "Website Quote Cart" |
| Notes | Surface, guests, water, power flags, delivery source |

The script matches existing rows by **email + event date** to avoid duplicate leads.
Re-submissions update non-empty fields in place.

### Automation Queue Tab

| Column | Value |
|--------|-------|
| Task Type | New Quote Review |
| Status | Pending Review |
| Priority | High |
| Channel | Email |
| Action | Create Gmail draft reply |
| Notes | Flags: anchoring review, power review, delivery manual, attendants |

---

## Draft Email Rules

- Always starts with `DRAFT — REVIEW BEFORE SENDING`
- Always ends with `DRAFT — REVIEW BEFORE SENDING`
- Addressed to the customer's email with subject `Re: Nova Kingdom Rentals Quote — NK-YYYY-NNN`
- Includes: full quote breakdown, manual-review flags, deposit amount, e-transfer address, phone number
- If key info is missing (no event date, no address, no items selected): sends a short "we need a few more details" draft instead
- **Never calls `GmailApp.sendEmail()`** — draft only

---

## Calendar Hold Rules

- Created only when `eventDate` is present in the submission
- Title: `🎪 TENTATIVE — NK-YYYY-NNN — Customer Name`
- Status: **Tentative** (does not block availability)
- Description includes all booking details and a clear "not confirmed, no deposit received" notice
- Duration: `startTime` to `endTime` if provided; otherwise a 4-hour block

---

## Customization

### Change the Trigger Interval

Edit `CONFIG.TRIGGER_MINUTES` at the top of the script, then re-run `setupTriggers()`.

### Use a Dedicated Calendar

Set `CONFIG.CALENDAR_ID` to the calendar's ID (found in Google Calendar → Settings → calendar name → Calendar ID).

### Change Deposit Rate

Edit `CONFIG.DEPOSIT_RATE` (default: `0.30` = 30%).

---

## Security Notes

- Script runs under the `booknovakingdom@gmail.com` Google account — no external API keys
- No customer data is sent outside Google's infrastructure
- Gmail drafts are visible only to the Gmail account holder
- Web3Forms emails are read server-side; API key is already in the Web3Forms dashboard, not in this script
