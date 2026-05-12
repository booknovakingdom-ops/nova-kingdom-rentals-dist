# Nova Kingdom Rentals — Agent Test Cases

Use these examples to test whether agents are production-ready.

## Test 1 — Customer only asks price

Input: “How much for a bouncy castle?”

Expected behavior:

- Do not final quote.
- Ask for event date, address/town, time, and preferred unit/event type.
- Optionally provide starting price examples.

Fail if agent invents final total.

## Test 2 — Quote with delivery

Input: “Dino Combo on June 20, 42 km from Bridgewater, 1–4 pm.”

Expected behavior:

- Price: Crown Dino Combo $210 unless custom event duration/pricing applies.
- Travel: 42 km - 15 km free = 27 km x $0.72 = $19.44.
- Total before extras: $229.44.
- Deposit: 30% = $68.83.
- Balance: $160.61.

Fail if first 15 km free is ignored.

## Test 3 — Booking without deposit

Input: “Can you hold it? I’ll pay later.”

Expected behavior:

- Friendly but firm.
- Explain date is secured only after deposit.
- Offer to send payment details/invoice.

Fail if agent says confirmed.

## Test 4 — School invoice request

Input: “School needs a proper invoice with breakdown and payment by cheque.”

Expected behavior:

- Professional tone.
- Full breakdown.
- Deposit/payment terms.
- Ask for billing details if missing.
- Do not demand casual e-transfer only.

## Test 5 — Indoor gym setup

Input: “We want it inside a gym.”

Expected behavior:

- Mention sandbags required because stakes cannot be used indoors.
- Ask about ceiling height, access, space, power.

## Test 6 — Reference request

Input: “Can you provide references from past clients?”

Expected behavior:

- Honest launch-stage answer.
- Offer proof of insurance/registration, equipment photos, agreement, invoice, and safety process.
- Do not fake references.

## Test 7 — Weather issue

Input: “It might rain tomorrow. Can we cancel and get deposit back?”

Expected behavior:

- Reference policy carefully.
- Ask/confirm timing.
- Mention reschedule possibility if within policy.
- Escalate refund decisions.

## Test 8 — Discount pressure

Input: “Competitor is cheaper. Can you beat them?”

Expected behavior:

- Do not race to bottom.
- Explain value: setup/takedown, clean equipment, safety, local service.
- Offer value-add before discount.
- Owner approval if discount over 10%.

## Test 9 — Foam with inflatables

Input: “Can we use foam around the inflatables?”

Expected behavior:

- Flag slippery surface risk.
- Require owner/safety review.
- Do not casually approve.

## Test 10 — Website package card

Input: “Update Island Royale package.”

Expected behavior:

- Use source of truth: $649, regular $781, save $132, includes Crown Island Combo + Crown Kick Darts + Crown Axe Challenge + 5 Lawn Games.
- Mention all-12 lawn games upgrade logic.
- Run website quality gate.


## Merge-Final Test Cases

### Test: Lawn game standalone pricing
Input: “How much for 5 lawn games only?”
Expected: $150 standalone, subject to availability/address/delivery context.
Fail if: agent says ask only, $250, or $300.

### Test: Lawn game upgrade pricing
Input: “Package includes 5 lawn games. How much to upgrade to all 12?”
Expected: +$100.
Fail if: +$150.

### Test: All 12 lawn games with no included games
Input: “Add all 12 lawn games to my booking.”
Expected: $250 if no package games are included.
Fail if: $300.

### Test: Reference request
Input: “Can you provide references from past clients?”
Expected: Honest May 2026 launch wording, offer proof of insurance/registration, equipment photos, invoice/agreement, safety/setup process.
Fail if: vague “this season” only, fake references, or overclaiming history.

### Test: Review request
Input: Completed happy customer.
Expected: NPS/review sequence and Google Review link https://g.page/r/CZXOs7GUjxR5EBI/review.
Fail if: review link missing.

### Test: Short event quote
Input: “Can I book for 3 hours?”
Expected: mark short-event pricing [TO BE CONFIRMED] and route to owner approval if no approved quote exists.
Fail if: invented discount or fixed short-event price.
