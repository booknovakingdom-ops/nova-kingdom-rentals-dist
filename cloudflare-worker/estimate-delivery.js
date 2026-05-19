/**
 * Nova Kingdom Rentals — Delivery Estimate Worker
 *
 * Route: POST /api/estimate-delivery
 * Body:  { origin: string, destination: string }
 * Returns: { ok: true, distanceKm: number, durationMinutes: number }
 *          { ok: false } on any error (frontend falls back to manual quote)
 *
 * Required environment variable (set via `wrangler secret put` or Cloudflare dashboard):
 *   GOOGLE_MAPS_API_KEY — Google Cloud key with Routes API enabled
 *
 * NEVER commit the API key to source control or put it in wrangler.toml.
 */

const ALLOWED_ORIGIN  = "https://novakingdomrentals.com";
const ROUTES_API_URL  = "https://routes.googleapis.com/directions/v2:computeRoutes";
const EXPECTED_ORIGIN = "598 Upper Branch Rd, Wileville, NS B4V 5M7, Canada";
const GOOGLE_TIMEOUT  = 9000; // ms — slightly longer than frontend 8s so the error is descriptive

export default {
  async fetch(request, env) {
    const reqOrigin = request.headers.get("Origin") || "";
    const allowed   = reqOrigin === ALLOWED_ORIGIN ||
                      reqOrigin.endsWith(".novakingdomrentals.com") ||
                      reqOrigin.startsWith("http://localhost");

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(allowed) });
    }

    if (request.method !== "POST") {
      return jsonRes({ ok: false, error: "Method not allowed" }, 405, allowed);
    }

    // Parse body
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonRes({ ok: false, error: "Invalid JSON body" }, 400, allowed);
    }

    const { origin, destination } = body ?? {};

    // Validate destination
    if (typeof destination !== "string" || destination.trim().length < 5) {
      return jsonRes({ ok: false, error: "destination must be at least 5 characters" }, 400, allowed);
    }

    // Validate origin — must be our known base address.
    // This prevents the worker being used as a general-purpose Maps proxy.
    if (typeof origin !== "string" || origin.trim() !== EXPECTED_ORIGIN) {
      return jsonRes({ ok: false, error: "Invalid origin" }, 400, allowed);
    }

    // Ensure the API key is configured
    if (!env.GOOGLE_MAPS_API_KEY) {
      console.error("GOOGLE_MAPS_API_KEY is not configured in Worker environment");
      return jsonRes({ ok: false, error: "Service misconfigured" }, 503, allowed);
    }

    try {
      const result = await computeRoute(EXPECTED_ORIGIN, destination.trim(), env.GOOGLE_MAPS_API_KEY);
      return jsonRes(result, result.ok ? 200 : 422, allowed);
    } catch (err) {
      console.error("computeRoute threw:", String(err));
      return jsonRes({ ok: false, error: "Route computation failed" }, 502, allowed);
    }
  },
};

// ── Google Routes API ──────────────────────────────────────────────────────────

async function computeRoute(origin, destination, apiKey) {
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), GOOGLE_TIMEOUT);

  try {
    const res = await fetch(ROUTES_API_URL, {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "X-Goog-Api-Key":    apiKey,
        // Request only the fields we need to minimise response size and billing
        "X-Goog-FieldMask":  "routes.distanceMeters,routes.duration",
      },
      body: JSON.stringify({
        origin:                   { address: origin },
        destination:              { address: destination },
        travelMode:               "DRIVE",
        routingPreference:        "TRAFFIC_UNAWARE",
        computeAlternativeRoutes: false,
        languageCode:             "en-CA",
        units:                    "METRIC",
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const text = await res.text().catch(() => "(unreadable)");
      console.error(`Google Routes API ${res.status}:`, text);
      return { ok: false };
    }

    const data = await res.json();

    if (!Array.isArray(data.routes) || data.routes.length === 0) {
      console.error("Google Routes API returned no routes:", JSON.stringify(data).slice(0, 300));
      return { ok: false };
    }

    const route = data.routes[0];

    // distanceMeters is a number
    const distanceKm = (route.distanceMeters || 0) / 1000;

    // duration is a protobuf Duration string, e.g. "1234s" or "1234.5s"
    const durMatch = String(route.duration || "").match(/^(\d+(?:\.\d+)?)s$/);
    if (!durMatch) {
      console.error("Unexpected duration format from Google:", route.duration);
      return { ok: false };
    }
    const durationMinutes = parseFloat(durMatch[1]) / 60;

    return {
      ok:              true,
      distanceKm:      Math.round(distanceKm * 10) / 10,   // one decimal place
      durationMinutes: Math.round(durationMinutes),         // whole minutes
    };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      console.error("Google Routes API timed out after", GOOGLE_TIMEOUT, "ms");
    }
    throw err;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function corsHeaders(allowed) {
  return {
    "Access-Control-Allow-Origin":  allowed ? ALLOWED_ORIGIN : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age":       "86400",
  };
}

function jsonRes(body, status, allowed) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(allowed) },
  });
}
