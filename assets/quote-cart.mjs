/* Nova Kingdom Rentals — Quote Cart v20260519-deliveryfix
   Availability request only. No payment. No confirmed booking.
   Changes vs rushfix:
   - effectiveProductSet() expands PKG_INCLUDED_PRODUCTS via PRODUCT_COVERS before
     package-to-package comparison, so packages containing Rush 42 correctly block
     packages that include Cascade or Quest
   - isPkgCoveredBy() now uses effectiveProductSet() for both sides
   - Sandbag unit counting unchanged (Rush 42 = 1 physical unit)
*/

console.info("Nova Quote Cart loaded");
window.NovaQuoteCartLoaded = true;

// ── Constants ────────────────────────────────────────────────────
const CART_KEY    = "nk_quote_v1";
const W3F_KEY     = "909ed8f7-78ca-494f-b960-1713b60bc012";
const FREE_KM     = 15;
const RATE_PER_KM = 0.72;
const SANDBAG_FEE = 25;

// Crown Carnival Challenge: dynamic pricing based on whether a package is in cart
const CROWN_CARNIVAL_ID         = "product-crown-carnival-challenge";
const CROWN_CARNIVAL_STANDALONE = 270;
const CROWN_CARNIVAL_ADDON      = 200;

// Extra display metadata for specific cart items (thumbnail + subtitle in cart panel)
const CART_ITEM_META = {
  [CROWN_CARNIVAL_ID]: {
    image:      "/images/crown carnival challenge.jpeg",
    subtitle:   "Basketball shoot · Elephant toss · Tic Tac Toe · On-point target game",
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
  "pkg-ultimate-kingdom": new Set(["product-crown-rush-42", "product-crown-climber", "product-crown-island-combo", "product-crown-dino-combo", "product-crown-axe-challenge", "product-crown-kick-darts"]),
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

// Staff travel estimate: $25/hr round-trip, confirmed manually
const TRAVEL_RATE = 25;
const TRAVEL_OPTIONS = [
  { value: "local",  label: "Local / under 30 min",    cost: 0    },
  { value: "1hr",    label: "1 hour round trip",        cost: 25   },
  { value: "2hr",    label: "2 hours round trip",       cost: 50   },
  { value: "3hr",    label: "3 hours round trip",       cost: 75   },
  { value: "manual", label: "4+ hours — manual quote",  cost: null },
];

// Event attendants: $35/hr per person, confirmed manually
const ATTENDANT_RATE = 35;

// Extra estimate state — persists across renderPanel calls like formState
const extraState = {
  travelOption:     "",    // one of TRAVEL_OPTIONS values or ""
  attendantsWanted: false,
  attendantCount:   1,
  attendantHours:   4,
};

function clearExtraState() {
  extraState.travelOption     = "";
  extraState.attendantsWanted = false;
  extraState.attendantCount   = 1;
  extraState.attendantHours   = 4;
}

// Live reference to the active recalcEstimate closure so staff/attendant sections
// can trigger a recalc without being inside makeFormSection.
let _recalcEstimate = null;
function triggerRecalcEstimate() { if (_recalcEstimate) _recalcEstimate(); }

const WATER_RE = /water|cascade|island combo|rush|splash/i;

// ── Form state (persists across renderPanel calls) ───────────────
const formState = {
  name: "", email: "", phone: "",
  eventDate: "", startTime: "", endTime: "",
  eventAddress: "", city: "", province: "Nova Scotia",
  postalCode: "", kmFromBridgewater: "", setupSurface: "",
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
    // Products included in a package
    const pkgSet = PKG_INCLUDED_PRODUCTS[item.id];
    if (pkgSet) {
      pkgSet.forEach((pid) => {
        map[pid] = item.name;
        // Transitive: if this included product functionally covers others, block those too
        const transitive = PRODUCT_COVERS[pid];
        if (transitive) transitive.forEach((tpid) => { if (!map[tpid]) map[tpid] = item.name; });
      });
    }
    // Standalone product that functionally covers others (e.g. Rush 42 → Cascade + Quest)
    const covers = PRODUCT_COVERS[item.id];
    if (covers) covers.forEach((pid) => { if (!map[pid]) map[pid] = item.name; });
  }
  return map;
}

// Corrects Crown Carnival Challenge price: $200 when any package is in cart, $270 standalone
function normalizeCarnivalPrice(cart) {
  const hasPkg = cart.some((i) => i.id.startsWith("pkg-"));
  return cart.map((i) =>
    i.id === CROWN_CARNIVAL_ID
      ? { ...i, price: hasPkg ? CROWN_CARNIVAL_ADDON : CROWN_CARNIVAL_STANDALONE }
      : i
  );
}

// Expands a package's product set by applying PRODUCT_COVERS.
// e.g. Royal All-Star includes Rush 42, so its effective set also includes Cascade + Quest.
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

// Returns name of first cart item (package or standalone product) that fully covers pkgId, or null.
// Standalone products: checked via PRODUCT_COVERS (e.g. Rush 42 standalone covers Cascade Starter pkg).
function getCoveringPackage(pkgId, cart) {
  const pkgEff = effectiveProductSet(pkgId);
  if (!pkgEff || pkgEff.size === 0) return null;
  for (const item of cart) {
    if (item.id === pkgId) continue;
    // Larger package covering this one
    if (item.id.startsWith("pkg-") && isPkgCoveredBy(pkgId, item.id)) return item.name;
    // Standalone product whose PRODUCT_COVERS set covers all products in this package
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

  // Normalize carnival price whenever cart changes, even if panel is closed
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

    // Normalize carnival price and persist if needed
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

  // One-time note after an overlapping package was auto-removed
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
      sub.textContent = (hasPkg && meta.addonLabel ? meta.addonLabel + " · " : "") + meta.subtitle;
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
  const hasCornholeAddon = cartIds.has("lg-cornhole-addon");

  const sec = document.createElement("section");

  // ── Main package grid title ──────────────────────────────────
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

  // ── Package buttons ──────────────────────────────────────────
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
    // 12-game package covers all individual games — remove them to avoid double-charging
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

  // ── Cornhole add-on (+$25) for 5- or 10-game package ────────
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
    "<tr><td>Subtotal</td><td>" + escHtml(formatMoney(subtotal)) + "</td></tr>" +
    "<tr><td>Delivery estimate <span class='nk-tooltip-wrap'>" +
      "<button class='nk-tooltip-icon' type='button' aria-label='About delivery estimate'>ⓘ</button>" +
      "<span class='nk-tooltip-body'>Delivery estimate may include distance-based travel and staff travel time. Final delivery and travel costs are confirmed manually after reviewing the event address.</span>" +
    "</span></td><td id='nk-delivery-val'>Enter km or select travel time below</td></tr>" +
    "<tr><td>Sandbag anchoring estimate</td><td id='nk-sandbag-val'>" + (lawnsOnly ? "N/A" : "Enter surface below") + "</td></tr>" +
    "<tr><td>Event attendant estimate</td><td id='nk-attendant-val'>—</td></tr>" +
    "<tr class='total'><td>Estimated total</td><td id='nk-total-val'>" + escHtml(formatMoney(subtotal)) + "</td></tr>";
  // Tooltip toggle for tap/click on mobile
  const tooltipIcon = tbl.querySelector(".nk-tooltip-icon");
  const tooltipBody = tbl.querySelector(".nk-tooltip-body");
  if (tooltipIcon && tooltipBody) {
    tooltipIcon.addEventListener("click", (e) => {
      e.stopPropagation();
      tooltipBody.classList.toggle("visible");
    });
    document.addEventListener("click", () => tooltipBody.classList.remove("visible"));
  }
  sec.appendChild(tbl);
  const note = document.createElement("p"); note.className = "nk-estimate-note";
  note.textContent = "Final costs confirmed after address and setup review. Sandbag fee applies to inflatables on non-grass surfaces. Attendant needs confirmed based on event type and equipment.";
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
    <div class="nk-qf-row">
      <div class="nk-qf-field"><label class="nk-qf-label" for="nkf-postal">Postal code</label><input id="nkf-postal" name="postalCode" type="text" placeholder="B4V ___"></div>
      <div class="nk-qf-field"><label class="nk-qf-label" for="nkf-km">Approx. km from Bridgewater</label><input id="nkf-km" name="kmFromBridgewater" type="number" min="0" step="1" placeholder="blank = quoted manually"></div>
    </div>
    <div id="nk-travel-slot" style="margin-top:0.75rem;margin-bottom:0.75rem;"></div>
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
    <div class="nk-qf-field"><label class="nk-qf-label" for="nkf-notes">Notes</label><textarea id="nkf-notes" name="notes" placeholder="Timing, access, fencing, hills, permit details, or anything else helpful."></textarea></div>
    <div class="nk-disclaimer">${escHtml(DISCLAIMER)}</div>
    <p class="nk-estimate-note" style="margin-top:0.5rem;">${escHtml(WAIVER_NOTE)}</p>
    <button class="nk-qf-submit" type="submit" id="nk-qf-submit-btn">Request Availability</button>
    <div id="nk-form-msg" class="nk-form-msg" hidden></div>
  `;
  sec.appendChild(form);

  // ── Restore saved state ───────────────────────────────────────
  restoreFormState(form);
  updatePowerFlag(form);

  // ── Travel selector (inside Delivery section) ─────────────────
  const travelSlot = form.querySelector("#nk-travel-slot");
  if (travelSlot) {
    const travelLabel = document.createElement("p");
    travelLabel.className = "nk-qf-label";
    travelLabel.style.cssText = "margin:0 0 0.4rem;";
    travelLabel.textContent = "Staff round-trip travel time";
    travelSlot.appendChild(travelLabel);

    const travelGrid = document.createElement("div"); travelGrid.className = "nk-lg-grid";
    TRAVEL_OPTIONS.forEach((opt) => {
      const btn = document.createElement("button"); btn.type = "button";
      btn.className = "nk-lg-btn" + (extraState.travelOption === opt.value ? " selected" : "");
      btn.setAttribute("data-travel-val", opt.value);
      const n = document.createElement("span"); n.className = "nk-lg-btn-name"; n.textContent = opt.label;
      const p = document.createElement("span"); p.className = "nk-lg-btn-price";
      p.textContent = opt.cost === null ? "Manual quote" : (opt.cost === 0 ? "No charge" : formatMoney(opt.cost) + " est.");
      btn.appendChild(n); btn.appendChild(p);
      travelGrid.appendChild(btn);
    });
    travelGrid.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-travel-val]");
      if (!btn) return;
      const val = btn.dataset.travelVal;
      extraState.travelOption = extraState.travelOption === val ? "" : val;
      travelGrid.querySelectorAll("[data-travel-val]").forEach((b) => {
        b.classList.toggle("selected", b.dataset.travelVal === extraState.travelOption);
      });
      triggerRecalcEstimate();
    });
    travelSlot.appendChild(travelGrid);

    const travelNote = document.createElement("p"); travelNote.className = "nk-estimate-note";
    travelNote.style.marginTop = "0.4rem";
    travelNote.textContent = "Staff travel is estimated at $25/hour and confirmed manually after reviewing the event address.";
    travelSlot.appendChild(travelNote);
  }

  // ── Persist state on every input/change ──────────────────────
  form.addEventListener("input",  () => { captureFormState(form); updatePowerFlag(form); });
  form.addEventListener("change", () => { captureFormState(form); updatePowerFlag(form); });

  // ── Live estimate recalculation ───────────────────────────────
  const kmInput       = form.querySelector("#nkf-km");
  const surfaceSelect = form.querySelector("#nkf-surface");

  function recalcEstimate() {
    const deliveryEl  = eid("nk-delivery-val");
    const sandbagEl   = eid("nk-sandbag-val");
    const attendantEl = eid("nk-attendant-val");
    const totalEl     = eid("nk-total-val");
    if (!deliveryEl || !sandbagEl || !totalEl) return;

    const km      = parseFloat(kmInput?.value) || null;
    const surface = surfaceSelect?.value || "";

    // Distance component
    const distCost = km !== null ? (km <= FREE_KM ? 0 : Math.round((km - FREE_KM) * RATE_PER_KM)) : null;

    // Travel component
    const travelOpt    = extraState.travelOption ? TRAVEL_OPTIONS.find((o) => o.value === extraState.travelOption) : null;
    const travelCostVal = travelOpt ? travelOpt.cost : null; // null = manual quote selected

    // Combined delivery
    let deliveryCost = 0;
    let deliveryText;
    let deliveryManual = false;

    if (travelOpt && travelCostVal === null) {
      deliveryManual = true;
      deliveryText   = "Quoted manually after address review";
      deliveryCost   = distCost ?? 0;
    } else if (distCost === null && !travelOpt) {
      deliveryText = "Enter km or select travel time below";
    } else {
      deliveryCost = (distCost ?? 0) + (travelCostVal ?? 0);
      if (deliveryCost === 0) {
        if (distCost === 0 && travelCostVal === 0) deliveryText = "Free (within 15 km, local travel)";
        else if (distCost === 0)                  deliveryText = "Free (within 15 km)";
        else                                      deliveryText = "$0 (local — no travel charge)";
      } else {
        deliveryText = formatMoney(deliveryCost) + " est.";
      }
    }

    // Sandbag
    let sandbags = 0;
    let sandbagText = "N/A";
    if (!lawnsOnly && inflatableCount > 0) {
      if      (surface === "Grass")                                        { sandbagText = "$0 (grass — no sandbags)"; }
      else if (surface === "Indoor gym" || surface === "Concrete or asphalt") { sandbags = inflatableCount * SANDBAG_FEE; sandbagText = formatMoney(sandbags) + " est. (" + inflatableCount + " unit" + (inflatableCount !== 1 ? "s" : "") + " \xd7 $25)"; }
      else if (surface === "Artificial turf")                               { sandbagText = "May be required — manual review"; }
      else if (surface === "Gravel")                                        { sandbagText = "Manual review — setup may not be approved"; }
      else if (surface === "Other")                                         { sandbagText = "Manual review required"; }
      else                                                                  { sandbagText = "Enter surface above"; }
    }

    // Attendants
    let attendantCost = 0;
    let attendantText = "—";
    if (extraState.attendantsWanted) {
      const count = Math.max(1, extraState.attendantCount || 1);
      const hours = Math.max(1, extraState.attendantHours || 1);
      attendantCost = count * hours * ATTENDANT_RATE;
      attendantText = count + " attendant" + (count !== 1 ? "s" : "") + " \xd7 " + hours + " hr" + (hours !== 1 ? "s" : "") + " \xd7 $35 = " + formatMoney(attendantCost) + " est.";
    }

    deliveryEl.textContent  = deliveryText;
    sandbagEl.textContent   = sandbagText;
    if (attendantEl) attendantEl.textContent = attendantText;
    totalEl.textContent = deliveryManual
      ? formatMoney(subtotal + deliveryCost + sandbags + attendantCost) + " + delivery (manual)"
      : formatMoney(subtotal + deliveryCost + sandbags + attendantCost);
  }

  _recalcEstimate = recalcEstimate;

  kmInput?.addEventListener("input",  recalcEstimate);
  surfaceSelect?.addEventListener("change", recalcEstimate);
  recalcEstimate();

  // ── Form submit ───────────────────────────────────────────────
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector("#nk-qf-submit-btn");
    const msgEl     = form.querySelector("#nk-form-msg");
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Sending…"; }
    if (msgEl)     { msgEl.hidden = true; msgEl.className = "nk-form-msg"; }

    const kmVal    = parseFloat(formState.kmFromBridgewater) || null;
    const surface  = formState.setupSurface || "";
    const distDeliveryCost = kmVal === null ? null : (kmVal <= FREE_KM ? 0 : Math.round((kmVal - FREE_KM) * RATE_PER_KM));
    let sandbags = 0;
    if (!lawnsOnly && inflatableCount > 0 && (surface === "Indoor gym" || surface === "Concrete or asphalt")) {
      sandbags = inflatableCount * SANDBAG_FEE;
    }

    const travelOptFinal  = extraState.travelOption ? TRAVEL_OPTIONS.find((o) => o.value === extraState.travelOption) : null;
    const isManualTravel  = travelOptFinal !== null && travelOptFinal.cost === null;
    const travelCostFinal = isManualTravel ? 0 : (travelOptFinal?.cost ?? 0);
    const combinedDeliveryCost = (distDeliveryCost ?? 0) + travelCostFinal;
    const attendantCostFinal = extraState.attendantsWanted
      ? Math.max(1, extraState.attendantCount || 1) * Math.max(1, extraState.attendantHours || 1) * ATTENDANT_RATE
      : 0;
    const totalFinal = subtotal + combinedDeliveryCost + sandbags + attendantCostFinal;

    const payload = {
      access_key:            W3F_KEY,
      subject:               "New Nova Kingdom Rentals Quote Request",
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
      kmFromBridgewater:     kmVal !== null ? kmVal + " km" : "Not provided — quoted manually",
      notes:                 formState.notes,
      selectedItems:         selectedSummary,
      subtotal:              formatMoney(subtotal),
      distanceDeliveryEstimate: distDeliveryCost === null ? "Not provided — quoted manually" : (distDeliveryCost === 0 ? "Free (within 15 km)" : formatMoney(distDeliveryCost) + " est."),
      staffTravelOption:        travelOptFinal ? travelOptFinal.label : "Not selected",
      staffTravelEstimate:      isManualTravel ? "Manual quote — confirmed after address review" : (travelCostFinal === 0 ? (travelOptFinal ? "$0 (local)" : "Not selected") : formatMoney(travelCostFinal) + " est."),
      combinedDeliveryEstimate: isManualTravel ? "Quoted manually after address review" : (combinedDeliveryCost === 0 ? "Free" : formatMoney(combinedDeliveryCost) + " est."),
      sandbagEstimate:          sandbags > 0 ? formatMoney(sandbags) : (lawnsOnly ? "N/A (lawn games only)" : "Depends on surface"),
      attendantsRequired:       extraState.attendantsWanted ? "Yes" : "No / not sure",
      attendantCount:           extraState.attendantsWanted ? String(extraState.attendantCount) : "N/A",
      attendantHours:           extraState.attendantsWanted ? String(extraState.attendantHours) : "N/A",
      attendantEstimate:        extraState.attendantsWanted ? formatMoney(attendantCostFinal) + " est." : "N/A",
      estimatedTotal:           isManualTravel ? formatMoney(totalFinal) + " + delivery (manual)" : formatMoney(totalFinal),
      disclaimer:            DISCLAIMER,
    };

    try {
      const res  = await fetch("https://api.web3forms.com/submit", {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error("Submission failed");
      if (msgEl) { msgEl.hidden = false; msgEl.className = "nk-form-msg success"; msgEl.textContent = "Quote request sent! We’ll confirm availability, delivery cost, and next steps soon."; }
      if (submitBtn) submitBtn.textContent = "Sent!";
      form.reset();
      clearFormState();
      clearExtraState();
      saveCart([]);
      updateBar();
    } catch {
      if (msgEl) { msgEl.hidden = false; msgEl.className = "nk-form-msg error"; msgEl.textContent = "Something went wrong. Please call or text 902-990-0005."; }
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
    injectAddBtn(card, id, name, price, true, card.querySelector(".button, a"), {});
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
  injectAddBtn(hero, id, name, price, true,
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
    if (currIncluded[id]) return; // product already in a package
    if (id.startsWith("pkg-") && getCoveringPackage(id, currentCart)) return; // package already covered

    const nowIn = currentCart.some((i) => i.id === id);
    if (nowIn) {
      saveCart(currentCart.filter((i) => i.id !== id));
    } else {
      // Package with 5 LG: remove standalone LG selections
      if (meta?.includesLawnGames) {
        currentCart = currentCart.filter((i) => i.id !== "lg-5" && i.id !== "lg-10" && i.id !== "lg-12");
      }
      // Remove individual products already included in this package
      const pkgIncluded = PKG_INCLUDED_PRODUCTS[id];
      if (pkgIncluded) {
        currentCart = currentCart.filter((i) => !pkgIncluded.has(i.id));
        // Also remove products transitively covered (e.g. Rush 42 in a package covers Cascade + Quest)
        pkgIncluded.forEach((pid) => {
          const transitive = PRODUCT_COVERS[pid];
          if (transitive) currentCart = currentCart.filter((i) => !transitive.has(i.id));
        });
      }
      // For standalone products that functionally cover others (Rush 42 → Cascade + Quest)
      const productCovers = PRODUCT_COVERS[id];
      if (productCovers) {
        const coveringSet = new Set([id, ...productCovers]);
        // Remove individual products covered by this standalone item
        const coveredItems = currentCart.filter((i) => productCovers.has(i.id));
        // Also remove packages whose entire effective product set is covered by this standalone item
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
      // Auto-remove smaller packages whose core products are now covered by this one
      if (id.startsWith("pkg-")) {
        const covered = getCoveredPackages(id, currentCart);
        if (covered.length > 0) {
          const names = covered.map((p) => p.name).join(", ");
          setRemovedNote("Removed overlapping package" + (covered.length > 1 ? "s" : "") + " to avoid double-charging: " + names + ".");
          const coveredIds = new Set(covered.map((p) => p.id));
          currentCart = currentCart.filter((i) => !coveredIds.has(i.id));
        }
      }
      // Crown Carnival Challenge: $200 add-on when any package is in cart
      let actualPrice = price;
      if (id === CROWN_CARNIVAL_ID) {
        actualPrice = currentCart.some((i) => i.id.startsWith("pkg-")) ? CROWN_CARNIVAL_ADDON : CROWN_CARNIVAL_STANDALONE;
      }
      currentCart.push({ id, name, price: actualPrice, isInflatable, ...meta });
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

function enhanceAll() {
  enhanceProductCards();
  enhancePackageCards();
  enhanceProductDetail();
  enhanceLawnGameCards();
  enhanceCarnivalAddonBtns();
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
