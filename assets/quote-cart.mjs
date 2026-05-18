/* Nova Kingdom Rentals — Quote Cart v20260518-statefix
   Availability request only. No payment. No confirmed booking.
   Changes vs cartfix:
   - formState persists customer fields across cart add/remove/open/close
   - captureFormState() reads form before any rebuild; restoreFormState() repopulates
   - recalcEstimate() called once after restore so estimate reflects saved km/surface
   - Package cards: "Check Availability" link hidden when Add to Quote present
   - Product detail: "Check Availability" link hidden when Add to Quote present
   - Smart lawn game section: upgrade pricing when cart has a package with 5 LG included
   - Packages with includesLawnGames:true auto-remove standalone LG items on add
   - ALL_LG_IDS covers both standalone and upgrade IDs for clean clearing
*/

console.info("Nova Quote Cart loaded");
window.NovaQuoteCartLoaded = true;

// ── Constants ────────────────────────────────────────────────────
const CART_KEY    = "nk_quote_v1";
const W3F_KEY     = "909ed8f7-78ca-494f-b960-1713b60bc012";
const FREE_KM     = 15;
const RATE_PER_KM = 0.72;
const SANDBAG_FEE = 25;

// Standalone lawn game packages
const LAWN_GAME_PACKAGES = [
  { id: "lg-5",  name: "5 Lawn Games Package",  price: 175, note: "Excludes Cornhole and Giant Connect 4", cornholeEligible: true,  isInflatable: false },
  { id: "lg-10", name: "10 Lawn Games Package", price: 250, note: "Excludes Cornhole",                    cornholeEligible: true,  isInflatable: false },
  { id: "lg-12", name: "12 Lawn Games Package", price: 280, note: "All 12 games including Cornhole",       cornholeEligible: false, isInflatable: false },
];

// Upgrade options when cart already contains a package that includes 5 lawn games.
// Priced as the difference from the standalone 5-game package ($175).
const UPGRADE_OPTIONS = [
  { id: "lg-upgrade-10", name: "Upgrade included 5 Lawn Games to 10 Lawn Games", price: 75,  note: "Excludes Cornhole — Cornhole add-on +$25", cornholeEligible: true,  isInflatable: false },
  { id: "lg-upgrade-12", name: "Upgrade included 5 Lawn Games to all 12 Lawn Games", price: 105, note: "All 12 games including Cornhole",        cornholeEligible: false, isInflatable: false },
];

// All IDs that belong to the lawn-game selection group (cleared before any new LG selection)
const ALL_LG_IDS = new Set(["lg-5", "lg-10", "lg-12", "lg-upgrade-10", "lg-upgrade-12", "lg-cornhole-addon"]);

const DISCLAIMER =
  "This is an availability request, not a confirmed booking. Nova Kingdom Rentals will manually confirm availability, delivery cost, setup suitability, staffing needs, and deposit/payment details.";

const WATER_RE = /water|cascade|island combo|rush|splash/i;

// ── Form state (persists across renderPanel calls) ───────────────
// Keys match the `name` attributes of the form fields.
const formState = {
  name: "", email: "", phone: "",
  eventDate: "", startTime: "", endTime: "",
  eventAddress: "", city: "", province: "Nova Scotia",
  postalCode: "", kmFromBridgewater: "", setupSurface: "",
  powerAccess: "", waterAccess: "", guests: "", notes: ""
};

function captureFormState(form) {
  if (!form) return;
  // Use individual element access; FormData misses disabled fields and some selects in some browsers
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
const eid = (id) => document.getElementById(id);
const escHtml = (s) => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const parsePrice = (t) => parseFloat(String(t).replace(/[^0-9.]/g,"")) || 0;
const formatMoney = (n) => "$" + Number(n).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,",");

function cartStats(items) {
  const subtotal        = items.reduce((s,i) => s + i.price, 0);
  const inflatableCount = items.filter((i) => i.isInflatable !== false).length;
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
  const items = loadCart();
  bar.hidden = items.length === 0;
  if (count) count.textContent = String(items.length);
  document.querySelectorAll(".nk-add-to-quote[data-nk-id]").forEach((btn) => {
    const inCart = items.some((i) => i.id === btn.dataset.nkId);
    btn.textContent = inCart ? "In Quote ✓" : "Add to Quote";
    btn.classList.toggle("in-cart", inCart);
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
  // Capture any unsaved form input before closing
  captureFormState(eid("nk-quote-overlay")?.querySelector("#nk-quote-form"));
  overlay.hidden = true;
  document.body.style.overflow = "";
}

// ── Panel rendering ──────────────────────────────────────────────
// Called only from explicit user actions (open, add, remove, LG toggle).
// NEVER called from MutationObserver. NEVER calls init/enhanceAll/updateBar.
function renderPanel() {
  const body = eid("nk-qp-body");
  if (!body) return;
  try {
    // Always capture current form values before blowing away the DOM
    captureFormState(body.querySelector("#nk-quote-form"));

    const items = loadCart();
    const stats = cartStats(items);

    const frag = document.createDocumentFragment();
    frag.appendChild(makeItemsSection(items));
    frag.appendChild(makeLawnSection(items));
    frag.appendChild(makeEstimateSection(items, stats));
    frag.appendChild(makeFormSection(items, stats));

    body.innerHTML = "";     // single clear
    body.appendChild(frag); // single append
  } catch (err) {
    console.error("Nova Quote Cart panel render failed:", err);
  }
}

// ── Items section ────────────────────────────────────────────────
function makeItemsSection(items) {
  const sec = document.createElement("section");
  sec.innerHTML = '<p class="nk-qs-title">Selected items</p>';
  if (!items.length) {
    sec.insertAdjacentHTML("beforeend",
      '<p class="nk-empty-note">No items added yet. Use the "Add to Quote" buttons on rentals or packages, or pick a lawn game option below.</p>');
    return sec;
  }
  const ul = document.createElement("ul");
  ul.className = "nk-item-list";
  items.forEach((item) => {
    const li        = document.createElement("li");   li.className       = "nk-item-row";
    const nameSpan  = document.createElement("span"); nameSpan.className = "nk-item-name";  nameSpan.textContent = item.name;
    const priceSpan = document.createElement("span"); priceSpan.className= "nk-item-price"; priceSpan.textContent = formatMoney(item.price);
    const rmBtn     = document.createElement("button");
    rmBtn.type = "button"; rmBtn.className = "nk-item-remove";
    rmBtn.setAttribute("aria-label", "Remove " + item.name);
    rmBtn.textContent = "✕"; rmBtn.dataset.rmId = item.id;
    li.appendChild(nameSpan); li.appendChild(priceSpan); li.appendChild(rmBtn);
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
// If cart contains a package that already includes 5 lawn games,
// show upgrade options (+$75 / +$105) instead of full standalone prices.
function makeLawnSection(items) {
  const cartIds       = new Set(items.map((i) => i.id));
  const hasPkgWith5LG = items.some((i) => i.includesLawnGames === true);
  const options       = hasPkgWith5LG ? UPGRADE_OPTIONS : LAWN_GAME_PACKAGES;
  const selectedOpt   = options.find((p) => cartIds.has(p.id));

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
    note.textContent = "Your package already includes 5 Lawn Games. Upgrade pricing below reflects only the difference — no double charge.";
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
    let cart = loadCart().filter((i) => !ALL_LG_IDS.has(i.id)); // clear all LG selections
    if (!cartIds.has(optId)) {
      cart.push({ id: optDef.id, name: optDef.name, price: optDef.price, isInflatable: false });
    }
    saveCart(cart);
    updateBar();
    renderPanel();
  });
  sec.appendChild(grid);

  // Cornhole add-on row — shown when selected option is cornhole-eligible
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

// ── Estimate section ─────────────────────────────────────────────
function makeEstimateSection(items, stats) {
  const { subtotal, lawnsOnly } = stats;
  const sec = document.createElement("section");
  const title = document.createElement("p"); title.className = "nk-qs-title"; title.textContent = "Preliminary estimate";
  sec.appendChild(title);
  const tbl = document.createElement("table"); tbl.className = "nk-estimate-table";
  tbl.innerHTML =
    "<tr><td>Subtotal</td><td>" + escHtml(formatMoney(subtotal)) + "</td></tr>" +
    "<tr><td>Delivery</td><td id='nk-delivery-val'>Enter km below</td></tr>" +
    "<tr><td>Sandbag anchoring estimate</td><td id='nk-sandbag-val'>" + (lawnsOnly ? "N/A" : "Enter surface below") + "</td></tr>" +
    "<tr class='total'><td>Estimated total</td><td id='nk-total-val'>" + escHtml(formatMoney(subtotal)) + "</td></tr>";
  sec.appendChild(tbl);
  const note = document.createElement("p"); note.className = "nk-estimate-note";
  note.textContent = "Final anchoring requirements confirmed after setup review. Delivery: $0.72/km after the first 15 km from Bridgewater. Sandbag fee applies to inflatables on non-grass surfaces.";
  sec.appendChild(note);
  return sec;
}

// ── Form section ─────────────────────────────────────────────────
// Form fields are always repopulated from formState after rebuild.
// Listeners write back to formState on every input/change.
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
    <div class="nk-qf-row">
      <div class="nk-qf-field">
        <label class="nk-qf-label" for="nkf-power">Power access</label>
        <select id="nkf-power" name="powerAccess">
          <option value="">Select</option>
          <option value="Yes — outdoor outlet nearby">Yes — outdoor outlet nearby</option>
          <option value="Yes — extension cord needed">Yes — extension cord needed</option>
          <option value="No / unsure">No / unsure</option>
        </select>
      </div>
      <div class="nk-qf-field nk-water-field${hasWater ? " show" : ""}">
        <label class="nk-qf-label" for="nkf-water">Water access</label>
        <select id="nkf-water" name="waterAccess">
          <option value="">Select</option>
          <option value="Yes — hose nearby">Yes — hose nearby</option>
          <option value="No / unsure">No / unsure</option>
        </select>
      </div>
    </div>
    <div class="nk-qf-field"><label class="nk-qf-label" for="nkf-notes">Notes</label><textarea id="nkf-notes" name="notes" placeholder="Timing, access, fencing, hills, permit details, or anything else helpful."></textarea></div>
    <div class="nk-disclaimer">${escHtml(DISCLAIMER)}</div>
    <button class="nk-qf-submit" type="submit" id="nk-qf-submit-btn">Request Availability</button>
    <div id="nk-form-msg" class="nk-form-msg" hidden></div>
  `;
  sec.appendChild(form);

  // ── Restore saved state into form fields ─────────────────────
  restoreFormState(form);

  // ── Persist state on every input/change ──────────────────────
  form.addEventListener("input",  () => captureFormState(form));
  form.addEventListener("change", () => captureFormState(form));

  // ── Live estimate (reads from live form, no DOM structure change)
  const kmInput       = form.querySelector("#nkf-km");
  const surfaceSelect = form.querySelector("#nkf-surface");

  function recalcEstimate() {
    const deliveryEl = eid("nk-delivery-val");
    const sandbagEl  = eid("nk-sandbag-val");
    const totalEl    = eid("nk-total-val");
    if (!deliveryEl || !sandbagEl || !totalEl) return;

    const km      = parseFloat(kmInput?.value) || null;
    const surface = surfaceSelect?.value || "";

    let delivery = 0;
    let deliveryText = "Delivery quoted manually";
    if (km !== null) {
      if (km <= FREE_KM) { deliveryText = "Free (within 15 km)"; }
      else { delivery = Math.round((km - FREE_KM) * RATE_PER_KM); deliveryText = formatMoney(delivery) + " est."; }
    }

    let sandbags = 0;
    let sandbagText = "N/A";
    if (!lawnsOnly && inflatableCount > 0) {
      if      (surface === "Grass")                           { sandbagText = "$0 (grass — no sandbags)"; }
      else if (surface === "Indoor gym" ||
               surface === "Concrete or asphalt")            { sandbags = inflatableCount * SANDBAG_FEE; sandbagText = formatMoney(sandbags) + " est. (" + inflatableCount + " unit" + (inflatableCount !== 1 ? "s" : "") + " × $25)"; }
      else if (surface === "Artificial turf")                 { sandbagText = "May be required — manual review"; }
      else if (surface === "Gravel")                          { sandbagText = "Manual review — setup may not be approved"; }
      else if (surface === "Other")                           { sandbagText = "Manual review required"; }
      else                                                    { sandbagText = "Enter surface above"; }
    }

    deliveryEl.textContent = deliveryText;
    sandbagEl.textContent  = sandbagText;
    totalEl.textContent    = formatMoney(subtotal + delivery + sandbags);
  }

  kmInput?.addEventListener("input",  recalcEstimate);
  surfaceSelect?.addEventListener("change", recalcEstimate);

  // Run once now so restored km/surface values populate the estimate immediately
  recalcEstimate();

  // ── Form submit ───────────────────────────────────────────────
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector("#nk-qf-submit-btn");
    const msgEl     = form.querySelector("#nk-form-msg");
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Sending…"; }
    if (msgEl)     { msgEl.hidden = true; msgEl.className = "nk-form-msg"; }

    const km      = parseFloat(formState.kmFromBridgewater) || null;
    const surface = formState.setupSurface || "";
    const delivery = km === null ? null : (km <= FREE_KM ? 0 : Math.round((km - FREE_KM) * RATE_PER_KM));
    let sandbags = 0;
    if (!lawnsOnly && inflatableCount > 0 && (surface === "Indoor gym" || surface === "Concrete or asphalt")) {
      sandbags = inflatableCount * SANDBAG_FEE;
    }

    const payload = {
      access_key:       W3F_KEY,
      subject:          "New Nova Kingdom Rentals Quote Request",
      business:         "Nova Kingdom Rentals",
      inquiryType:      "Availability request — not a confirmed booking",
      name:             formState.name,
      email:            formState.email,
      phone:            formState.phone,
      eventDate:        formState.eventDate,
      startTime:        formState.startTime,
      endTime:          formState.endTime,
      eventAddress:     formState.eventAddress,
      city:             formState.city,
      province:         formState.province,
      postalCode:       formState.postalCode,
      setupSurface:     surface,
      powerAccess:      formState.powerAccess,
      waterAccess:      formState.waterAccess,
      guests:           formState.guests,
      kmFromBridgewater: km !== null ? km + " km" : "Not provided — quoted manually",
      notes:            formState.notes,
      selectedItems:    selectedSummary,
      subtotal:         formatMoney(subtotal),
      deliveryEstimate: delivery === null ? "Quoted manually" : formatMoney(delivery),
      sandbagEstimate:  sandbags > 0 ? formatMoney(sandbags) : (lawnsOnly ? "N/A (lawn games only)" : "Depends on surface"),
      estimatedTotal:   formatMoney(subtotal + (delivery || 0) + sandbags),
      disclaimer:       DISCLAIMER,
    };

    try {
      const res  = await fetch("https://api.web3forms.com/submit", {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error("Submission failed");
      if (msgEl) { msgEl.hidden = false; msgEl.className = "nk-form-msg success"; msgEl.textContent = "Quote request sent! We'll confirm availability, delivery cost, and next steps soon."; }
      if (submitBtn) submitBtn.textContent = "Sent!";
      // Clear both form and cart after successful submission
      form.reset();
      clearFormState();
      saveCart([]);
      updateBar();
    } catch {
      if (msgEl) { msgEl.hidden = false; msgEl.className = "nk-form-msg error"; msgEl.textContent = "Something went wrong. Please call or text 902-990-0005."; }
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Request Availability"; }
    }
  });

  return sec;
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
    // Product cards use "View Details" not "Check Availability" — no hiding needed
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

    // Detect whether this package includes 5 lawn games from the rendered included-items text
    const includedText = Array.from(card.querySelectorAll("p")).map((p) => p.textContent).join(" ");
    const includesLawnGames = /5\s*lawn\s*games?/i.test(includedText);

    injectAddBtn(card, id, name, price, true,
      card.querySelector("[data-package-detail-button], .button, a"),
      { includesLawnGames });

    // Hide "Check Availability" — "Add to Quote" is the primary CTA; "View What's Included" stays
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
  const inCart = loadCart().some((i) => i.id === id);
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "nk-add-to-quote" + (inCart ? " in-cart" : "");
  btn.textContent = inCart ? "In Quote ✓" : "Add to Quote";
  btn.dataset.nkId = id;
  btn.addEventListener("click", () => {
    let cart = loadCart();
    const nowIn = cart.some((i) => i.id === id);
    if (nowIn) {
      saveCart(cart.filter((i) => i.id !== id));
    } else {
      // If this package includes 5 LG, auto-remove conflicting standalone LG selections
      if (meta?.includesLawnGames) {
        cart = cart.filter((i) => i.id !== "lg-5" && i.id !== "lg-10" && i.id !== "lg-12");
      }
      saveCart([...cart, { id, name, price, isInflatable, ...meta }]);
    }
    const after = loadCart().some((i) => i.id === id);
    btn.textContent = after ? "In Quote ✓" : "Add to Quote";
    btn.classList.toggle("in-cart", after);
    updateBar();
  });
  if (insertBefore) { insertBefore.insertAdjacentElement("beforebegin", btn); }
  else              { container.appendChild(btn); }
}

function enhanceAll() {
  enhanceProductCards();
  enhancePackageCards();
  enhanceProductDetail();
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

    // MutationObserver: card enhancement only. renderPanel() NEVER called here.
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
