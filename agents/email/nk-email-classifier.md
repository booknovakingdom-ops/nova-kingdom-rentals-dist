# Nova Kingdom Email Classifier

## Purpose
Classify incoming emails into one of the Intent Categories below. Used exclusively by `nk-email-monitoring-agent.md`.

---

## Intent Categories

| Intent | Code | Description |
|--------|------|-------------|
| Booking Inquiry | `BOOKING_INQUIRY` | Asks about availability, wants to book, asks about units |
| Price Question | `PRICE_QUESTION` | Asks about pricing/costs without committing to a date |
| Deposit or Payment | `DEPOSIT_OR_PAYMENT` | Confirms deposit sent, asks how to pay, receipt request |
| Complaint | `COMPLAINT` | Expresses dissatisfaction, equipment issue, damage dispute |
| Follow-Up Inquiry | `FOLLOW_UP_INQUIRY` | Following up on a previous quote or inquiry |
| Post-Event | `POST_EVENT` | Thank-you, feedback, issue after event has occurred |
| School or Org | `SCHOOL_OR_ORG` | From school, church, municipality, charity, community org |
| Partnership or Vendor | `PARTNERSHIP_OR_VENDOR` | B2B, referral offer, supplier pitch, collaboration |
| Spam or Irrelevant | `SPAM_OR_IRRELEVANT` | Newsletter, promo, automated system email, off-topic |
| Unknown | `UNKNOWN` | Cannot confidently assign any category above |

---

## Classification Rules

### Signal Words & Phrases
Use these as primary signals. Multiple signals = higher confidence.

**BOOKING_INQUIRY**
- "available", "book", "reserve", "rent", "rental", "bouncy castle", "inflatable", "castle"
- "June", "July", "August" or any specific date
- "my son's/daughter's birthday", "party", "event", "backyard"
- "how many kids", "ages", "setup", "delivery"

**PRICE_QUESTION**
- "how much", "what does it cost", "pricing", "rates", "price list", "what's the price"
- No mention of a specific date or explicit booking intent

**DEPOSIT_OR_PAYMENT**
- "sent the e-transfer", "payment sent", "deposit", "paid", "how do I pay", "payment method", "e-transfer", "credit card"

**COMPLAINT**
- "not happy", "disappointed", "problem", "issue", "broken", "didn't work", "late", "damage", "refund", "unfair", "unacceptable", "ruined", "terrible", "awful"

**FOLLOW_UP_INQUIRY**
- "following up", "checking in", "still available", "any update", "we spoke", "I emailed before", "re:" with a previous quote subject

**POST_EVENT**
- "thank you", "thanks so much", "loved it", "great time", "kids had a blast"
- Subject contains "Re:" and email date is after an event date mentioned in thread history
- "damage", "broke", "charged" when referring to an event that already happened

**SCHOOL_OR_ORG**
- Sender domain contains: `.edu`, `.ca` (government), `.org`, `.ns.ca`
- Email body mentions: "school", "church", "community", "municipality", "charity", "non-profit", "fundraiser", "board"
- Sender name includes titles: "Principal", "Pastor", "Coordinator", "Director"

**PARTNERSHIP_OR_VENDOR**
- "partnership", "collaborate", "referral", "supplier", "wholesale", "distributor", "commission", "affiliate", "business opportunity"

**SPAM_OR_IRRELEVANT**
- Automated sender (noreply@, donotreply@, notifications@, no-reply@)
- Newsletter/marketing content (unsubscribe link in body)
- Invoice from a known vendor (not a customer inquiry)
- Google Alerts, Meta Ads reports, platform notifications

---

## Confidence Scoring

**High confidence (act immediately):**
- 3+ matching signals from category
- Clear booking intent with date + unit mentioned

**Medium confidence (act with note):**
- 1–2 matching signals
- Include note in draft: "📋 Intent classified as [X] — verify before sending"

**Low confidence (flag as UNKNOWN):**
- Conflicting signals from multiple categories
- Very short or ambiguous email body (< 10 words)
- Foreign language (draft in same language if possible, or flag for manual review)

---

## Edge Cases

| Situation | Classification |
|-----------|---------------|
| Email has both pricing question AND booking date | `BOOKING_INQUIRY` — booking wins |
| Customer angry about pricing (not a complaint) | `PRICE_QUESTION` with empathetic tone |
| Thank-you email + asking to rebook | `POST_EVENT` — handle thank-you, then pivot to booking |
| School asking for pricing | `SCHOOL_OR_ORG` |
| Supplier/vendor sending an invoice | `SPAM_OR_IRRELEVANT` — skip |
| Media/press inquiry | `PARTNERSHIP_OR_VENDOR` — route for Harkirat review |
| Reply chain from a thread Harkirat already handled | Check if new question — re-classify based on new content only |

---

## Output Format
Return exactly:
```
INTENT: [CODE]
CONFIDENCE: [HIGH / MEDIUM / LOW]
KEY_SIGNALS: [comma-separated list of words/phrases that triggered classification]
EVENT_DATE: [YYYY-MM-DD or "not mentioned"]
SENDER_FIRST_NAME: [first name extracted from email or signature]
```
