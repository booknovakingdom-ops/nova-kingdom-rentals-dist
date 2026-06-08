/* Nova Kingdom Rentals — Quote Cart v20260520-delivery-ui
   Availability request only. No payment. No confirmed booking.
   Changes vs worker:
   - Delivery sub-line simplified to "Includes delivery, setup, and staff travel."
   - Operational detail (km, travel hours, rates) moved to tooltip only
   - Tooltip copy rewritten: concise, premium
*/

console.info("Nova Quote Cart loaded");
window.NovaQuoteCartLoaded = true;

// ── Constants ────────────────────────────────────────────────────
const CART_KEY    = "nk_quote_v1";
const W3F_KEY     = "909ed8f7-78ca-494f-b960-1713b60bc012";
const FREE_KM     = 15;
const RATE_PER_KM = 0.72;
const SANDBAG_FEE = 15;
const TRAVEL_RATE = 25; // $25/hr staff travel, used in auto-calculated delivery estimate

// Full base address sent to the Worker. The Worker validates this value and keeps
// the Google Maps API key server-side — do NOT hardcode the key here.
const NOVA_KINGDOM_BASE_ADDRESS = "598 Upper Branch Rd, Wileville, NS B4V 5M7, Canada";

const DELIVERY_API_URL = "https://nova-delivery-api.booknovakingdom.workers.dev/api/estimate-delivery";

// Crown Carnival Challenge: dynamic pricing based on whether a package is in cart
const CROWN_CARNIVAL_ID         = "product-crown-carnival-challenge";
const CROWN_CARNIVAL_STANDALONE = 270;
const CROWN_CARNIVAL_ADDON      = 200;

const BOOTH_360_ID         = "product-360-video-booth";
const BOOTH_360_STANDALONE = 250;
const BOOTH_360_ADDON      = 175;

const FOAM_PARTY_ID = "product-kids-foam-party";
// Foam party pricing tiers by guest count
const FOAM_TIERS = [
  { label: "Up to 30 kids", standalone: 349, addon: 200 },
  { label: "31–80 kids",    standalone: 599, addon: 350 },
  { label: "80+ kids",      standalone: 800, addon: 650 },
];

// Time-based 360 booth pricing. Returns {hours, standalone, addon} or null if times invalid.
function calc360Price(st, et) {
  if (!st || !et) return null;
  var a = st.split(":"), b = et.split(":");
  var d = (parseInt(b[0]) * 60 + parseInt(b[1])) - (parseInt(a[0]) * 60 + parseInt(a[1]));
  if (d <= 0) return null;
  var h = Math.ceil(d / 60);
  return { hours: h, standalone: 250 + (h - 1) * 125, addon: 175 + (h - 1) * 100 };
}

// Extra display metadata for specific cart items (thumbnail + subtitle in cart panel)
const CART_ITEM_META = {
  [CROWN_CARNIVAL_ID]: {
    image:      "/images/crown carnival challenge.jpeg",
    subtitle:   "Basketball shoot · Elephant toss · Tic Tac Toe · On-point target game",
    addonLabel: "Add-on",
  },
  [BOOTH_360_ID]: {
    image:      "/images/360-video-booth.jpg",
    subtitle:   "Standalone: $250/hr · Add-on with package: $175/hr · Extra hours available",
    addonLabel: "Add-on",
  },
  [FOAM_PARTY_ID]: {
    image:      "/images/kids-foam-party.jpg",
    subtitle:   "Priced by guest count — confirm tier at booking",
    addonLabel: "Add-on",
  },
};

// Package cart IDs → included individual product cart IDs.
// IDs are derived from names via: "pkg-" + name.toLowerCase().replace(/[^a-z0-9]+/g,"-")
//                             and "product-" + name.toLowerCase().replace(/[^a-z0-9]+/g,"-")
const PKG_INCLUDED_PRODUCTS = {
  "pkg-cascade-starter":  new Set(["product-crown-cascade"]),
  "pkg-dino-dash":        new Set(["product-crown-dino-combo", "product-crown-kick-darts"]),
  "pkg-island-splash":    new Set(["product-crown-island-combo"]),
  "pkg-quest-games":      new Set(["product-crown-quest", "product-crown-axe-challenge"]),
  "pkg-dino-party-plus":  new Set(["product-crown-dino-combo", "product-crown-kick-darts", "product-crown-axe-challenge"]),
  "pkg-island-royale":    new Set(["product-crown-island-combo", "product-crown-kick-darts", "product-crown-axe-challenge"]),
  "pkg-royal-all-star":   new Set(["product-crown-rush-42", "product-crown-axe-challenge", "product-crown-kick-darts"]),
  "pkg-kingdom-deluxe":   new Set(["product-crown-rush-42", "product-crown-island-combo", "product-crown-axe-challenge", "product-crown-kick-darts"]),
  "pkg-ultimate-kingdom":      new Set(["product-crown-rush-42", "product-crown-climber", "product-crown-island-combo", "product-crown-dino-combo", "product-crown-axe-challenge", "product-crown-kick-darts"]),
  "pkg-ultimate-kingdom-plus": new Set(["product-crown-rush-42", "product-crown-climber", "product-crown-island-combo", "product-crown-dino-combo", "product-crown-axe-challenge", "product-crown-kick-darts", "product-crown-carnival-challenge", BOOTH_360_ID]),
};

// Crown Rush 42 is a combined unit — functionally covers Cascade and Quest.
// Any item (standalone product or package) that includes Rush 42 also blocks these.
const PRODUCT_COVERS = {
  "product-crown-rush-42": new Set(["product-crown-cascade", "product-crown-quest"]),
};

// Power distance options that trigger a "manual review" flag
const POWER_REVIEW_VALUES = new Set(["Over 50 ft", "No power available", "Not sure"]);

// Standalone lawn game packages
const LAWN_GAME_PACKAGES = [
  { id: "lg-5",  name: "5 Lawn Games Package",  price: 175, note: "Excludes Cornhole and Giant Connect 4", cornholeEligible: true,  isInflatable: false },
  { id: "lg-10", name: "10 Lawn Games Package", price: 250, note: "Excludes Cornhole",                    cornholeEligible: true,  isInflatable: false },
  { id: "lg-12", name: "12 Lawn Games Package", price: 280, note: "All 12 games including Cornhole",       cornholeEligible: false, isInflatable: false },
];

// Upgrade options shown when cart has a package that already includes 5 lawn games
const UPGRADE_OPTIONS = [
  { id: "lg-upgrade-10", name: "Upgrade to 10 Lawn Games", price: 75,  note: "Excludes Cornhole — Cornhole add-on +$25", cornholeEligible: true,  isInflatable: false },
  { id: "lg-upgrade-12", name: "Upgrade to all 12 Lawn Games", price: 105, note: "All 12 games including Cornhole",       cornholeEligible: false, isInflatable: false },
];

// Pricing for individual lawn game add-ons (per card on /lawn-games)
const LG_INDIVIDUAL_PRICES = { "cornhole": 45 }; // all others $25
const LG_GAME_ID_PREFIX    = "lg-game-";

// Cleared as a group when a new lawn-game package/upgrade is selected
const ALL_LG_IDS = new Set([
  "lg-5", "lg-10", "lg-12",
  "lg-upgrade-10", "lg-upgrade-12",
  "lg-cornhole-addon",
]);

const DISCLAIMER =
  "This is an availability request, not a confirmed booking. Nova Kingdom Rentals will manually confirm availability, delivery cost, setup suitability, staffing needs, and deposit/payment details.";

const WAIVER_NOTE =
  "Agreement and waiver will be sent after availability is confirmed and deposit/payment details are reviewed.";

// Event attendants: $35/hr per person, confirmed manually
const ATTENDANT_RATE = 35;

// ── Delivery estimate state ──────────────────────────────────────
// Populated by estimateDeliveryFromAddress() via POST /api/estimate-delivery.
// Falls back to isManual=true whenever the endpoint is unavailable or address incomplete.
const deliveryState = {
  distanceKm:      null,
  durationMinutes: null,
  isManual:        true,
  isPending:       false,
  lastAddress:     "",
};

function resetDeliveryState() {
  deliveryState.distanceKm      = null;
  deliveryState.durationMinutes = null;
  deliveryState.isManual        = true;
  deliveryState.isPending       = false;
  deliveryState.lastAddress     = "";
}

// ── Extra UI state (persists across renderPanel calls) ───────────
const extraState = {
  attendantsWanted: false,
  attendantCount:   1,
  attendantHours:   4,
};

function clearExtraState() {
  extraState.attendantsWanted = false;
  extraState.attendantCount   = 1;
  extraState.attendantHours   = 4;
  resetDeliveryState();
}

// Live reference to the active recalcEstimate closure so the async delivery
// callback can trigger a recalc without being inside makeFormSection.
let _recalcEstimate = null;
function triggerRecalcEstimate() { if (_recalcEstimate) _recalcEstimate(); }

const WATER_RE = /water|cascade|island combo|rush|splash/i;

// ── Address-based delivery estimate ─────────────────────────────
// BACKEND REQUIRED: POST /api/estimate-delivery must be implemented server-side
// (serverless function, Next.js API route, Express handler, etc.).
// The Google Maps API key MUST remain server-side only — never in this file.
//
// Expected request body:  { origin: string, destination: string }
// Expected response:       { ok: true, distanceKm: number, durationMinutes: number }
//
// The frontend falls back gracefully to "manual quote" when the endpoint is absent,
// returns a non-2xx status, times out, or returns an unexpected shape.

async function estimateDeliveryFromAddress(address) {
  const trimmed = (address || "").trim();
  if (trimmed.length < 5 || trimmed === deliveryState.lastAddress) return;
  deliveryState.lastAddress = trimmed;
  deliveryState.isPending   = true;
  deliveryState.isManual    = false;

  const setupEl = eid("nk-setup-val");
  if (setupEl) {
    setupEl.textContent = "Looking up delivery estimate…";
    setupEl.classList.add("nk-loading");
  }

  try {
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(DELIVERY_API_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ origin: NOVA_KINGDOM_BASE_ADDRESS, destination: trimmed }),
      signal:  controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error("API " + res.status);
    const data = await res.json();
    if (!data.ok || typeof data.distanceKm !== "number" || typeof data.durationMinutes !== "number") {
      throw new Error("Invalid response shape");
    }
    deliveryState.distanceKm      = data.distanceKm;
    deliveryState.durationMinutes = data.durationMinutes;
    deliveryState.isManual        = false;
  } catch {
    deliveryState.distanceKm      = null;
    deliveryState.durationMinutes = null;
    deliveryState.isManual        = true;
  }
  deliveryState.isPending = false;
  const setupElFinal = eid("nk-setup-val");
  if (setupElFinal) setupElFinal.classList.remove("nk-loading");
  triggerRecalcEstimate();
}

let _deliveryDebounceTimer = null;
function scheduleDeliveryEstimate(form) {
  clearTimeout(_deliveryDebounceTimer);
  const addr = (form.querySelector("#nkf-addr")?.value || "").trim();
  const city  = (form.querySelector("#nkf-city")?.value || "").trim();
  if (!addr || !city) return;
  _deliveryDebounceTimer = setTimeout(
    () => estimateDeliveryFromAddress(addr + ", " + city + ", NS"),
    800
  );
}

// ── Form state (persists across renderPanel calls) ───────────────
const formState = {
  name: "", email: "", phone: "",
  eventDate: "", startTime: "", endTime: "",
  eventAddress: "", city: "", province: "Nova Scotia",
  postalCode: "", setupSurface: "",
  powerAccess: "", waterAccess: "", guests: "", notes: "",
};

function captureFormState(form) {
  if (!form) return;
  for (const key of Object.keys(formState)) {
    const el = form.querySelector("[name='" + key + "']");
    if (el) formState[key] = el.value;
  }
}

function restoreFormState(form) {
  if (!form) return;
  for (const [key, value] of Object.entries(formState)) {
    const el = form.querySelector("[name='" + key + "']");
    if (el && value !== "") el.value = value;
  }
}

function clearFormState() {
  for (const key of Object.keys(formState)) {
    formState[key] = key === "province" ? "Nova Scotia" : "";
  }
}

// ── Cart state (sessionStorage) ──────────────────────────────────
function loadCart() {
  try { return JSON.parse(sessionStorage.getItem(CART_KEY) || "[]"); }
  catch { return []; }
}
function saveCart(items) {
  try { sessionStorage.setItem(CART_KEY, JSON.stringify(items)); }
  catch {}
}

// ── Helpers ──────────────────────────────────────────────────────
const eid        = (id) => document.getElementById(id);
const escHtml    = (s) => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const parsePrice = (t) => parseFloat(String(t).replace(/[^0-9.]/g,"")) || 0;
const formatMoney = (n) => "$" + Number(n).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,",");

// Returns { productId: coveringItemName } for all products blocked by items currently in cart.
// Handles: package → its included products, and Rush 42 (standalone or via package) → Cascade + Quest.
function getIncludedProductIds(cart) {
  const map = {};
  for (const item of cart) {
    const pkgSet = PKG_INCLUDED_PRODUCTS[item.id];
    if (pkgSet) {
      pkgSet.forEach((pid) => {
        map[pid] = item.name;
        const transitive = PRODUCT_COVERS[pid];
        if (transitive) transitive.forEach((tpid) => { if (!map[tpid]) map[tpid] = item.name; });
      });
    }
    const covers = PRODUCT_COVERS[item.id];
    if (covers) covers.forEach((pid) => { if (!map[pid]) map[pid] = item.name; });
  }
  return map;
}

// Corrects addon prices: Carnival Challenge and 360 Photo Booth are cheaper when a package is in cart
function normalizeCarnivalPrice(cart) {
  const hasPkg = cart.some((i) => i.id.startsWith("pkg-"));
  return cart.map((i) => {
    if (i.id === CROWN_CARNIVAL_ID) return { ...i, price: hasPkg ? CROWN_CARNIVAL_ADDON : CROWN_CARNIVAL_STANDALONE };
    if (i.id === BOOTH_360_ID)      return { ...i, price: hasPkg ? BOOTH_360_ADDON : BOOTH_360_STANDALONE };
    return i;
  });
}

// Expands a package's product set by applying PRODUCT_COVERS.
// Used only for package overlap comparison — NOT for sandbag unit counting.
function effectiveProductSet(pkgId) {
  const base = PKG_INCLUDED_PRODUCTS[pkgId];
  if (!base) return null;
  const expanded = new Set(base);
  base.forEach((pid) => {
    const covers = PRODUCT_COVERS[pid];
    if (covers) covers.forEach((cpid) => expanded.add(cpid));
  });
  return expanded;
}

// Returns true if every effective product of pkgBId is already covered by pkgAId
function isPkgCoveredBy(pkgBId, pkgAId) {
  const b = effectiveProductSet(pkgBId);
  const a = effectiveProductSet(pkgAId);
  if (!b || !a || b.size === 0) return false;
  for (const pid of b) { if (!a.has(pid)) return false; }
  return true;
}

// Returns name of first cart item that fully covers pkgId, or null.
function getCoveringPackage(pkgId, cart) {
  const pkgEff = effectiveProductSet(pkgId);
  if (!pkgEff || pkgEff.size === 0) return null;
  for (const item of cart) {
    if (item.id === pkgId) continue;
    if (item.id.startsWith("pkg-") && isPkgCoveredBy(pkgId, item.id)) return item.name;
    const productCovers = PRODUCT_COVERS[item.id];
    if (productCovers) {
      const coveringSet = new Set([item.id, ...productCovers]);
      if ([...pkgEff].every((pid) => coveringSet.has(pid))) return item.name;
    }
  }
  return null;
}

// Returns cart items (packages) whose core products are fully covered by pkgId
function getCoveredPackages(pkgId, cart) {
  return cart.filter((item) =>
    item.id !== pkgId &&
    item.id.startsWith("pkg-") &&
    isPkgCoveredBy(item.id, pkgId)
  );
}

// One-shot message shown in the panel after auto-removing overlapping packages
const REMOVED_NOTE_KEY = "nk_removed_note";
function setRemovedNote(msg) { try { sessionStorage.setItem(REMOVED_NOTE_KEY, msg); } catch {} }
function popRemovedNote()     { try { const m = sessionStorage.getItem(REMOVED_NOTE_KEY); if (m) sessionStorage.removeItem(REMOVED_NOTE_KEY); return m; } catch { return null; } }

// Counts distinct physical inflatable units across cart items.
// Packages are expanded to their included product IDs; standalone products count as 1 each.
// Deduplication via Set prevents double-counting when packages overlap.
// Lawn games and non-inflatable add-ons (isInflatable === false) are excluded.
function countPhysicalUnits(items) {
  const seen = new Set();
  for (const item of items) {
    if (item.isInflatable === false) continue;
    const pkgProducts = PKG_INCLUDED_PRODUCTS[item.id];
    if (pkgProducts) {
      pkgProducts.forEach((pid) => seen.add(pid));
    } else {
      seen.add(item.id);
    }
  }
  return seen.size;
}

function cartStats(items) {
  const subtotal        = items.reduce((s, i) => s + i.price, 0);
  const inflatableCount = countPhysicalUnits(items);
  const lawnsOnly       = items.length > 0 && items.every((i) => i.isInflatable === false);
  const hasWater        = items.some((i) => WATER_RE.test(i.name));
  return { subtotal, inflatableCount, lawnsOnly, hasWater };
}

// ── Bar (floating launcher) ──────────────────────────────────────
function buildBar() {
  if (eid("nk-quote-bar")) return;
  const bar = document.createElement("div");
  bar.id = "nk-quote-bar";
  bar.className = "nk-quote-bar";
  bar.hidden = true;
  bar.innerHTML =
    '<span class="nk-quote-bar-label">Quote</span>' +
    '<span class="nk-quote-bar-count" id="nk-bar-count">0</span>' +
    '<button class="nk-quote-bar-btn" id="nk-bar-open" type="button">View Quote</button>';
  document.body.appendChild(bar);
  eid("nk-bar-open").addEventListener("click", openPanel);
}

function updateBar() {
  const bar   = eid("nk-quote-bar");
  const count = eid("nk-bar-count");
  if (!bar) return;

  const rawItems = loadCart();
  const items    = normalizeCarnivalPrice(rawItems);
  if (JSON.stringify(items) !== JSON.stringify(rawItems)) saveCart(items);

  const included = getIncludedProductIds(items);
  const has12LG  = items.some((i) => i.id === "lg-12" || i.id === "lg-upgrade-12");
  bar.hidden = items.length === 0;
  if (count) count.textContent = String(items.length);

  document.querySelectorAll(".nk-add-to-quote[data-nk-id]").forEach((btn) => {
    const pid        = btn.dataset.nkId;
    const includedIn = included[pid];
    if (has12LG && pid.startsWith(LG_GAME_ID_PREFIX)) {
      btn.textContent = "In 12-game package"; btn.classList.add("in-cart"); btn.disabled = true;
    } else if (includedIn) {
      btn.textContent = "Included in package"; btn.classList.add("in-cart"); btn.disabled = true;
    } else if (pid.startsWith("pkg-") && getCoveringPackage(pid, items)) {
      btn.textContent = "Already covered by your package"; btn.classList.add("in-cart"); btn.disabled = true;
    } else {
      const inCart = items.some((i) => i.id === pid);
      btn.disabled = false;
      btn.textContent = inCart ? "In Quote ✓" : "Add to Quote";
      btn.classList.toggle("in-cart", inCart);
    }
  });
}

// ── Overlay/panel shell (created once) ──────────────────────────
function buildPanel() {
  if (eid("nk-quote-overlay")) return;
  const overlay = document.createElement("div");
  overlay.id = "nk-quote-overlay";
  overlay.className = "nk-quote-overlay";
  overlay.hidden = true;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Quote Request");
  overlay.innerHTML =
    '<div class="nk-quote-panel" id="nk-quote-panel">' +
      '<div class="nk-qp-header">' +
        '<h2>Your Quote Request</h2>' +
        '<button class="nk-qp-close" id="nk-qp-close" type="button" aria-label="Close">&#x2715;</button>' +
      '</div>' +
      '<div class="nk-qp-body" id="nk-qp-body"></div>' +
    '</div>';
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closePanel(); });
  eid("nk-qp-close").addEventListener("click", closePanel);
}

function openPanel() {
  const overlay = eid("nk-quote-overlay");
  if (!overlay) return;
  overlay.hidden = false;
  document.body.style.overflow = "hidden";
  renderPanel();
}

function closePanel() {
  const overlay = eid("nk-quote-overlay");
  if (!overlay) return;
  captureFormState(overlay.querySelector("#nk-quote-form"));
  overlay.hidden = true;
  document.body.style.overflow = "";
}

// ── Panel rendering ──────────────────────────────────────────────
// Called only from explicit user actions. NEVER from MutationObserver.
function renderPanel() {
  const body = eid("nk-qp-body");
  if (!body) return;
  try {
    captureFormState(body.querySelector("#nk-quote-form"));

    const rawItems = loadCart();
    const items    = normalizeCarnivalPrice(rawItems);
    if (JSON.stringify(items) !== JSON.stringify(rawItems)) saveCart(items);

    const stats = cartStats(items);

    const frag = document.createDocumentFragment();
    frag.appendChild(makeItemsSection(items));
    frag.appendChild(makeLawnSection(items));
    frag.appendChild(makeAttendantSection());
    frag.appendChild(makeEstimateSection(items, stats));
    frag.appendChild(makeFormSection(items, stats));

    body.innerHTML = "";
    body.appendChild(frag);
  } catch (err) {
    console.error("Nova Quote Cart panel render failed:", err);
  }
}

// ── Items section ────────────────────────────────────────────────
function makeItemsSection(items) {
  const sec = document.createElement("section");
  sec.innerHTML = '<p class="nk-qs-title">Selected items</p>';

  const removedNote = popRemovedNote();
  if (removedNote) {
    const noteEl = document.createElement("p");
    noteEl.className = "nk-estimate-note";
    noteEl.style.cssText = "color:#c9a227;margin-bottom:0.5rem;";
    noteEl.textContent = removedNote;
    sec.appendChild(noteEl);
  }

  if (!items.length) {
    sec.insertAdjacentHTML("beforeend",
      '<p class="nk-empty-note">No items added yet. Use the "Add to Quote" buttons on rentals or packages, or pick a lawn game option below.</p>');
    return sec;
  }
  const hasPkg = items.some((i) => i.id.startsWith("pkg-"));
  const ul = document.createElement("ul");
  ul.className = "nk-item-list";
  items.forEach((item) => {
    const li   = document.createElement("li"); li.className = "nk-item-row";
    const meta = CART_ITEM_META[item.id];

    if (meta?.image) {
      const thumb = document.createElement("img");
      thumb.className = "nk-item-thumb";
      thumb.src = meta.image;
      thumb.alt = "";
      thumb.setAttribute("aria-hidden", "true");
      thumb.setAttribute("loading", "lazy");
      li.appendChild(thumb);
    }

    const info = document.createElement("div"); info.className = "nk-item-info";
    const nameSpan = document.createElement("span"); nameSpan.className = "nk-item-name"; nameSpan.textContent = item.name;
    info.appendChild(nameSpan);
    if (meta?.subtitle) {
      const sub = document.createElement("small"); sub.className = "nk-item-sub";
      sub.textContent = (hasPkg && meta.addonLabel ? meta.addonLabel + " \xb7 " : "") + meta.subtitle;
      info.appendChild(sub);
    }
    li.appendChild(info);

    const priceSpan = document.createElement("span"); priceSpan.className = "nk-item-price"; priceSpan.textContent = formatMoney(item.price);
    const rmBtn = document.createElement("button");
    rmBtn.type = "button"; rmBtn.className = "nk-item-remove";
    rmBtn.setAttribute("aria-label", "Remove " + item.name);
    rmBtn.textContent = "✕"; rmBtn.dataset.rmId = item.id;
    li.appendChild(priceSpan); li.appendChild(rmBtn);
    ul.appendChild(li);
  });
  ul.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-rm-id]");
    if (!btn) return;
    saveCart(loadCart().filter((i) => i.id !== btn.dataset.rmId));
    updateBar();
    renderPanel();
  });
  sec.appendChild(ul);
  return sec;
}

// ── Lawn game section ────────────────────────────────────────────
function makeLawnSection(items) {
  const cartIds          = new Set(items.map((i) => i.id));
  const hasPkgWith5LG    = items.some((i) => i.includesLawnGames === true);
  const options          = hasPkgWith5LG ? UPGRADE_OPTIONS : LAWN_GAME_PACKAGES;
  const selectedOpt      = options.find((p) => cartIds.has(p.id));

  const sec = document.createElement("section");

  const titleP = document.createElement("p");
  titleP.className = "nk-qs-title";
  titleP.textContent = hasPkgWith5LG
    ? "Lawn game upgrades (your package includes 5 games)"
    : "Lawn game packages (standalone)";
  sec.appendChild(titleP);

  if (hasPkgWith5LG) {
    const note = document.createElement("p");
    note.className = "nk-estimate-note";
    note.style.marginBottom = "0.5rem";
    note.textContent = "Your package already includes 5 Lawn Games. Upgrade pricing reflects only the difference — no double charge.";
    sec.appendChild(note);
  }

  const grid = document.createElement("div");
  grid.className = "nk-lg-grid";
  options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "nk-lg-btn" + (cartIds.has(opt.id) ? " selected" : "");
    btn.setAttribute("data-lg-id", opt.id);
    const n = document.createElement("span"); n.className = "nk-lg-btn-name";  n.textContent = opt.name;
    const p = document.createElement("span"); p.className = "nk-lg-btn-price"; p.textContent = formatMoney(opt.price) + (hasPkgWith5LG ? " upgrade" : "");
    const o = document.createElement("span"); o.className = "nk-lg-btn-note";  o.textContent = opt.note;
    btn.appendChild(n); btn.appendChild(p); btn.appendChild(o);
    grid.appendChild(btn);
  });

  grid.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-lg-id]");
    if (!btn) return;
    const optId  = btn.dataset.lgId;
    const optDef = options.find((p) => p.id === optId);
    if (!optDef) return;
    let cart = loadCart().filter((i) => !ALL_LG_IDS.has(i.id));
    if (optId === "lg-12" || optId === "lg-upgrade-12") {
      cart = cart.filter((i) => !i.id.startsWith(LG_GAME_ID_PREFIX));
    }
    if (!cartIds.has(optId)) {
      cart.push({ id: optDef.id, name: optDef.name, price: optDef.price, isInflatable: false });
    }
    saveCart(cart);
    updateBar();
    renderPanel();
  });
  sec.appendChild(grid);

  const canAddCornhole = selectedOpt?.cornholeEligible === true;
  const cornholeInCart = cartIds.has("lg-cornhole-addon");

  const chRow = document.createElement("div");
  chRow.className = "nk-cornhole-row";
  chRow.style.display = canAddCornhole ? "flex" : "none";

  const lbl = document.createElement("label");
  const chk = document.createElement("input");
  chk.type = "checkbox"; chk.id = "nk-cornhole-check";
  if (cornholeInCart) chk.checked = true;
  lbl.appendChild(chk);
  lbl.appendChild(document.createTextNode(" Add Cornhole"));

  const chPrice = document.createElement("span");
  chPrice.className = "nk-cornhole-price"; chPrice.textContent = "+$25";
  chRow.appendChild(lbl); chRow.appendChild(chPrice);
  chRow.addEventListener("change", (e) => {
    if (e.target !== chk) return;
    let cart = loadCart().filter((i) => i.id !== "lg-cornhole-addon");
    if (e.target.checked) cart.push({ id: "lg-cornhole-addon", name: "Cornhole Add-On", price: 25, isInflatable: false });
    saveCart(cart);
    updateBar();
    renderPanel();
  });
  sec.appendChild(chRow);
  return sec;
}

// ── Attendant section ────────────────────────────────────────────
function makeAttendantSection() {
  const sec = document.createElement("section");
  const title = document.createElement("p"); title.className = "nk-qs-title"; title.textContent = "Event attendants (optional)";
  sec.appendChild(title);

  const wantGrid = document.createElement("div"); wantGrid.className = "nk-lg-grid";
  [{ label: "No / not sure", isYes: false }, { label: "Yes", isYes: true }].forEach(({ label, isYes }) => {
    const btn = document.createElement("button"); btn.type = "button";
    btn.className = "nk-lg-btn" + (isYes === extraState.attendantsWanted ? " selected" : "");
    btn.setAttribute("data-att-want", isYes ? "yes" : "no");
    const n = document.createElement("span"); n.className = "nk-lg-btn-name"; n.textContent = label;
    btn.appendChild(n); wantGrid.appendChild(btn);
  });

  const detailDiv = document.createElement("div");
  detailDiv.style.display = extraState.attendantsWanted ? "" : "none";
  detailDiv.style.marginTop = "0.6rem";

  wantGrid.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-att-want]");
    if (!btn) return;
    extraState.attendantsWanted = btn.dataset.attWant === "yes";
    wantGrid.querySelectorAll("[data-att-want]").forEach((b) => {
      b.classList.toggle("selected", (b.dataset.attWant === "yes") === extraState.attendantsWanted);
    });
    detailDiv.style.display = extraState.attendantsWanted ? "" : "none";
    triggerRecalcEstimate();
  });

  const qfRow = document.createElement("div"); qfRow.className = "nk-qf-row";

  const countField = document.createElement("div"); countField.className = "nk-qf-field";
  const countLbl = document.createElement("label"); countLbl.className = "nk-qf-label"; countLbl.setAttribute("for", "nkf-att-count"); countLbl.textContent = "Number of attendants";
  const countIn = document.createElement("input"); countIn.type = "number"; countIn.id = "nkf-att-count"; countIn.min = "1"; countIn.max = "10"; countIn.step = "1"; countIn.value = String(extraState.attendantCount);
  countField.appendChild(countLbl); countField.appendChild(countIn);

  const hoursField = document.createElement("div"); hoursField.className = "nk-qf-field";
  const hoursLbl = document.createElement("label"); hoursLbl.className = "nk-qf-label"; hoursLbl.setAttribute("for", "nkf-att-hours"); hoursLbl.textContent = "Number of event hours";
  const hoursIn = document.createElement("input"); hoursIn.type = "number"; hoursIn.id = "nkf-att-hours"; hoursIn.min = "1"; hoursIn.max = "24"; hoursIn.step = "1"; hoursIn.value = String(extraState.attendantHours);
  hoursField.appendChild(hoursLbl); hoursField.appendChild(hoursIn);

  qfRow.appendChild(countField); qfRow.appendChild(hoursField);
  detailDiv.appendChild(qfRow);

  const attNote = document.createElement("p"); attNote.className = "nk-estimate-note"; attNote.style.marginTop = "0.4rem";
  attNote.textContent = "Attendants are $35/hour per person. Needs are confirmed manually based on event type, guest count, equipment, and supervision requirements.";
  detailDiv.appendChild(attNote);

  detailDiv.addEventListener("input", (e) => {
    if (e.target.id === "nkf-att-count") extraState.attendantCount = Math.max(1, parseInt(e.target.value) || 1);
    if (e.target.id === "nkf-att-hours") extraState.attendantHours = Math.max(1, parseInt(e.target.value) || 1);
    triggerRecalcEstimate();
  });

  sec.appendChild(wantGrid);
  sec.appendChild(detailDiv);
  return sec;
}

// ── Estimate section ─────────────────────────────────────────────
function makeEstimateSection(items, stats) {
  const { subtotal, lawnsOnly } = stats;
  const sec = document.createElement("section");
  const title = document.createElement("p"); title.className = "nk-qs-title"; title.textContent = "Preliminary estimate";
  sec.appendChild(title);
  const tbl = document.createElement("table"); tbl.className = "nk-estimate-table";
  tbl.innerHTML =
    "<tr><td>Subtotal</td><td id='nk-subtotal-val'>" + escHtml(formatMoney(subtotal)) + "</td></tr>" +
    "<tr id='nk-booth360-row' hidden><td id='nk-booth360-label' style='font-size:0.82em;color:#888;padding-left:0.8em'></td><td id='nk-booth360-price' style='font-size:0.82em;color:#888'></td></tr>" +
    "<tr><td>Delivery &amp; setup estimate <span class='nk-tooltip-wrap'>" +
      "<button class='nk-tooltip-icon nk-tip-setup' type='button' aria-label='About delivery and setup estimate'>ⓘ</button>" +
      "<span class='nk-tooltip-body nk-tip-body-setup'>First 15 km is free. Beyond that, distance is charged round-trip at $0.72/km. Staff travel time is included. Anchoring for non-grass surfaces confirmed after setup review. Final logistics reviewed after booking.</span>" +
    "</span></td><td id='nk-setup-val'>Enter event address below</td></tr>" +
    "<tr><td>Event attendant estimate</td><td id='nk-attendant-val'>—</td></tr>" +
    "<tr class='total'><td>Estimated total</td><td id='nk-total-val'>" + escHtml(formatMoney(subtotal)) + "</td></tr>";

  const setupTipIcon = tbl.querySelector(".nk-tip-setup");
  const setupTipBody = tbl.querySelector(".nk-tip-body-setup");
  if (setupTipIcon && setupTipBody) {
    setupTipIcon.addEventListener("click", (e) => {
      e.stopPropagation();
      setupTipBody.classList.toggle("visible");
    });
  }
  document.addEventListener("click", () => {
    setupTipBody?.classList.remove("visible");
  });
  sec.appendChild(tbl);

  const note = document.createElement("p"); note.className = "nk-estimate-note";
  note.textContent = "Estimates are preliminary and confirmed manually after address and setup review.";
  sec.appendChild(note);
  return sec;
}

// ── Form section ─────────────────────────────────────────────────
function makeFormSection(items, stats) {
  const { subtotal, inflatableCount, lawnsOnly, hasWater } = stats;
  const selectedSummary = items.map((i) => i.name + " (" + formatMoney(i.price) + ")").join("; ") || "No items selected";

  const sec = document.createElement("section");
  const title = document.createElement("p"); title.className = "nk-qs-title"; title.textContent = "Event & contact details";
  sec.appendChild(title);

  const form = document.createElement("form");
  form.id = "nk-quote-form";
  form.innerHTML = `
    <div class="nk-qf-row">
      <div class="nk-qf-field"><label class="nk-qf-label" for="nkf-name">Name <span class="nk-req">*</span></label><input id="nkf-name" name="name" type="text" required placeholder="Your name"></div>
      <div class="nk-qf-field"><label class="nk-qf-label" for="nkf-phone">Phone <span class="nk-req">*</span></label><input id="nkf-phone" name="phone" type="tel" required placeholder="902-___-____"></div>
    </div>
    <div class="nk-qf-field"><label class="nk-qf-label" for="nkf-email">Email <span class="nk-req">*</span></label><input id="nkf-email" name="email" type="email" required placeholder="you@example.com"></div>
    <div class="nk-qf-row">
      <div class="nk-qf-field"><label class="nk-qf-label" for="nkf-date">Event date <span class="nk-req">*</span></label><input id="nkf-date" name="eventDate" type="date" required></div>
      <div class="nk-qf-field"><label class="nk-qf-label" for="nkf-start">Start time</label><input id="nkf-start" name="startTime" type="time"></div>
    </div>
    <div class="nk-qf-row">
      <div class="nk-qf-field"><label class="nk-qf-label" for="nkf-end">End time</label><input id="nkf-end" name="endTime" type="time"></div>
      <div class="nk-qf-field"><label class="nk-qf-label" for="nkf-guests">Est. guests / kids</label><input id="nkf-guests" name="guests" type="text" placeholder="e.g. 25 kids"></div>
    </div>
    <div class="nk-qf-field"><label class="nk-qf-label" for="nkf-addr">Event address <span class="nk-req">*</span></label><input id="nkf-addr" name="eventAddress" type="text" required placeholder="Street address"></div>
    <div class="nk-qf-row">
      <div class="nk-qf-field"><label class="nk-qf-label" for="nkf-city">City / town <span class="nk-req">*</span></label><input id="nkf-city" name="city" type="text" required placeholder="e.g. Bridgewater"></div>
      <div class="nk-qf-field"><label class="nk-qf-label" for="nkf-prov">Province</label><input id="nkf-prov" name="province" type="text"></div>
    </div>
    <div class="nk-qf-field"><label class="nk-qf-label" for="nkf-postal">Postal code</label><input id="nkf-postal" name="postalCode" type="text" placeholder="B4V ___"></div>
    <div class="nk-qf-field">
      <label class="nk-qf-label" for="nkf-surface">Setup surface <span class="nk-req">*</span></label>
      <select id="nkf-surface" name="setupSurface" required>
        <option value="">Select surface type</option>
        <option value="Grass">Grass</option>
        <option value="Indoor gym">Indoor gym</option>
        <option value="Concrete or asphalt">Concrete or asphalt</option>
        <option value="Artificial turf">Artificial turf</option>
        <option value="Gravel">Gravel</option>
        <option value="Other">Other</option>
      </select>
    </div>
    <div class="nk-qf-field">
      <label class="nk-qf-label" for="nkf-power">How far is the power outlet from the setup area?</label>
      <select id="nkf-power" name="powerAccess">
        <option value="">Select</option>
        <option value="Under 25 ft">Under 25 ft</option>
        <option value="25–50 ft">25–50 ft</option>
        <option value="Over 50 ft">Over 50 ft</option>
        <option value="No power available">No power available</option>
        <option value="Not sure">Not sure</option>
      </select>
      <p class="nk-field-note">Most inflatables require a dedicated power outlet within 50 ft of the setup area. Final power suitability is confirmed manually.</p>
      <p id="nk-power-flag" class="nk-power-flag" hidden>⚠ Power setup requires manual review.</p>
    </div>
    <div class="nk-qf-field nk-water-field${hasWater ? " show" : ""}">
      <label class="nk-qf-label" for="nkf-water">Water access</label>
      <select id="nkf-water" name="waterAccess">
        <option value="">Select</option>
        <option value="Yes — hose nearby">Yes — hose nearby</option>
        <option value="No / unsure">No / unsure</option>
      </select>
    </div>
    <div class="nk-qf-field"><label class="nk-qf-label" for="nkf-notes">Notes <span class="nk-optional">(Optional)</span></label><textarea id="nkf-notes" name="notes" placeholder="Timing, access, fencing, hills, permit details, or anything else helpful."></textarea></div>
    <div class="nk-disclaimer">${escHtml(DISCLAIMER)}</div>
    <p class="nk-estimate-note" style="margin-top:0.5rem;">${escHtml(WAIVER_NOTE)}</p>
    <button class="nk-qf-submit" type="submit" id="nk-qf-submit-btn">Request Availability</button>
    <div id="nk-form-msg" class="nk-form-msg" hidden></div>
  `;
  sec.appendChild(form);

  // ── Restore saved state ───────────────────────────────────────
  restoreFormState(form);
  updatePowerFlag(form);

  // ── Address-based delivery estimate ──────────────────────────
  // Fires debounced lookup when address or city changes.
  const addrInput = form.querySelector("#nkf-addr");
  const cityInput = form.querySelector("#nkf-city");
  addrInput?.addEventListener("input", () => scheduleDeliveryEstimate(form));
  cityInput?.addEventListener("input",  () => scheduleDeliveryEstimate(form));
  // Re-trigger if address already filled in (panel reopened with saved state)
  if (formState.eventAddress && formState.city) scheduleDeliveryEstimate(form);

  // ── Persist state on every input/change ──────────────────────
  form.addEventListener("input",  () => { captureFormState(form); updatePowerFlag(form); triggerRecalcEstimate(); });
  form.addEventListener("change", () => { captureFormState(form); updatePowerFlag(form); triggerRecalcEstimate(); });

  // ── Live estimate recalculation ───────────────────────────────
  const surfaceSelect = form.querySelector("#nkf-surface");

  function recalcEstimate() {
    const setupEl     = eid("nk-setup-val");
    const attendantEl = eid("nk-attendant-val");
    const totalEl     = eid("nk-total-val");
    if (!setupEl || !totalEl) return;

    const surface = surfaceSelect?.value || "";

    // ── Sandbag — $15/unit for hard surfaces ─────────────────────
    let sandbags      = 0;
    let sandbagManual = false;
    let sandbagNote   = "";
    if (!lawnsOnly && inflatableCount > 0) {
      if (surface === "Grass") {
        // $0 — no note
      } else if (surface === "Indoor gym" || surface === "Concrete or asphalt") {
        sandbags    = inflatableCount * SANDBAG_FEE;
        sandbagNote = inflatableCount + " unit" + (inflatableCount !== 1 ? "s" : "") + " \xd7 $15 anchoring";
      } else if (surface === "Artificial turf" || surface === "Gravel" || surface === "Other") {
        sandbagManual = true;
        sandbagNote   = "anchoring (manual review)";
      } else if (surface === "") {
        sandbagNote = "anchoring (enter surface below)";
      }
    }

    // ── Delivery ──────────────────────────────────────────────────
    let deliveryCost    = 0;
    let deliveryManual  = false;
    let deliverySubText = "";

    if (deliveryState.isPending) {
      // "Looking up…" already set by estimateDeliveryFromAddress — keep it, update total only
    } else if (deliveryState.isManual || deliveryState.distanceKm === null) {
      deliveryManual = true;
    } else {
      const km         = deliveryState.distanceKm;
      const billableKm = Math.max(km - FREE_KM, 0);
      const distFee    = Math.round(billableKm * 2 * RATE_PER_KM * 100) / 100;
      const rtHr       = (deliveryState.durationMinutes * 2) / 60;
      const billableHr = Math.ceil(rtHr / 0.25) * 0.25;
      const staffFee   = Math.round(billableHr * TRAVEL_RATE * 100) / 100;
      deliveryCost     = Math.round((distFee + staffFee) * 100) / 100;
      const fmtHr      = parseFloat(billableHr.toFixed(2)).toString();
      deliverySubText  = "Includes delivery, setup, and staff travel.";
    }

    // ── Combined display ──────────────────────────────────────────
    if (!deliveryState.isPending) {
      if (deliveryManual) {
        if (sandbags > 0) {
          setupEl.textContent = formatMoney(sandbags) + " anchoring est. + delivery (manual review)";
        } else if (sandbagManual) {
          setupEl.textContent = "Delivery & anchoring — manual review after address and setup details";
        } else {
          const suffix = sandbagNote ? " • " + sandbagNote : "";
          setupEl.textContent = "Quoted manually after address review" + suffix;
        }
      } else {
        const combined     = deliveryCost + sandbags;
        const deliveryText = deliveryCost === 0 ? "Free delivery (within 15 km)" : "$" + deliveryCost.toFixed(2) + " delivery";
        let mainText, subText;
        if (sandbags > 0) {
          mainText = "$" + combined.toFixed(2) + " est.";
          subText  = deliveryText + " • " + formatMoney(sandbags) + " anchoring (" + sandbagNote + ")";
        } else if (sandbagManual) {
          mainText = deliveryCost === 0 ? "Free (within 15 km)" : "$" + deliveryCost.toFixed(2) + " est.";
          subText  = (deliverySubText ? deliverySubText + " " : "") + "Anchoring confirmed after setup review.";
        } else {
          mainText = deliveryCost === 0 ? "Free (within 15 km)" : "$" + deliveryCost.toFixed(2) + " est.";
          subText  = deliverySubText || sandbagNote;
        }
        setupEl.innerHTML = escHtml(mainText) +
          (subText ? "<br><small class='nk-delivery-sub'>" + escHtml(subText) + "</small>" : "");
      }
    }

    // ── Attendants ────────────────────────────────────────────────
    let attendantCost = 0;
    let attendantText = "—";
    if (extraState.attendantsWanted) {
      const count = Math.max(1, extraState.attendantCount || 1);
      const hours = Math.max(1, extraState.attendantHours || 1);
      attendantCost = count * hours * ATTENDANT_RATE;
      attendantText = count + " attendant" + (count !== 1 ? "s" : "") + " \xd7 " + hours + " hr" + (hours !== 1 ? "s" : "") + " \xd7 $35 = " + formatMoney(attendantCost) + " est.";
    }
    if (attendantEl) attendantEl.textContent = attendantText;

    // ── 360 Photo Booth time-based pricing ────────────────────────
    var booth360Adj = 0;
    var boothItem = items.find(function(i) { return i.id === BOOTH_360_ID; });
    var hasUKP = items.some(function(i) { return i.id === "pkg-ultimate-kingdom-plus"; });
    var rowEl   = eid("nk-booth360-row");
    var labelEl = eid("nk-booth360-label");
    var priceEl = eid("nk-booth360-price");
    if (boothItem) {
      var startInput = eid("nkf-start"), endInput = eid("nkf-end");
      var st360 = startInput ? startInput.value : "";
      var et360 = endInput ? endInput.value : "";
      var isAddon360 = items.some(function(i) { return i.id !== BOOTH_360_ID && (i.id.startsWith("pkg-") || i.isInflatable !== false); });
      var p360 = calc360Price(st360, et360);
      var base360 = isAddon360 ? BOOTH_360_ADDON : BOOTH_360_STANDALONE;
      if (p360) {
        var computed360 = isAddon360 ? p360.addon : p360.standalone;
        booth360Adj = computed360 - base360;
        if (rowEl)   { rowEl.hidden = false; }
        if (labelEl) { labelEl.textContent = "↳ 360 Booth · " + p360.hours + " hr" + (p360.hours !== 1 ? "s" : "") + (isAddon360 ? " (add-on rate)" : " (standalone)"); }
        if (priceEl) { priceEl.textContent = formatMoney(computed360); }
      } else {
        if (rowEl)   { rowEl.hidden = false; }
        if (labelEl) { labelEl.textContent = "↳ 360 Booth · enter start/end time"; }
        if (priceEl) { priceEl.textContent = "from " + formatMoney(base360) + "/hr"; }
      }
    } else if (hasUKP) {
      if (rowEl)   { rowEl.hidden = false; }
      if (labelEl) { labelEl.textContent = "↳ 360 Photo Booth · 3 hrs included in UKP"; }
      if (priceEl) { priceEl.textContent = "included"; }
    } else {
      if (rowEl) { rowEl.hidden = true; }
    }
    var effectiveSubtotal = subtotal + booth360Adj;
    var subtotalEl = eid("nk-subtotal-val");
    if (subtotalEl) { subtotalEl.textContent = formatMoney(effectiveSubtotal); }

    if (deliveryState.isPending) {
      totalEl.textContent = formatMoney(effectiveSubtotal + sandbags + attendantCost) + " + delivery (pending)";
    } else if (deliveryManual && sandbagManual) {
      totalEl.textContent = formatMoney(effectiveSubtotal + attendantCost) + " + delivery & anchoring (manual)";
    } else if (deliveryManual) {
      totalEl.textContent = formatMoney(effectiveSubtotal + sandbags + attendantCost) + " + delivery (manual)";
    } else if (sandbagManual) {
      totalEl.textContent = formatMoney(effectiveSubtotal + deliveryCost + attendantCost) + " + anchoring (manual)";
    } else {
      totalEl.textContent = formatMoney(effectiveSubtotal + deliveryCost + sandbags + attendantCost);
    }
  }

  _recalcEstimate = recalcEstimate;
  surfaceSelect?.addEventListener("change", recalcEstimate);
  recalcEstimate();

  // ── Form submit ───────────────────────────────────────────────
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector("#nk-qf-submit-btn");
    const msgEl     = form.querySelector("#nk-form-msg");
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Sending…"; }
    if (msgEl)     { msgEl.hidden = true; msgEl.className = "nk-form-msg"; }

    const surface = formState.setupSurface || "";

    // Delivery payload
    const hasDeliveryData = !deliveryState.isManual && !deliveryState.isPending && deliveryState.distanceKm !== null;
    let distFeePayload = 0, staffFeePayload = 0, combinedFeePayload = 0, billableHrPayload = 0;
    if (hasDeliveryData) {
      const billableKm   = Math.max(deliveryState.distanceKm - FREE_KM, 0);
      distFeePayload     = Math.round(billableKm * 2 * RATE_PER_KM * 100) / 100;
      const rtHr         = (deliveryState.durationMinutes * 2) / 60;
      billableHrPayload  = Math.ceil(rtHr / 0.25) * 0.25;
      staffFeePayload    = Math.round(billableHrPayload * TRAVEL_RATE * 100) / 100;
      combinedFeePayload = Math.round((distFeePayload + staffFeePayload) * 100) / 100;
    }

    // Sandbag payload
    let sandbags = 0;
    let sandbagManualPayload = false;
    if (!lawnsOnly && inflatableCount > 0) {
      if (surface === "Indoor gym" || surface === "Concrete or asphalt") {
        sandbags = inflatableCount * SANDBAG_FEE;
      } else if (surface === "Artificial turf" || surface === "Gravel" || surface === "Other") {
        sandbagManualPayload = true;
      }
    }

    const attendantCostFinal = extraState.attendantsWanted
      ? Math.max(1, extraState.attendantCount || 1) * Math.max(1, extraState.attendantHours || 1) * ATTENDANT_RATE
      : 0;
    const totalFinal = subtotal + combinedFeePayload + sandbags + attendantCostFinal;

    const payload = {
      access_key:            W3F_KEY,
      botcheck:              "",
      from_name:             formState.name || "Website Visitor",
      replyto:               formState.email,
      subject:               "New Nova Kingdom Rentals Booking Inquiry",
      business:              "Nova Kingdom Rentals",
      inquiryType:           "Availability request — not a confirmed booking",
      name:                  formState.name,
      email:                 formState.email,
      phone:                 formState.phone,
      eventDate:             formState.eventDate,
      startTime:             formState.startTime,
      endTime:               formState.endTime,
      eventAddress:          formState.eventAddress,
      city:                  formState.city,
      province:              formState.province,
      postalCode:            formState.postalCode,
      setupSurface:          surface,
      powerDistanceToOutlet: formState.powerAccess || "Not provided",
      powerNeedsReview:      POWER_REVIEW_VALUES.has(formState.powerAccess) ? "Yes — requires manual review" : "No",
      waterAccess:           formState.waterAccess,
      guests:                formState.guests,
      notes:                 formState.notes,
      selectedItems:         selectedSummary,
      subtotal:              formatMoney(subtotal),
      // Delivery
      deliveryLookupSource:    hasDeliveryData ? "api" : "manual — api unavailable or address not entered",
      deliveryDistanceKm:      hasDeliveryData ? deliveryState.distanceKm.toFixed(1) + " km" : "Not available",
      deliveryDurationOneWay:  hasDeliveryData ? deliveryState.durationMinutes + " min" : "Not available",
      distanceFeeEstimate:     hasDeliveryData ? (distFeePayload === 0 ? "Free (within 15 km)" : "$" + distFeePayload.toFixed(2)) : "Manual",
      staffTravelFeeEstimate:  hasDeliveryData ? "$" + staffFeePayload.toFixed(2) + " (" + parseFloat(billableHrPayload.toFixed(2)) + " hr round trip \xd7 $25)" : "Manual",
      combinedDeliveryEstimate: hasDeliveryData ? (combinedFeePayload === 0 ? "Free" : "$" + combinedFeePayload.toFixed(2) + " est.") : "Quoted manually after address review",
      // Sandbag
      sandbagUnitCount:    (!lawnsOnly && inflatableCount > 0) ? String(inflatableCount) : "N/A",
      sandbagEstimate:     sandbags > 0
        ? "$" + sandbags.toFixed(2) + " est. (" + inflatableCount + " unit" + (inflatableCount !== 1 ? "s" : "") + " \xd7 $15)"
        : (sandbagManualPayload ? "Manual review required" : (lawnsOnly ? "N/A (lawn games only)" : "Not required (grass)")),
      sandbagManualReview: sandbagManualPayload ? "Yes" : "No",
      // Attendants
      attendantsRequired: extraState.attendantsWanted ? "Yes" : "No / not sure",
      attendantCount:     extraState.attendantsWanted ? String(extraState.attendantCount) : "N/A",
      attendantHours:     extraState.attendantsWanted ? String(extraState.attendantHours) : "N/A",
      attendantEstimate:  extraState.attendantsWanted ? formatMoney(attendantCostFinal) + " est." : "N/A",
      estimatedTotal:     hasDeliveryData
        ? formatMoney(totalFinal)
        : formatMoney(subtotal + sandbags + attendantCostFinal) + (deliveryState.isPending ? " + delivery (pending)" : " + delivery (manual)"),
      disclaimer: DISCLAIMER,
    };

    try {
      console.log("[NKR quote-cart] submitting to Web3Forms", { hasAccessKey: !!payload.access_key, keys: Object.keys(payload).filter(k => k !== "access_key") });
      const res  = await fetch("https://api.web3forms.com/submit", {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      console.log("[NKR quote-cart] status", res.status, data);
      if (!res.ok || !data.success) throw new Error(data.message || "Submission failed");
      if (msgEl) { msgEl.hidden = false; msgEl.className = "nk-form-msg success"; msgEl.textContent = "Request sent! We’ll review your details and follow up shortly."; }
      if (submitBtn) submitBtn.textContent = "Sent!";
      form.reset();
      clearFormState();
      clearExtraState();
      saveCart([]);
      updateBar();
    } catch (err) {
      console.error("[NKR quote-cart] Web3Forms submission failed:", err && err.message ? err.message : err);
      if (msgEl) { msgEl.hidden = false; msgEl.className = "nk-form-msg error"; msgEl.textContent = "Form service error" + (err && err.message ? ": " + err.message : "") + ". Please call/text 902-990-0005."; }
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Request Availability"; }
    }
  });

  return sec;
}

// Shows/hides the power manual-review flag based on current select value
function updatePowerFlag(form) {
  const powerEl = form.querySelector("[name='powerAccess']");
  const flagEl  = form.querySelector("#nk-power-flag");
  if (!powerEl || !flagEl) return;
  flagEl.hidden = !POWER_REVIEW_VALUES.has(powerEl.value);
}

// ── Card enhancement ─────────────────────────────────────────────

function hideCheckAvailabilityLinks(container) {
  container.querySelectorAll("a, button").forEach((el) => {
    if (el.textContent.trim() === "Check Availability") {
      el.style.display = "none";
      el.setAttribute("aria-hidden", "true");
    }
  });
}

function enhanceProductCards() {
  document.querySelectorAll(".product-card:not(.lawn-feature-card):not([data-nk-enhanced])").forEach((card) => {
    card.dataset.nkEnhanced = "1";
    const name    = card.querySelector("h3")?.textContent?.trim();
    const priceEl = card.querySelector(".product-body strong") || card.querySelector("strong");
    const id      = name ? "product-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-") : null;
    if (!name || !priceEl || !id) return;
    const price = parsePrice(priceEl.textContent);
    if (!price) return;
    injectAddBtn(card, id, name, price, id !== BOOTH_360_ID, card.querySelector(".button, a"), {});
    hideCheckAvailabilityLinks(card);
  });
}

function enhancePackageCards() {
  document.querySelectorAll(".package-card:not([data-nk-enhanced])").forEach((card) => {
    card.dataset.nkEnhanced = "1";
    const name    = card.querySelector("h3")?.textContent?.trim();
    const priceEl = card.querySelector("strong");
    const id      = name ? "pkg-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-") : null;
    if (!name || !priceEl || !id) return;
    const price = parsePrice(priceEl.textContent);
    if (!price) return;

    const includedText   = Array.from(card.querySelectorAll("p")).map((p) => p.textContent).join(" ");
    const includesLawnGames = /5\s*lawn\s*games?/i.test(includedText);

    injectAddBtn(card, id, name, price, true,
      card.querySelector("[data-package-detail-button], .button, a"),
      { includesLawnGames });

    hideCheckAvailabilityLinks(card);
  });
}

function enhanceCarnivalAddonBtns() {
  document.querySelectorAll("[data-nk-carnival-addon]:not([data-nk-ca-enhanced])").forEach((card) => {
    card.dataset.nkCaEnhanced = "1";
    injectAddBtn(card, CROWN_CARNIVAL_ID, "Crown Carnival Challenge", CROWN_CARNIVAL_ADDON, true, null, {});
  });
}

function enhanceLawnGameCards() {
  document.querySelectorAll(".lawn-game-card:not([data-nk-lg-enhanced])").forEach((card) => {
    card.dataset.nkLgEnhanced = "1";
    const name = card.querySelector("h3")?.textContent?.trim();
    if (!name) return;
    const slug  = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const id    = LG_GAME_ID_PREFIX + slug;
    const price = LG_INDIVIDUAL_PRICES[slug] ?? 25;
    const existingCta = card.querySelector(".button-dark, .button, a");
    const priceEl = document.createElement("p");
    priceEl.className   = "nk-lg-card-price";
    priceEl.textContent = "$" + price;
    if (existingCta) { existingCta.insertAdjacentElement("beforebegin", priceEl); }
    else             { card.appendChild(priceEl); }
    injectAddBtn(card, id, name, price, false, existingCta, {});
    hideCheckAvailabilityLinks(card);
  });
}

function enhanceProductDetail() {
  const hero = document.querySelector(".product-detail-hero:not([data-nk-enhanced])");
  if (!hero) return;
  hero.dataset.nkEnhanced = "1";
  const name    = hero.querySelector("h1")?.textContent?.trim();
  const priceEl = hero.querySelector(".detail-meta span");
  const id      = name ? "product-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-") : null;
  if (!name || !priceEl || !id) return;
  const price = parsePrice(priceEl.textContent);
  if (!price) return;
  injectAddBtn(hero, id, name, price, id !== BOOTH_360_ID,
    hero.querySelector(".button-row, .button, a"), {});
  hideCheckAvailabilityLinks(hero);
}

function injectAddBtn(container, id, name, price, isInflatable, insertBefore, meta) {
  if (container.querySelector(".nk-add-to-quote")) return;

  const cart       = loadCart();
  const included   = getIncludedProductIds(cart);
  const inCart     = cart.some((i) => i.id === id);
  const includedIn = included[id];
  const coveredBy  = !includedIn && id.startsWith("pkg-") ? getCoveringPackage(id, cart) : null;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.dataset.nkId = id;

  if (includedIn || coveredBy) {
    btn.className   = "nk-add-to-quote in-cart";
    btn.textContent = includedIn ? "Included in package" : "Already covered by your package";
    btn.disabled    = true;
  } else {
    btn.className   = "nk-add-to-quote" + (inCart ? " in-cart" : "");
    btn.textContent = inCart ? "In Quote ✓" : "Add to Quote";
  }

  btn.addEventListener("click", () => {
    let currentCart   = loadCart();
    const currIncluded = getIncludedProductIds(currentCart);
    if (currIncluded[id]) return;
    if (id.startsWith("pkg-") && getCoveringPackage(id, currentCart)) return;

    const nowIn = currentCart.some((i) => i.id === id);
    if (nowIn) {
      saveCart(currentCart.filter((i) => i.id !== id));
    } else {
      if (meta?.includesLawnGames) {
        currentCart = currentCart.filter((i) => i.id !== "lg-5" && i.id !== "lg-10" && i.id !== "lg-12");
      }
      const pkgIncluded = PKG_INCLUDED_PRODUCTS[id];
      if (pkgIncluded) {
        currentCart = currentCart.filter((i) => !pkgIncluded.has(i.id));
        pkgIncluded.forEach((pid) => {
          const transitive = PRODUCT_COVERS[pid];
          if (transitive) currentCart = currentCart.filter((i) => !transitive.has(i.id));
        });
      }
      const productCovers = PRODUCT_COVERS[id];
      if (productCovers) {
        const coveringSet = new Set([id, ...productCovers]);
        const coveredItems = currentCart.filter((i) => productCovers.has(i.id));
        const coveredPkgs = currentCart.filter((i) => {
          if (!i.id.startsWith("pkg-")) return false;
          const eff = effectiveProductSet(i.id);
          return eff && eff.size > 0 && [...eff].every((pid) => coveringSet.has(pid));
        });
        const allCovered = [...coveredItems, ...coveredPkgs];
        if (allCovered.length > 0) {
          const names = allCovered.map((p) => p.name).join(", ");
          setRemovedNote("Removed overlapping item" + (allCovered.length > 1 ? "s" : "") + " to avoid double-charging: " + names + ".");
          const coveredIds = new Set(allCovered.map((p) => p.id));
          currentCart = currentCart.filter((i) => !coveredIds.has(i.id));
        }
      }
      if (id.startsWith("pkg-")) {
        const covered = getCoveredPackages(id, currentCart);
        if (covered.length > 0) {
          const names = covered.map((p) => p.name).join(", ");
          setRemovedNote("Removed overlapping package" + (covered.length > 1 ? "s" : "") + " to avoid double-charging: " + names + ".");
          const coveredIds = new Set(covered.map((p) => p.id));
          currentCart = currentCart.filter((i) => !coveredIds.has(i.id));
        }
      }
      let actualPrice = price;
      if (id === CROWN_CARNIVAL_ID) {
        actualPrice = currentCart.some((i) => i.id.startsWith("pkg-")) ? CROWN_CARNIVAL_ADDON : CROWN_CARNIVAL_STANDALONE;
      } else if (id === BOOTH_360_ID) {
        actualPrice = currentCart.some((i) => i.id.startsWith("pkg-")) ? BOOTH_360_ADDON : BOOTH_360_STANDALONE;
      }
      const cartIsInflatable = id === BOOTH_360_ID ? false : isInflatable;
      currentCart.push({ id, name, price: actualPrice, isInflatable: cartIsInflatable, ...meta });
      saveCart(currentCart);
    }
    saveCart(normalizeCarnivalPrice(loadCart()));

    const afterCart    = loadCart();
    const afterIncluded = getIncludedProductIds(afterCart);
    const afterCovered  = afterIncluded[id] ? null : (id.startsWith("pkg-") ? getCoveringPackage(id, afterCart) : null);
    if (afterIncluded[id]) {
      btn.textContent = "Included in package";   btn.classList.add("in-cart"); btn.disabled = true;
    } else if (afterCovered) {
      btn.textContent = "Already covered by your package"; btn.classList.add("in-cart"); btn.disabled = true;
    } else {
      const after = afterCart.some((i) => i.id === id);
      btn.textContent = after ? "In Quote ✓" : "Add to Quote";
      btn.classList.toggle("in-cart", after);
      btn.disabled = false;
    }
    updateBar();
  });

  if (insertBefore) { insertBefore.insertAdjacentElement("beforebegin", btn); }
  else              { container.appendChild(btn); }
}

// ── Photo Booth section cleanup on non-rentals routes ───────────
// React CSR reconciliation does NOT remove externally-injected siblings when
// the route changes. We must remove #nk-photo-booth-section ourselves whenever
// the user navigates away from /rentals, so it never persists on FAQ/About/etc.
function cleanupPhotBoothSection() {
  if (window.location.pathname.match(/^\/rentals\/?$/)) return;
  const section = document.getElementById("nk-photo-booth-section");
  if (section) section.remove();
  // Clear processed markers so the section can be re-injected on the next /rentals visit
  document.querySelectorAll("[data-nk-booth-processed]").forEach(function (el) {
    el.removeAttribute("data-nk-booth-processed");
  });
}

// ── Desktop nav — inject Photo Booth link after Lawn Games ───────
function injectDesktopPhotBoothNav() {
  const nav = document.querySelector('nav[aria-label="Primary navigation"]');
  if (!nav || nav.querySelector("[data-nk-pb-nav]")) return;
  let lawnGamesAnchor = null;
  nav.querySelectorAll("a").forEach(function (a) {
    if (a.textContent.trim() === "Lawn Games") lawnGamesAnchor = a;
  });
  if (!lawnGamesAnchor) return;
  const link = document.createElement("a");
  link.href = "/rentals/360-video-booth";
  link.textContent = "Photo Booth";
  link.dataset.nkPbNav = "1";
  if (window.location.pathname.startsWith("/rentals/360-video-booth")) {
    link.setAttribute("aria-current", "page");
  }
  lawnGamesAnchor.insertAdjacentElement("afterend", link);
}

// ── 360 Photo Booth section injection ───────────────────────────
// The compiled React app groups all non-Game products into "All Inflatables".
// This function moves the 360 booth card out of that grid and into its own
// "Photo Booth" section injected after the Interactive Games lineup section.

const BOOTH_IMG_PATH = "/images/360-video-booth.jpg";

function injectPhotBoothSection() {
  // Only run on the rentals listing page, not detail pages or any other route
  if (!window.location.pathname.match(/^\/rentals\/?$/)) return;

  const lineupSections = document.querySelectorAll(".lineup-section:not([data-nk-booth-processed])");
  if (!lineupSections.length) return;

  // Find and hide 360 booth cards inside any lineup section
  let boothCard = null;
  document.querySelectorAll(".lineup-section .product-card").forEach((card) => {
    const img = card.querySelector("img");
    if (img && img.src.includes("360-video-booth")) {
      boothCard = card.cloneNode(true);
      card.closest(".product-card") && (card.style.display = "none");
    }
  });

  // Only inject section once
  if (document.getElementById("nk-photo-booth-section")) return;
  if (!boothCard) return;

  // Find the last lineup section to insert after it
  const lastLineup = [...lineupSections].pop();
  if (!lastLineup) return;

  // Build the Photo Booth section
  const section = document.createElement("section");
  section.id = "nk-photo-booth-section";
  section.className = "page-section lineup-section nk-photo-booth-section";
  section.innerHTML =
    '<div class="section-heading">' +
      '<p class="eyebrow">Photo Booth Experiences</p>' +
      '<h2>360 Photo Booth</h2>' +
    '</div>' +
    '<div class="nk-photo-booth-inner"></div>';

  const inner = section.querySelector(".nk-photo-booth-inner");

  // Build a dedicated booth card (not relying on React's card markup)
  const card = document.createElement("article");
  card.className = "nk-booth-feature-card";
  card.innerHTML =
    '<div class="nk-booth-img-wrap">' +
      '<img src="' + BOOTH_IMG_PATH + '" alt="360 Photo Booth rental Nova Scotia" loading="lazy">' +
    '</div>' +
    '<div class="nk-booth-info">' +
      '<p class="eyebrow">Photo Booth Experiences</p>' +
      '<h3>360 Photo Booth</h3>' +
      '<p class="nk-booth-tagline">Capture Every Angle, Keep Every Memory</p>' +
      '<ul class="nk-booth-pricing">' +
        '<li><strong>Standalone:</strong> 1 hr $250 · each additional hr $125</li>' +
        '<li><strong>Add-on with any package:</strong> 1 hr $175 · each additional hr $100</li>' +
        '<li>Setup &amp; takedown included</li>' +
        '<li>Basic props may be included</li>' +
      '</ul>' +
      '<div class="nk-booth-btns">' +
        '<a class="button button-dark nk-booth-detail-btn" href="/rentals/360-video-booth">View Details</a>' +
        '<a class="button button-gold" href="/contact?interest=360+Photo+Booth">Check Availability</a>' +
      '</div>' +
    '</div>';

  // Inject "Add to Quote" button
  const btnWrap = card.querySelector(".nk-booth-btns");
  const qtBtn = document.createElement("button");
  qtBtn.type = "button";
  qtBtn.dataset.nkId = BOOTH_360_ID;
  const cartNow = loadCart();
  const inCart  = cartNow.some((i) => i.id === BOOTH_360_ID);
  qtBtn.className = "nk-add-to-quote" + (inCart ? " in-cart" : "");
  qtBtn.textContent = inCart ? "In Quote ✓" : "Add to Quote";
  qtBtn.addEventListener("click", () => {
    const current = loadCart();
    const nowIn   = current.some((i) => i.id === BOOTH_360_ID);
    if (nowIn) {
      saveCart(current.filter((i) => i.id !== BOOTH_360_ID));
    } else {
      const hasPkg = current.some((i) => i.id.startsWith("pkg-"));
      const price  = hasPkg ? BOOTH_360_ADDON : BOOTH_360_STANDALONE;
      current.push({ id: BOOTH_360_ID, name: "360 Photo Booth", price, isInflatable: false });
      saveCart(normalizeCarnivalPrice(current));
    }
    const after = loadCart().some((i) => i.id === BOOTH_360_ID);
    qtBtn.textContent = after ? "In Quote ✓" : "Add to Quote";
    qtBtn.classList.toggle("in-cart", after);
    updateBar();
  });
  btnWrap.insertAdjacentElement("afterbegin", qtBtn);

  inner.appendChild(card);
  lastLineup.insertAdjacentElement("afterend", section);

  // Mark processed so we don't run again
  lineupSections.forEach((s) => s.setAttribute("data-nk-booth-processed", "1"));
}

// ── 360 Booth detail page — remove hardcoded inflatable template fields ─
function cleanupBoothDetailPage() {
  if (!window.location.pathname.match(/^\/rentals\/360-video-booth\/?/)) return;

  // Hide inflatable-specific rows from the facts-grid (Dimensions, Rental duration, Delivery note)
  const HIDE_LABELS = new Set(["Dimensions", "Rental duration", "Delivery note"]);
  document.querySelectorAll(".facts-grid article:not([data-nk-hidden])").forEach((article) => {
    const label = article.querySelector("span")?.textContent?.trim();
    if (label && HIDE_LABELS.has(label)) {
      article.style.display = "none";
      article.dataset.nkHidden = "1";
    }
  });

  // Hide hardcoded setup/safety notes appended by the template
  const HIDE_NOTES = new Set([
    "Water source required only for wet-use units",
    "Adult supervision required at all times",
    "Travel calculated from Bridgewater",
  ]);
  document.querySelectorAll(".page-section.cream .notes-grid article:not([data-nk-hidden])").forEach((article) => {
    const text = article.textContent?.trim();
    if (text && HIDE_NOTES.has(text)) {
      article.style.display = "none";
      article.dataset.nkHidden = "1";
    }
  });
}

// ── Kids Foam Party section cleanup on non-rentals routes ────────
function cleanupFoamPartySection() {
  if (window.location.pathname.match(/^\/rentals\/?$/)) return;
  const section = document.getElementById("nk-foam-party-section");
  if (section) section.remove();
  document.querySelectorAll("[data-nk-foam-processed]").forEach(function (el) {
    el.removeAttribute("data-nk-foam-processed");
  });
}

// ── Kids Foam Party section injection ────────────────────────────
// Pulls the foam party card out of the React-rendered grid and injects
// its own featured section with tiered pricing after the Photo Booth section.
const FOAM_IMG_PATH = "/images/kids-foam-party.jpg";

function injectFoamPartySection() {
  if (!window.location.pathname.match(/^\/rentals\/?$/)) return;
  if (document.getElementById("nk-foam-party-section")) return;

  const lineupSections = document.querySelectorAll(".lineup-section");
  if (!lineupSections.length) return;

  // Hide the foam party card inside the React grid
  document.querySelectorAll(".lineup-section .product-card").forEach((card) => {
    const img = card.querySelector("img");
    if (img && img.src.includes("kids-foam-party")) {
      card.style.display = "none";
    }
  });

  // Insert after the photo booth section if present, otherwise after last lineup section
  const anchorSection =
    document.getElementById("nk-photo-booth-section") ||
    [...lineupSections].pop();
  if (!anchorSection) return;

  const section = document.createElement("section");
  section.id = "nk-foam-party-section";
  section.className = "page-section lineup-section nk-foam-party-section";
  section.innerHTML =
    '<div class="section-heading">' +
      '<p class="eyebrow">Foam Party</p>' +
      '<h2>Kids Foam Party</h2>' +
    '</div>' +
    '<div class="nk-foam-inner"></div>';

  const inner = section.querySelector(".nk-foam-inner");

  const card = document.createElement("article");
  card.className = "nk-booth-feature-card";

  const tierRows = FOAM_TIERS.map(function (t) {
    return (
      "<li><strong>" + t.label + ":</strong> Standalone $" + t.standalone +
      " · Add-on $" + t.addon + "</li>"
    );
  }).join("");

  card.innerHTML =
    '<div class="nk-booth-img-wrap">' +
      '<img src="' + FOAM_IMG_PATH + '" alt="Kids Foam Party rental Nova Scotia" loading="lazy">' +
    '</div>' +
    '<div class="nk-booth-info">' +
      '<p class="eyebrow">Foam Party · Kids &amp; Family Only</p>' +
      '<h3>Kids Foam Party</h3>' +
      '<p class="nk-booth-tagline">High-Energy Foam Fun for Kids</p>' +
      '<ul class="nk-booth-pricing">' +
        tierRows +
        '<li>Setup &amp; takedown included · Outdoor only · Water &amp; power required</li>' +
        '<li>Kid-safe, non-toxic foam · Ages 3–14 · Not for adult or alcohol events</li>' +
      '</ul>' +
      '<div class="nk-booth-btns">' +
        '<a class="button button-dark nk-booth-detail-btn" href="/rentals/kids-foam-party">View Details</a>' +
        '<a class="button button-gold" href="/contact?interest=Kids+Foam+Party">Check Availability</a>' +
      '</div>' +
    '</div>';

  // Add to Quote button — uses base price of smallest standalone tier
  const btnWrap = card.querySelector(".nk-booth-btns");
  const qtBtn = document.createElement("button");
  qtBtn.type = "button";
  qtBtn.dataset.nkId = FOAM_PARTY_ID;
  const cartNow = loadCart();
  const inCart  = cartNow.some(function (i) { return i.id === FOAM_PARTY_ID; });
  qtBtn.className = "nk-add-to-quote" + (inCart ? " in-cart" : "");
  qtBtn.textContent = inCart ? "In Quote ✓" : "Add to Quote";
  qtBtn.addEventListener("click", function () {
    const current = loadCart();
    const nowIn   = current.some(function (i) { return i.id === FOAM_PARTY_ID; });
    if (nowIn) {
      saveCart(current.filter(function (i) { return i.id !== FOAM_PARTY_ID; }));
    } else {
      const hasPkg = current.some(function (i) { return i.id.startsWith("pkg-") || i.isInflatable; });
      const price  = hasPkg ? FOAM_TIERS[0].addon : FOAM_TIERS[0].standalone;
      current.push({ id: FOAM_PARTY_ID, name: "Kids Foam Party", price, isInflatable: false });
      saveCart(current);
    }
    const after = loadCart().some(function (i) { return i.id === FOAM_PARTY_ID; });
    qtBtn.textContent = after ? "In Quote ✓" : "Add to Quote";
    qtBtn.classList.toggle("in-cart", after);
    updateBar();
  });
  btnWrap.insertAdjacentElement("afterbegin", qtBtn);

  inner.appendChild(card);
  anchorSection.insertAdjacentElement("afterend", section);

  lineupSections.forEach(function (s) { s.setAttribute("data-nk-foam-processed", "1"); });
}

function enhanceAll() {
  cleanupPhotBoothSection();
  cleanupFoamPartySection();
  enhanceProductCards();
  enhancePackageCards();
  enhanceProductDetail();
  enhanceLawnGameCards();
  enhanceCarnivalAddonBtns();
  injectPhotBoothSection();
  injectFoamPartySection();
  cleanupBoothDetailPage();
  injectDesktopPhotBoothNav();
}

// ── Init (idempotent, runs once) ─────────────────────────────────
function init() {
  try {
    if (window.NovaQuoteCartInitialized) return;
    window.NovaQuoteCartInitialized = true;

    buildBar();
    buildPanel();
    updateBar();
    enhanceAll();

    let observerBusy = false;
    const observer = new MutationObserver(() => {
      if (observerBusy) return;
      observerBusy = true;
      requestAnimationFrame(() => { enhanceAll(); observerBusy = false; });
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const scheduleEnhance = () => setTimeout(enhanceAll, 100);
    window.addEventListener("popstate", scheduleEnhance);
    if (!window.NovaQuoteCartHistoryPatched) {
      window.NovaQuoteCartHistoryPatched = true;
      ["pushState", "replaceState"].forEach((method) => {
        const orig = history[method];
        history[method] = function (...args) {
          const result = orig.apply(this, args);
          scheduleEnhance();
          return result;
        };
      });
    }
  } catch (err) {
    console.error("Nova Quote Cart failed:", err);
  }
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
}
