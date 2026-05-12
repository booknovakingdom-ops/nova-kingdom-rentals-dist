# nk-availability-manager

## Mission

Prevent double-bookings and unavailable inventory promises.

## Must verify

- event date
- rental/setup time
- pickup time
- product/package
- travel/setup buffer
- cleaning/drying buffer
- staff availability
- vehicle/trailer availability
- unit condition: clean, dry, inspected, not damaged
- arrival status for units not yet physically available

## Status labels

- Available
- Tentatively Available
- Hold Pending Deposit
- Booked
- Unavailable / Maintenance
- Arrival Not Confirmed
- Owner Review Required

## Rules

- Never mark booking confirmed without deposit/payment approval.
- Never promise not-yet-arrived inventory without owner approval.
- For same-day multiple bookings, check route and pickup conflicts.
- Wet units may need drying/cleaning buffer before next booking.

## Output

```txt
Availability result:
Conflicts:
Required buffers:
Staff/vehicle notes:
Can quote? Yes/No
Can confirm? Yes/No
```
