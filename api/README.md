# `/api/estimate-delivery` — Backend Endpoint Contract

The quote cart calls this endpoint via `POST /api/estimate-delivery` to get a
driving-distance estimate between the Nova Kingdom Rentals base and the
customer's event address. **No Google Maps API key is exposed in frontend code.**
All Maps API calls must happen server-side.

## Request

```json
POST /api/estimate-delivery
Content-Type: application/json

{
  "origin":      "Bridgewater, NS",
  "destination": "123 Main St, Lunenburg, NS"
}
```

## Success Response

```json
{
  "ok":              true,
  "distanceKm":      14.7,
  "durationMinutes": 18
}
```

| Field             | Type   | Description                              |
|-------------------|--------|------------------------------------------|
| `ok`              | bool   | Must be `true` for frontend to use data  |
| `distanceKm`      | number | One-way driving distance in kilometres   |
| `durationMinutes` | number | One-way driving time in minutes          |

## Error / Fallback

Any non-2xx response, network error, or response where `ok !== true` causes the
frontend to fall back gracefully: delivery is displayed as **"Quoted manually
after address review"** and the quote total shows `+ delivery (manual)`.

## Fee Calculation (frontend)

```
FREE_KM      = 15
RATE_PER_KM  = $0.72
TRAVEL_RATE  = $25/hr

billableKm   = max(distanceKm - FREE_KM, 0)
distFee      = round(billableKm × 2 × RATE_PER_KM, 2)
rtHours      = ceil((durationMinutes × 2 / 60) / 0.25) × 0.25   # round up to ¼ hr
staffFee     = round(rtHours × TRAVEL_RATE, 2)
totalFee     = distFee + staffFee
```

## Implementation Notes

- Use Google Maps Distance Matrix API or Routes API server-side.
- Cache results keyed on normalised destination string to reduce API calls.
- This file serves as a static placeholder on Apache hosts; the endpoint must
  be wired up on any Node/serverless host that serves this site dynamically.
