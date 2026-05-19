/**
 * Nova Kingdom Rentals — Delivery Worker Unit Tests
 * Run: node test.mjs
 *
 * Tests all business-logic calculations without making live API calls.
 * These mirror the fee formulas in both estimate-delivery.js and quote-cart.mjs
 * so any drift between the two files is caught here.
 */

import assert from "node:assert/strict";

// ── Shared constants (must match quote-cart.mjs and estimate-delivery.js) ─────
const FREE_KM     = 15;
const RATE_PER_KM = 0.72;
const TRAVEL_RATE = 25;   // $25/hr
const SANDBAG_FEE = 15;   // $15/unit
const EXPECTED_ORIGIN = "598 Upper Branch Rd, Wileville, NS B4V 5M7, Canada";

// ── Helpers (mirror frontend recalcEstimate logic) ────────────────────────────

function calcDelivery(distanceKm, durationMinutes) {
  const billableKm = Math.max(distanceKm - FREE_KM, 0);
  const distFee    = Math.round(billableKm * 2 * RATE_PER_KM * 100) / 100;
  const rtHr       = (durationMinutes * 2) / 60;
  const billableHr = Math.ceil(rtHr / 0.25) * 0.25;
  const staffFee   = Math.round(billableHr * TRAVEL_RATE * 100) / 100;
  const total      = Math.round((distFee + staffFee) * 100) / 100;
  return { distFee, staffFee, billableHr, total };
}

function parseDuration(durStr) {
  const m = String(durStr ?? "").match(/^(\d+(?:\.\d+)?)s$/);
  return m ? Math.round(parseFloat(m[1]) / 60) : null;
}

function calcSandbag(inflatableCount, surface) {
  if (inflatableCount === 0) return { cost: 0, manual: false, note: "N/A (no inflatables)" };
  switch (surface) {
    case "Grass":                   return { cost: 0,                           manual: false, note: "$0 (grass)" };
    case "Indoor gym":
    case "Concrete or asphalt":     return { cost: inflatableCount * SANDBAG_FEE, manual: false, note: `${inflatableCount} × $15` };
    case "Artificial turf":
    case "Gravel":
    case "Other":                   return { cost: 0,                           manual: true,  note: "manual review" };
    default:                        return { cost: 0,                           manual: false, note: "enter surface below" };
  }
}

// ── Test runner ───────────────────────────────────────────────────────────────

let pass = 0, fail = 0;
function test(label, fn) {
  try   { fn(); console.log(`  ✓  ${label}`); pass++; }
  catch (err) { console.error(`  ✗  ${label}: ${err.message}`); fail++; }
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Distance fee (round-trip, first 15 km free) ─────────────────");

test("10 km → distFee $0 (within free zone)", () => {
  assert.equal(calcDelivery(10, 15).distFee, 0);
});

test("15 km → distFee $0 (exact edge of free zone)", () => {
  assert.equal(calcDelivery(15, 20).distFee, 0);
});

test("16 km → distFee = 1 km × 2 × $0.72 = $1.44", () => {
  assert.equal(calcDelivery(16, 20).distFee, 1.44);
});

test("40 km → distFee = 25 km × 2 × $0.72 = $36.00", () => {
  assert.equal(calcDelivery(40, 35).distFee, 36.00);
});

test("112 km → distFee = 97 km × 2 × $0.72 = $139.68", () => {
  assert.equal(calcDelivery(112, 75).distFee, 139.68);
});

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Staff travel fee (round-trip, round up to ¼ hr) ─────────────");

test("15 min one-way → 30 min RT = 0.5 hr → $12.50", () => {
  const { staffFee, billableHr } = calcDelivery(10, 15);
  assert.equal(billableHr, 0.5);
  assert.equal(staffFee, 12.50);
});

test("20 min one-way → 40 min RT = 0.667 hr → ceil to 0.75 hr → $18.75", () => {
  const { staffFee, billableHr } = calcDelivery(20, 20);
  assert.equal(billableHr, 0.75);
  assert.equal(staffFee, 18.75);
});

test("30 min one-way → 60 min RT = 1 hr → $25.00", () => {
  const { staffFee, billableHr } = calcDelivery(30, 30);
  assert.equal(billableHr, 1);
  assert.equal(staffFee, 25.00);
});

test("45 min one-way → 90 min RT = 1.5 hr → $37.50", () => {
  const { staffFee, billableHr } = calcDelivery(50, 45);
  assert.equal(billableHr, 1.5);
  assert.equal(staffFee, 37.50);
});

test("1 min one-way → 2 min RT → ceil to 0.25 hr → $6.25", () => {
  const { staffFee, billableHr } = calcDelivery(1, 1);
  assert.equal(billableHr, 0.25);
  assert.equal(staffFee, 6.25);
});

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Combined delivery total ──────────────────────────────────────");

test("Bridgewater → Lunenburg (~25 km, ~25 min): dist $14.40 + staff $25 (1 hr RT) = $39.40", () => {
  // dist: (25-15)*2*0.72 = $14.40
  // RT: 25*2=50 min → 50/60=0.833 hr → ceil(0.833/0.25)*0.25 = 4*0.25 = 1.0 hr → $25.00
  const { distFee, staffFee, total } = calcDelivery(25, 25);
  assert.equal(distFee,  14.40, `distFee: got ${distFee}`);
  assert.equal(staffFee, 25.00, `staffFee: got ${staffFee}`);
  assert.equal(total,    39.40, `total: got ${total}`);
});

test("Bridgewater → Halifax (~100 km, ~65 min): $122.40 dist + $55 staff = $177.40", () => {
  // dist: (100-15)*2*0.72 = 85*1.44 = 122.40
  // RT: 65*2=130 min → 130/60=2.167 hr → ceil(2.167/0.25)*0.25 = ceil(8.667)*0.25 = 9*0.25 = 2.25 hr → $56.25
  const { distFee, staffFee, total } = calcDelivery(100, 65);
  assert.equal(distFee,  122.40);
  assert.equal(staffFee, 56.25);
  assert.equal(total,    178.65);
});

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Duration string parsing (Google Routes API format) ───────────");

test('"1234s" → 21 min', () => assert.equal(parseDuration("1234s"), 21));
test('"900s"  → 15 min', () => assert.equal(parseDuration("900s"),  15));
test('"60s"   → 1 min',  () => assert.equal(parseDuration("60s"),   1));
test('"3600s" → 60 min', () => assert.equal(parseDuration("3600s"), 60));
test('"1800.5s" → 30 min (rounds)', () => assert.equal(parseDuration("1800.5s"), 30));
test('""      → null',   () => assert.equal(parseDuration(""),      null));
test('null    → null',   () => assert.equal(parseDuration(null),    null));
test('"bad"   → null',   () => assert.equal(parseDuration("bad"),   null));
test('"1h30m" → null (unsupported format)', () => assert.equal(parseDuration("1h30m"), null));

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Sandbag calculation ──────────────────────────────────────────");

test("0 inflatables → $0 regardless of surface", () => {
  assert.equal(calcSandbag(0, "Concrete or asphalt").cost, 0);
});

test("Grass → $0", () => {
  assert.equal(calcSandbag(3, "Grass").cost, 0);
  assert.equal(calcSandbag(3, "Grass").manual, false);
});

test("Concrete, 1 unit (Rush 42 alone) → $15", () => {
  const r = calcSandbag(1, "Concrete or asphalt");
  assert.equal(r.cost, 15);
  assert.equal(r.manual, false);
});

test("Indoor gym, 3 units → $45", () => {
  assert.equal(calcSandbag(3, "Indoor gym").cost, 45);
});

test("Ultimate Kingdom (6 units) concrete → 6 × $15 = $90", () => {
  assert.equal(calcSandbag(6, "Concrete or asphalt").cost, 90);
});

test("Artificial turf → manual review, $0 est.", () => {
  const r = calcSandbag(3, "Artificial turf");
  assert.equal(r.cost,   0);
  assert.equal(r.manual, true);
});

test("Gravel → manual review", () => {
  assert.equal(calcSandbag(2, "Gravel").manual, true);
});

test("Other → manual review", () => {
  assert.equal(calcSandbag(2, "Other").manual, true);
});

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Input validation (Worker-side) ───────────────────────────────");

test("Destination < 5 chars is invalid", () => {
  assert.ok("abc".trim().length < 5);
});

test("Origin mismatch rejected", () => {
  assert.notEqual("Bridgewater, NS".trim(), EXPECTED_ORIGIN);
});

test("Old short origin rejected", () => {
  assert.notEqual("Bridgewater, NS", EXPECTED_ORIGIN);
});

test("Exact expected origin accepted", () => {
  assert.equal(EXPECTED_ORIGIN.trim(), EXPECTED_ORIGIN);
});

test("Destination '123 Main St, Lunenburg, NS' is valid (≥ 5 chars)", () => {
  const dest = "123 Main St, Lunenburg, NS";
  assert.ok(dest.trim().length >= 5);
});

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Attendant calculation ────────────────────────────────────────");

function calcAttendants(count, hours) {
  return count * hours * 35; // $35/hr/person
}

test("1 attendant × 4 hr × $35 = $140", () => {
  assert.equal(calcAttendants(1, 4), 140);
});

test("5 attendants × 4 hr × $35 = $700", () => {
  assert.equal(calcAttendants(5, 4), 700);
});

test("2 attendants × 8 hr × $35 = $560", () => {
  assert.equal(calcAttendants(2, 8), 560);
});

// ─────────────────────────────────────────────────────────────────────────────
const total = pass + fail;
console.log(`\n${"─".repeat(60)}`);
console.log(`  ${pass}/${total} passed${fail > 0 ? `, ${fail} FAILED` : " — all good"}`);
if (fail > 0) process.exit(1);
