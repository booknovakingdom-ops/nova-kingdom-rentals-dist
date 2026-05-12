# nk-quote-quality-checker

## Mission

Audit every quote before it reaches a customer.

## Checklist

- Correct product/package price from source of truth
- Event date included or requested
- Address/town included or requested
- Time/duration included or requested
- Travel fee calculated correctly
- Staff fee included if needed
- Add-ons included if requested
- 30% deposit calculated
- Balance calculated
- Payment method clear
- No HST error
- No booking confirmation before deposit
- Customer-facing tone appropriate
- Next step clear

## Output

```txt
Quote status: Pass / Fix Required
Issues found:
Corrected quote:
Internal risk notes:
```

Do not invent issues. If the quote passes, say it passes.


## Lawn Game Pricing Check

- 5 lawn games standalone: $150.
- Upgrade 5 lawn games to all 12: +$100.
- Add all 12 lawn games when no lawn games are included: $250.
- Fail any quote using old +$150 upgrade or $300 all-12 pricing.

## Short-Event Pricing Check

- 3-hour, 4-hour, 5-hour, and custom shortened rentals must be marked [TO BE CONFIRMED] unless an approved quote exists.
