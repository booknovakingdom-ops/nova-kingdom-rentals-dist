# `/api/estimate-delivery` — Delivery Estimate Endpoint

The quote cart calls `POST /api/estimate-delivery` to compute driving distance and
time from the Nova Kingdom Rentals base address to the customer's event location.
The Google Maps API key lives **only** in the Cloudflare Worker environment —
it is never committed to this repo or exposed in frontend JavaScript.

---

## Request

```http
POST /api/estimate-delivery
Content-Type: application/json

{
  "origin":      "598 Upper Branch Rd, Wileville, NS B4V 5M7, Canada",
  "destination": "123 Main St, Lunenburg, NS"
}
```

The `origin` field must match the hardcoded `EXPECTED_ORIGIN` constant inside the
Worker. Any mismatch returns HTTP 400, preventing the Worker from being used as a
general-purpose Maps proxy.

## Success Response

```json
{ "ok": true, "distanceKm": 24.7, "durationMinutes": 25 }
```

## Error / Fallback Response

```json
{ "ok": false }
```

Any non-2xx status, network error, shape mismatch, or `ok: false` causes the
frontend to fall back gracefully to **"Quoted manually after address review"**.
No crash, no broken UI.

---

## Fee Formulas (frontend, `quote-cart.mjs`)

```
FREE_KM       = 15
RATE_PER_KM   = $0.72
TRAVEL_RATE   = $25/hr

billableKm    = max(distanceKm − 15, 0)
distanceFee   = billableKm × 2 × $0.72            (round-trip km)
roundTripHr   = (durationMinutes × 2) / 60
billableHr    = ceil(roundTripHr / 0.25) × 0.25   (round up to ¼ hr)
staffFee      = billableHr × $25
deliveryTotal = distanceFee + staffFee
```

Sandbag anchoring (when applicable) is **added to the same combined display row**:

| Surface              | Sandbag fee          |
|----------------------|----------------------|
| Grass                | $0                   |
| Indoor gym           | $15 × inflatable units |
| Concrete or asphalt  | $15 × inflatable units |
| Artificial turf      | Manual review        |
| Gravel               | Manual review        |
| Other                | Manual review        |

Crown Rush 42 = 1 unit. Ultimate Kingdom = 6 units. Lawn games = 0 units.

---

## Implementation: Cloudflare Worker

The Worker lives in `cloudflare-worker/estimate-delivery.js`.
It calls the **Google Routes API** server-side (`routes.googleapis.com`)
and returns the `{ ok, distanceKm, durationMinutes }` shape above.

### Prerequisites

- Node.js ≥ 18
- A [Cloudflare account](https://dash.cloudflare.com) (free tier is sufficient)
- Google Cloud project with **Routes API** and **Geocoding API** enabled
- A Google Maps API key (restrict it to Routes API only in Cloud Console)

---

## Deployment: Step-by-Step

### Step 1 — Install Wrangler

```bash
cd cloudflare-worker
npm install
```

### Step 2 — Authenticate Wrangler

```bash
npx wrangler login
# Opens browser — log in with your Cloudflare account
```

### Step 3 — Store the API Key as a Secret

```bash
npx wrangler secret put GOOGLE_MAPS_API_KEY
# Paste your Google Maps API key when prompted
# It is encrypted in Cloudflare — never written to disk or git
```

OR set it via the Cloudflare Dashboard:
> Workers & Pages → estimate-delivery → Settings → Variables and Secrets
> → Add variable → Name: `GOOGLE_MAPS_API_KEY` → Encrypt → Save

### Step 4 — Deploy the Worker

```bash
npx wrangler deploy
```

Wrangler prints the deployment URL, e.g.:
```
https://estimate-delivery.<YOUR_ACCOUNT>.workers.dev
```

---

## Option A: Domain on Cloudflare (Recommended)

If `novakingdomrentals.com` is proxied through Cloudflare (orange cloud DNS),
the Worker can intercept `/api/estimate-delivery` transparently so the frontend's
relative URL `/api/estimate-delivery` works without changes.

1. In Cloudflare Dashboard → DNS: ensure the `@` (root) A record points to
   Hostinger's IP with the **orange cloud** (Proxied) toggled on.

2. Uncomment the `[[routes]]` block in `cloudflare-worker/wrangler.toml`:

   ```toml
   [[routes]]
   pattern  = "novakingdomrentals.com/api/estimate-delivery"
   zone_name = "novakingdomrentals.com"
   ```

3. Redeploy:

   ```bash
   npx wrangler deploy
   ```

4. Test from a browser or `curl`:

   ```bash
   curl -X POST https://novakingdomrentals.com/api/estimate-delivery \
     -H "Content-Type: application/json" \
     -d '{"origin":"598 Upper Branch Rd, Wileville, NS B4V 5M7, Canada","destination":"123 Main St, Lunenburg, NS"}'
   ```

   Expected: `{"ok":true,"distanceKm":24.7,"durationMinutes":25}` (approximate)

---

## Option B: Standalone workers.dev (No Cloudflare DNS)

If Hostinger is handling DNS and Cloudflare is not proxying the domain:

1. Deploy without `[[routes]]` (keep it commented):

   ```bash
   npx wrangler deploy
   # → https://estimate-delivery.<YOUR_ACCOUNT>.workers.dev
   ```

2. Update `DELIVERY_API_URL` in `assets/quote-cart.mjs`:

   ```js
   const DELIVERY_API_URL = "https://estimate-delivery.<YOUR_ACCOUNT>.workers.dev";
   ```

3. Bump the cache version in `index.html`, regenerate static routes, push.

4. CORS is already handled by the Worker for `novakingdomrentals.com`.

---

## Local Development

```bash
# Create local secrets file (never commit this)
echo "GOOGLE_MAPS_API_KEY=YOUR_KEY_HERE" > cloudflare-worker/.dev.vars

# Start local dev server (listens on http://localhost:8787)
cd cloudflare-worker
npx wrangler dev
```

Then temporarily point the frontend at `http://localhost:8787` or use the
Vite proxy (`vite.config.js`) to forward `/api/` to the local Worker.

---

## Tests

```bash
cd cloudflare-worker
node test.mjs
```

Runs 37 unit tests covering all fee calculations, duration parsing, sandbag
rules, input validation, and attendant costs without making any live API calls.

---

## Security Notes

- API key is stored as an encrypted Cloudflare secret — not in code or `wrangler.toml`
- Worker validates `origin` matches the hardcoded base address exactly
- CORS restricted to `novakingdomrentals.com` (+ localhost for dev)
- Worker validates destination is ≥ 5 characters
- No customer address data is logged or stored — only used for the Google API call
- Google API response is not cached (each quote request is live)
