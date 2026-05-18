/* Nova Kingdom Rentals — Quote Cart v20260518-cartfix
   Availability request only. No payment. No confirmed booking.
   Root-cause fixes vs prior version:
   - renderPanel() removed from MutationObserver (was the freeze source)
   - window.NovaQuoteCartInitialized guard prevents double-init
   - DOM elements checked for existence before creation
   - Observer guarded with busy flag to prevent re-entrancy
   - updateBar() never calls renderPanel()
   - renderPanel() never calls init/enhanceAll/updateBar
*/

console.info("Nova Quote Cart loaded");
window.NovaQuoteCartLoaded = true;

// ── Constants ────────────────────────────────────────────────────
const CART_KEY    = "nk_quote_v1";
const W3F_KEY     = "909ed8f7-78ca-494f-b960-1713b60bc012";
const FREE_KM     = 15;
const RATE_PER_KM = 0.72;
const SANDBAG_FEE = 25;

const LAWN_GAME_PACKAGES = [
  { id: "lg-5",  name: "5 Lawn Games Package",  price: 175, note: "Excludes Cornhole and Giant Connect 4", cornholeEligible: true,  isInflatable: false },
  { id: "lg-10", name: "10 Lawn Games Package", price: 250, note: "Excludes Cornhole",                    cornholeEligible: true,  isInflatable: false },
  { id: "lg-12", name: "12 Lawn Games Package", price: 280, note: "All 12 games including Cornhole",       cornholeEligible: false, isInflatable: false },
];
const LG_IDS = new Set(LAWN_GAME_PACKAGES.map((p) => p.id));

const DISCLAIMER =
  "This is an availability request, not a confirmed booking. Nova Kingdom Rentals will manually confirm availability, delivery cost, setup suitability, staffing needs, and deposit/payment details.";

const WATER_RE = /water|cascade|island combo|rush|splash/i;

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
  const subtotal       = items.reduce((s,i) => s + i.price, 0);
  const inflatableCount = items.filter((i) => i.isInflatable !== false).length;
  const lawnsOnly      = items.length > 0 && items.every((i) => i.isInflatable === false);
  const hasWater       = items.some((i) => WATER_RE.test(i.name));
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
  // Refresh Add-to-Quote button labels without touching innerHTML
  const cart = loadCart();
  document.querySelectorAll(".nk-add-to-quote[data-nk-id]").forEach((btn) => {
    const inCart = cart.some((i) => i.id === btn.dataset.nkId);
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
  overlay.hidden = true;
  document.body.style.overflow = "";
}

// ── Panel rendering (called explicitly from user actions only) ───
// NEVER called from MutationObserver. NEVER calls init/enhanceAll/updateBar.
function renderPanel() {
  const body = eid("nk-qp-body");
  if (!body) return;
  try {
    const items = loadCart();
    const stats = cartStats(items);

    // Build new content in a fragment — one innerHTML assignment per section
    const frag = document.createDocumentFragment();
    frag.appendChild(makeItemsSection(items));
    frag.appendChild(makeLawnSection(items));
    frag.appendChild(makeEstimateSection(items, stats));
    frag.appendChild(makeFormSection(items, stats));

    body.innerHTML = "";          // one clear
    body.appendChild(frag);      // one append
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
      '<p class="nk-empty-note">No items added yet. Use the "Add to Quote" buttons on rentals, packages, or pick a lawn game package below.</p>');
    return sec;
  }
  const ul = document.createElement("ul");
  ul.className = "nk-item-list";
  items.forEach((item) => {
    const li = document.createElement("li");
    li.className = "nk-item-row";
    // Use DOM methods, not innerHTML, so textContent changes don't cascade
    const nameSpan  = document.createElement("span"); nameSpan.className  = "nk-item-name";  nameSpan.textContent = item.name;
    const priceSpan = document.createElement("span"); priceSpan.className = "nk-item-price"; priceSpan.textContent = formatMoney(item.price);
    const rmBtn     = document.createElement("button");
    rmBtn.type = "button";
    rmBtn.className = "nk-item-remove";
    rmBtn.setAttribute("aria-label", "Remove " + item.name);
    rmBtn.textContent = "✕";
    rmBtn.dataset.rmId = item.id;
    li.appendChild(nameSpan);
    li.appendChild(priceSpan);
    li.appendChild(rmBtn);
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

// ── Lawn game packages section ───────────────────────────────────
function makeLawnSection(items) {
  const sec = document.createElement("section");
  sec.innerHTML = '<p class="nk-qs-title">Lawn game packages (standalone)</p>';

  const cartIds      = new Set(items.map((i) => i.id));
  const selectedPkg  = LAWN_GAME_PACKAGES.find((p) => cartIds.has(p.id));

  const grid = document.createElement("div");
  grid.className = "nk-lg-grid";

  LAWN_GAME_PACKAGES.forEach((pkg) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "nk-lg-btn" + (cartIds.has(pkg.id) ? " selected" : "");
    btn.setAttribute("data-lg-id", pkg.id);
    // Use DOM, not innerHTML
    const n = document.createElement("span"); n.className = "nk-lg-btn-name";  n.textContent = pkg.name;
    const p = document.createElement("span"); p.className = "nk-lg-btn-price"; p.textContent = formatMoney(pkg.price);
    const o = document.createElement("span"); o.className = "nk-lg-btn-note";  o.textContent = pkg.note;
    btn.appendChild(n); btn.appendChild(p); btn.appendChild(o);
    grid.appendChild(btn);
  });

  grid.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-lg-id]");
    if (!btn) return;
    const pkgId  = btn.dataset.lgId;
    const pkgDef = LAWN_GAME_PACKAGES.find((p) => p.id === pkgId);
    if (!pkgDef) return;
    // Remove all lawn game packages + cornhole addon, then toggle
    let cart = loadCart().filter((i) => !LG_IDS.has(i.id) && i.id !== "lg-cornhole-addon");
    if (!cartIds.has(pkgId)) {
      cart.push({ id: pkgDef.id, name: pkgDef.name, price: pkgDef.price, isInflatable: false });
    }
    saveCart(cart);
    updateBar();
    renderPanel();
  });
  sec.appendChild(grid);

  // Cornhole add-on (only when 5- or 10-game package selected)
  const canAddCornhole = selectedPkg?.cornholeEligible === true;
  const cornholeInCart = cartIds.has("lg-cornhole-addon");

  const chRow = document.createElement("div");
  chRow.className = "nk-cornhole-row";
  chRow.style.display = canAddCornhole ? "flex" : "none";

  const lbl = document.createElement("label");
  const chk = document.createElement("input");
  chk.type = "checkbox";
  chk.id = "nk-cornhole-check";
  if (cornholeInCart) chk.checked = true;
  const lbTxt = document.createTextNode(" Cornhole add-on");
  lbl.appendChild(chk);
  lbl.appendChild(lbTxt);

  const chPrice = document.createElement("span");
  chPrice.className = "nk-cornhole-price";
  chPrice.textContent = "+$25";

  chRow.appendChild(lbl);
  chRow.appendChild(chPrice);
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
  const { subtotal, inflatableCount, lawnsOnly } = stats;
  const sec = document.createElement("section");

  const title = document.createElement("p");
  title.className = "nk-qs-title";
  title.textContent = "Preliminary estimate";
  sec.appendChild(title);

  const tbl = document.createElement("table");
  tbl.className = "nk-estimate-table";
  tbl.innerHTML =
    "<tr><td>Subtotal</td><td>" + escHtml(formatMoney(subtotal)) + "</td></tr>" +
    "<tr><td>Delivery</td><td id='nk-delivery-val'>Enter km below</td></tr>" +
    "<tr><td>Sandbag anchoring estimate</td><td id='nk-sandbag-val'>" + (lawnsOnly ? "N/A" : "Enter surface below") + "</td></tr>" +
    "<tr class='total'><td>Estimated total</td><td id='nk-total-val'>" + escHtml(formatMoney(subtotal)) + "</td></tr>";
  sec.appendChild(tbl);

  const note = document.createElement("p");
  note.className = "nk-estimate-note";
  note.textContent = "Final anchoring requirements confirmed after setup review. Delivery: $0.72/km after the first 15 km from Bridgewater. Sandbag fee applies to inflatables on non-grass surfaces.";
  sec.appendChild(note);
  return sec;
}

// ── Form section ─────────────────────────────────────────────────
function makeFormSection(items, stats) {
  const { subtotal, inflatableCount, lawnsOnly, hasWater } = stats;
  const selectedSummary = items.map((i) => i.name + " (" + formatMoney(i.price) + ")").join("; ") || "No items selected";

  const sec = document.createElement("section");
  const title = document.createElement("p");
  title.className = "nk-qs-title";
  title.textContent = "Event & contact details";
  sec.appendChild(title);

  const form = document.createElement("form");
  form.id = "nk-quote-form";
  // Build form via innerHTML once — no live event handlers in the HTML string
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
      <div class="nk-qf-field"><label class="nk-qf-label" for="nkf-prov">Province</label><input id="nkf-prov" name="province" type="text" value="Nova Scotia"></div>
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

  // Live estimate — only updates text in existing cells, never touches innerHTML
  const kmInput      = form.querySelector("#nkf-km");
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
      if (km <= FREE_KM) {
        deliveryText = "Free (within 15 km)";
      } else {
        delivery = Math.round((km - FREE_KM) * RATE_PER_KM);
        deliveryText = formatMoney(delivery) + " est.";
      }
    }

    let sandbags = 0;
    let sandbagText = "N/A";
    if (!lawnsOnly && inflatableCount > 0) {
      if (surface === "Grass")                            { sandbagText = "$0 (grass — no sandbags)"; }
      else if (surface === "Indoor gym" ||
               surface === "Concrete or asphalt")        { sandbags = inflatableCount * SANDBAG_FEE;
                                                           sandbagText = formatMoney(sandbags) + " est. (" + inflatableCount + " unit" + (inflatableCount !== 1 ? "s" : "") + " × $25)"; }
      else if (surface === "Artificial turf")             { sandbagText = "May be required — manual review"; }
      else if (surface === "Gravel")                      { sandbagText = "Manual review — setup may not be approved"; }
      else if (surface === "Other")                       { sandbagText = "Manual review required"; }
      else                                                { sandbagText = "Enter surface above"; }
    }

    // Only textContent — no innerHTML, no DOM structure change
    deliveryEl.textContent = deliveryText;
    sandbagEl.textContent  = sandbagText;
    totalEl.textContent    = formatMoney(subtotal + delivery + sandbags);
  }

  kmInput?.addEventListener("input",  recalcEstimate);
  surfaceSelect?.addEventListener("change", recalcEstimate);

  // Form submit
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector("#nk-qf-submit-btn");
    const msgEl     = form.querySelector("#nk-form-msg");
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Sending…"; }
    if (msgEl)     { msgEl.hidden = true; msgEl.className = "nk-form-msg"; }

    const fd      = new FormData(form);
    const km      = parseFloat(fd.get("kmFromBridgewater") || "") || null;
    const surface = fd.get("setupSurface") || "";
    const delivery = km === null ? null : (km <= FREE_KM ? 0 : Math.round((km - FREE_KM) * RATE_PER_KM));
    let sandbags = 0;
    if (!lawnsOnly && inflatableCount > 0 && (surface === "Indoor gym" || surface === "Concrete or asphalt")) {
      sandbags = inflatableCount * SANDBAG_FEE;
    }

    const payload = {
      access_key:      W3F_KEY,
      subject:         "New Nova Kingdom Rentals Quote Request",
      business:        "Nova Kingdom Rentals",
      inquiryType:     "Availability request — not a confirmed booking",
      name:            fd.get("name"),
      email:           fd.get("email"),
      phone:           fd.get("phone"),
      eventDate:       fd.get("eventDate"),
      startTime:       fd.get("startTime"),
      endTime:         fd.get("endTime"),
      eventAddress:    fd.get("eventAddress"),
      city:            fd.get("city"),
      province:        fd.get("province"),
      postalCode:      fd.get("postalCode"),
      setupSurface:    surface,
      powerAccess:     fd.get("powerAccess"),
      waterAccess:     fd.get("waterAccess"),
      guests:          fd.get("guests"),
      kmFromBridgewater: km !== null ? km + " km" : "Not provided — quoted manually",
      notes:           fd.get("notes"),
      selectedItems:   selectedSummary,
      subtotal:        formatMoney(subtotal),
      deliveryEstimate: delivery === null ? "Quoted manually" : formatMoney(delivery),
      sandbagEstimate: sandbags > 0 ? formatMoney(sandbags) : (lawnsOnly ? "N/A (lawn games only)" : "Depends on surface"),
      estimatedTotal:  formatMoney(subtotal + (delivery || 0) + sandbags),
      disclaimer:      DISCLAIMER,
    };

    try {
      const res  = await fetch("https://api.web3forms.com/submit", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body:    JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error("Submission failed");
      if (msgEl) { msgEl.hidden = false; msgEl.className = "nk-form-msg success"; msgEl.textContent = "Quote request sent! We'll confirm availability, delivery cost, and next steps soon."; }
      if (submitBtn) submitBtn.textContent = "Sent!";
      form.reset();
    } catch {
      if (msgEl) { msgEl.hidden = false; msgEl.className = "nk-form-msg error"; msgEl.textContent = "Something went wrong. Please call or text 902-990-0005."; }
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Request Availability"; }
    }
  });

  return sec;
}

// ── Card enhancement (Add to Quote buttons) ──────────────────────
function enhanceProductCards() {
  document.querySelectorAll(".product-card:not(.lawn-feature-card):not([data-nk-enhanced])").forEach((card) => {
    card.dataset.nkEnhanced = "1";
    const name     = card.querySelector("h3")?.textContent?.trim();
    const priceEl  = card.querySelector(".product-body strong") || card.querySelector("strong");
    const id       = name ? "product-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-") : null;
    if (!name || !priceEl || !id) return;
    const price    = parsePrice(priceEl.textContent);
    if (!price) return;
    const insertBefore = card.querySelector(".button, a");
    injectAddBtn(card, id, name, price, true, insertBefore);
  });
}

function enhancePackageCards() {
  document.querySelectorAll(".package-card:not([data-nk-enhanced])").forEach((card) => {
    card.dataset.nkEnhanced = "1";
    const name    = card.querySelector("h3")?.textContent?.trim();
    const priceEl = card.querySelector("strong");
    const id      = name ? "pkg-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-") : null;
    if (!name || !priceEl || !id) return;
    const price   = parsePrice(priceEl.textContent);
    if (!price) return;
    const insertBefore = card.querySelector("[data-package-detail-button], .button, a");
    injectAddBtn(card, id, name, price, true, insertBefore);
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
  const price   = parsePrice(priceEl.textContent);
  if (!price) return;
  const insertBefore = hero.querySelector(".button-row, .button, a");
  injectAddBtn(hero, id, name, price, true, insertBefore);
}

function injectAddBtn(container, id, name, price, isInflatable, insertBefore) {
  if (container.querySelector(".nk-add-to-quote")) return;
  const inCart = loadCart().some((i) => i.id === id);
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "nk-add-to-quote" + (inCart ? " in-cart" : "");
  btn.textContent = inCart ? "In Quote ✓" : "Add to Quote";
  btn.dataset.nkId = id;
  btn.addEventListener("click", () => {
    const cart = loadCart();
    const nowIn = cart.some((i) => i.id === id);
    if (nowIn) { saveCart(cart.filter((i) => i.id !== id)); }
    else        { saveCart([...cart, { id, name, price, isInflatable }]); }
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

    // MutationObserver: ONLY for card enhancement.
    // renderPanel() is NEVER called from here.
    let observerBusy = false;
    const observer = new MutationObserver(() => {
      if (observerBusy) return;
      observerBusy = true;
      requestAnimationFrame(() => {
        enhanceAll();
        observerBusy = false;
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // SPA navigation support
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
