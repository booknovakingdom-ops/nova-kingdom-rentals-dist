/* Nova Kingdom Rentals — Quote Cart v20260520-worker */

const CART_KEY = "nk_quote_v1";
const W3F_KEY = "909ed8f7-78ca-494f-b960-1713b60bc012";
const FREE_KM = 15;
const RATE_PER_KM = 0.72;
const SANDBAG_FEE = 25;
const TRAVEL_RATE = 25; // $25/hr staff travel, included in delivery estimate from Worker
const DELIVERY_API_URL = "https://nova-delivery-api.booknovakingdom.workers.dev/api/estimate-delivery";
const NOVA_KINGDOM_ORIGIN = "Bridgewater, NS";

const LAWN_GAME_PACKAGES = [
  {
    id: "lg-5",
    name: "5 Lawn Games Package",
    price: 175,
    note: "Excludes Cornhole and Giant Connect 4",
    cornholeEligible: true,
    isInflatable: false,
  },
  {
    id: "lg-10",
    name: "10 Lawn Games Package",
    price: 250,
    note: "Excludes Cornhole",
    cornholeEligible: true,
    isInflatable: false,
  },
  {
    id: "lg-12",
    name: "12 Lawn Games Package",
    price: 280,
    note: "All 12 games including Cornhole",
    cornholeEligible: false,
    isInflatable: false,
  },
];

const DISCLAIMER =
  "This is an availability request, not a confirmed booking. Nova Kingdom Rentals will manually confirm availability, delivery cost, setup suitability, staffing needs, and deposit/payment details.";

const WATER_KEYWORDS = /water|cascade|island combo|rush|splash/i;

// ── Delivery estimate state ──────────────────────────────────────
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

// Updated by makeFormSection; lets async delivery callback trigger recalc.
let _recalcEstimate = null;
function triggerRecalcEstimate() { if (_recalcEstimate) _recalcEstimate(); }

async function estimateDeliveryFromAddress(address) {
  const trimmed = (address || "").trim();
  if (trimmed.length < 5 || trimmed === deliveryState.lastAddress) return;
  deliveryState.lastAddress = trimmed;
  deliveryState.isPending   = true;
  deliveryState.isManual    = false;

  const deliveryEl = eid("nk-delivery-val");
  if (deliveryEl) deliveryEl.textContent = "Looking up…";

  try {
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(DELIVERY_API_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ origin: NOVA_KINGDOM_ORIGIN, destination: trimmed }),
      signal:  controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error("status " + res.status);
    const data = await res.json();
    if (!data.ok) throw new Error("api ok=false");
    deliveryState.distanceKm      = data.distanceKm;
    deliveryState.durationMinutes = data.durationMinutes;
    deliveryState.isManual        = false;
  } catch (_) {
    deliveryState.distanceKm      = null;
    deliveryState.durationMinutes = null;
    deliveryState.isManual        = true;
  }
  deliveryState.isPending = false;
  triggerRecalcEstimate();
}

function loadCart() {
  try {
    return JSON.parse(sessionStorage.getItem(CART_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveCart(items) {
  try {
    sessionStorage.setItem(CART_KEY, JSON.stringify(items));
  } catch {}
}

function cartHasWaterUnit(items) {
  return items.some((item) => WATER_KEYWORDS.test(item.name));
}

function countInflatableItems(items) {
  return items.filter((item) => item.isInflatable !== false).length;
}

function lawnOnlyCart(items) {
  return items.length > 0 && items.every((item) => item.isInflatable === false);
}

function formatMoney(n) {
  return "$" + n.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function eid(id) {
  return document.getElementById(id);
}

// ── UI construction ──────────────────────────────────────────────

function buildBar() {
  const bar = document.createElement("div");
  bar.id = "nk-quote-bar";
  bar.className = "nk-quote-bar";
  bar.hidden = true;
  bar.innerHTML = `
    <span class="nk-quote-bar-label">Quote</span>
    <span class="nk-quote-bar-count" id="nk-bar-count">0</span>
    <button class="nk-quote-bar-btn" id="nk-bar-open" type="button">View Quote</button>
  `;
  document.body.appendChild(bar);
  eid("nk-bar-open").addEventListener("click", openPanel);
}

function buildPanel() {
  const overlay = document.createElement("div");
  overlay.id = "nk-quote-overlay";
  overlay.className = "nk-quote-overlay";
  overlay.hidden = true;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Quote Request");
  overlay.innerHTML = `
    <div class="nk-quote-panel" id="nk-quote-panel">
      <div class="nk-qp-header">
        <h2>Your Quote Request</h2>
        <button class="nk-qp-close" id="nk-qp-close" type="button" aria-label="Close quote panel">&#x2715;</button>
      </div>
      <div class="nk-qp-body" id="nk-qp-body"></div>
    </div>
  `;
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
  overlay.querySelector(".nk-quote-panel")?.focus?.();
}

function closePanel() {
  const overlay = eid("nk-quote-overlay");
  if (!overlay) return;
  overlay.hidden = true;
  document.body.style.overflow = "";
}

function updateBar() {
  const items = loadCart();
  const bar = eid("nk-quote-bar");
  const count = eid("nk-bar-count");
  if (!bar) return;
  if (items.length === 0) {
    bar.hidden = true;
  } else {
    bar.hidden = false;
    if (count) count.textContent = items.length;
  }
  refreshAddButtons();
}

// ── Panel rendering ──────────────────────────────────────────────

function renderPanel() {
  const body = eid("nk-qp-body");
  if (!body) return;
  const items = loadCart();
  body.innerHTML = "";

  body.appendChild(renderItemsSection(items));
  body.appendChild(renderLawnGamesSection(items));
  body.appendChild(renderEstimateSection(items));
  body.appendChild(renderFormSection(items));
}

function renderItemsSection(items) {
  const sec = document.createElement("section");
  sec.innerHTML = `<p class="nk-qs-title">Selected items</p>`;
  if (items.length === 0) {
    sec.insertAdjacentHTML("beforeend", `<p class="nk-empty-note">No items added yet. Use the "Add to Quote" buttons on rentals, packages, or the lawn game options below.</p>`);
    return sec;
  }
  const ul = document.createElement("ul");
  ul.className = "nk-item-list";
  items.forEach((item) => {
    const li = document.createElement("li");
    li.className = "nk-item-row";
    li.innerHTML = `
      <span class="nk-item-name">${escHtml(item.name)}</span>
      <span class="nk-item-price">${formatMoney(item.price)}</span>
      <button class="nk-item-remove" type="button" aria-label="Remove ${escHtml(item.name)}" data-remove="${escHtml(item.id)}">&#x2715;</button>
    `;
    ul.appendChild(li);
  });
  ul.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const updated = loadCart().filter((i) => i.id !== btn.dataset.remove);
      saveCart(updated);
      updateBar();
      renderPanel();
    });
  });
  sec.appendChild(ul);
  return sec;
}

function renderLawnGamesSection(items) {
  const sec = document.createElement("section");
  sec.innerHTML = `<p class="nk-qs-title">Lawn game packages (standalone)</p>`;

  const cartLgIds = new Set(items.map((i) => i.id));
  const selectedLgPkg = LAWN_GAME_PACKAGES.find((p) => cartLgIds.has(p.id));

  const grid = document.createElement("div");
  grid.className = "nk-lg-grid";

  LAWN_GAME_PACKAGES.forEach((pkg) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "nk-lg-btn" + (cartLgIds.has(pkg.id) ? " selected" : "");
    btn.innerHTML = `
      <span class="nk-lg-btn-name">${escHtml(pkg.name)}</span>
      <span class="nk-lg-btn-price">${formatMoney(pkg.price)}</span>
      <span class="nk-lg-btn-note">${escHtml(pkg.note)}</span>
    `;
    btn.addEventListener("click", () => {
      let cart = loadCart().filter((i) => !LAWN_GAME_PACKAGES.some((p) => p.id === i.id) && i.id !== "lg-cornhole-addon");
      if (!cartLgIds.has(pkg.id)) {
        cart.push({ id: pkg.id, name: pkg.name, price: pkg.price, isInflatable: false });
      }
      saveCart(cart);
      updateBar();
      renderPanel();
    });
    grid.appendChild(btn);
  });
  sec.appendChild(grid);

  // Cornhole add-on row (shown when 5 or 10 game package is selected)
  const canAddCornhole = selectedLgPkg?.cornholeEligible && !cartLgIds.has("lg-12");
  const cornholeInCart = cartLgIds.has("lg-cornhole-addon");

  const cornholeRow = document.createElement("div");
  cornholeRow.className = "nk-cornhole-row";
  cornholeRow.style.display = canAddCornhole ? "flex" : "none";
  cornholeRow.innerHTML = `
    <label>
      <input type="checkbox" id="nk-cornhole-check" ${cornholeInCart ? "checked" : ""}>
      Cornhole add-on
    </label>
    <span class="nk-cornhole-price">+$25</span>
  `;
  cornholeRow.querySelector("#nk-cornhole-check")?.addEventListener("change", (e) => {
    let cart = loadCart().filter((i) => i.id !== "lg-cornhole-addon");
    if (e.target.checked) {
      cart.push({ id: "lg-cornhole-addon", name: "Cornhole Add-On", price: 25, isInflatable: false });
    }
    saveCart(cart);
    updateBar();
    renderPanel();
  });
  sec.appendChild(cornholeRow);

  return sec;
}

function renderEstimateSection(items) {
  const sec = document.createElement("section");
  sec.innerHTML = `<p class="nk-qs-title">Preliminary estimate</p>`;

  const subtotal = items.reduce((sum, i) => sum + i.price, 0);
  const inflatableCount = countInflatableItems(items);
  const lawnsOnly = lawnOnlyCart(items);

  sec.insertAdjacentHTML("beforeend", `
    <table class="nk-estimate-table">
      <tr><td>Subtotal</td><td>${formatMoney(subtotal)}</td></tr>
      <tr id="nk-delivery-row"><td>Delivery & setup</td><td id="nk-delivery-val">Enter address below</td></tr>
      <tr id="nk-sandbag-row"><td>Sandbag anchoring estimate</td><td id="nk-sandbag-val">${lawnsOnly ? "N/A" : "Enter surface below"}</td></tr>
      <tr class="total"><td>Estimated total</td><td id="nk-total-val">${formatMoney(subtotal)}</td></tr>
    </table>
    <p class="nk-estimate-note">
      Delivery is estimated automatically from your address ($0.72/km round-trip after the first 15 km). Final anchoring confirmed after setup review. Sandbag fee applies to inflatables on non-grass surfaces.
    </p>
  `);
  return sec;
}

function renderFormSection(items) {
  const sec = document.createElement("section");
  sec.innerHTML = `<p class="nk-qs-title">Event &amp; contact details</p>`;

  const hasWater = cartHasWaterUnit(items);
  const subtotal = items.reduce((sum, i) => sum + i.price, 0);
  const inflatableCount = countInflatableItems(items);
  const lawnsOnly = lawnOnlyCart(items);

  const selectedSummary = items.map((i) => `${i.name} (${formatMoney(i.price)})`).join("; ") || "No items selected";

  const form = document.createElement("form");
  form.id = "nk-quote-form";
  form.noValidate = false;
  form.innerHTML = `
    <div class="nk-qf-row">
      <div class="nk-qf-field">
        <label class="nk-qf-label" for="nkf-name">Name <span class="nk-req">*</span></label>
        <input id="nkf-name" name="name" type="text" required placeholder="Your name">
      </div>
      <div class="nk-qf-field">
        <label class="nk-qf-label" for="nkf-phone">Phone <span class="nk-req">*</span></label>
        <input id="nkf-phone" name="phone" type="tel" required placeholder="902-___-____">
      </div>
    </div>
    <div class="nk-qf-field">
      <label class="nk-qf-label" for="nkf-email">Email <span class="nk-req">*</span></label>
      <input id="nkf-email" name="email" type="email" required placeholder="you@example.com">
    </div>
    <div class="nk-qf-row">
      <div class="nk-qf-field">
        <label class="nk-qf-label" for="nkf-event-date">Event date <span class="nk-req">*</span></label>
        <input id="nkf-event-date" name="eventDate" type="date" required>
      </div>
      <div class="nk-qf-field">
        <label class="nk-qf-label" for="nkf-start-time">Start time</label>
        <input id="nkf-start-time" name="startTime" type="time">
      </div>
    </div>
    <div class="nk-qf-row">
      <div class="nk-qf-field">
        <label class="nk-qf-label" for="nkf-end-time">End time</label>
        <input id="nkf-end-time" name="endTime" type="time">
      </div>
      <div class="nk-qf-field">
        <label class="nk-qf-label" for="nkf-guests">Est. guests / kids</label>
        <input id="nkf-guests" name="guests" type="text" placeholder="e.g. 25 kids">
      </div>
    </div>
    <div class="nk-qf-field">
      <label class="nk-qf-label" for="nkf-address">Event address <span class="nk-req">*</span></label>
      <input id="nkf-address" name="eventAddress" type="text" required placeholder="Street address">
    </div>
    <div class="nk-qf-row">
      <div class="nk-qf-field">
        <label class="nk-qf-label" for="nkf-city">City / town <span class="nk-req">*</span></label>
        <input id="nkf-city" name="city" type="text" required placeholder="e.g. Bridgewater">
      </div>
      <div class="nk-qf-field">
        <label class="nk-qf-label" for="nkf-province">Province</label>
        <input id="nkf-province" name="province" type="text" value="Nova Scotia">
      </div>
    </div>
    <div class="nk-qf-field">
      <label class="nk-qf-label" for="nkf-postal">Postal code</label>
      <input id="nkf-postal" name="postalCode" type="text" placeholder="B4V ___">
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
    <div class="nk-qf-field">
      <label class="nk-qf-label" for="nkf-notes">Notes</label>
      <textarea id="nkf-notes" name="notes" placeholder="Timing, access, fencing, hills, permit details, or anything else helpful."></textarea>
    </div>

    <div class="nk-disclaimer">${escHtml(DISCLAIMER)}</div>

    <button class="nk-qf-submit" type="submit" id="nk-submit-btn">Request Availability</button>
    <div id="nk-form-msg" class="nk-form-msg" hidden></div>
  `;
  sec.appendChild(form);

  // Live estimate update — delivery comes from Worker via deliveryState
  const addressInput  = form.querySelector("#nkf-address");
  const cityInput     = form.querySelector("#nkf-city");
  const surfaceSelect = form.querySelector("#nkf-surface");

  resetDeliveryState();
  _recalcEstimate = updateEstimate;

  function updateEstimate() {
    const surface   = surfaceSelect?.value || "";
    const deliveryEl = eid("nk-delivery-val");
    const sandbagEl  = eid("nk-sandbag-val");
    const totalEl    = eid("nk-total-val");

    let delivery = 0;
    let deliveryText;
    if (deliveryState.isPending) {
      deliveryText = "Looking up…";
    } else if (deliveryState.isManual || deliveryState.distanceKm === null) {
      deliveryText = "Delivery quoted manually";
    } else {
      const km = deliveryState.distanceKm;
      if (km <= FREE_KM) {
        deliveryText = "Free (within 15 km)";
      } else {
        const distFee  = Math.round((km - FREE_KM) * 2 * RATE_PER_KM); // round-trip
        const rtHr     = (deliveryState.durationMinutes * 2) / 60;
        const staffFee = Math.ceil(rtHr * 4) / 4 * TRAVEL_RATE;        // rounded up to nearest 0.25 hr
        delivery       = distFee + staffFee;
        deliveryText   = formatMoney(delivery) + " est. (" + km + " km)";
      }
    }

    let sandbags = 0;
    let sandbagText = "N/A";
    if (!lawnsOnly && inflatableCount > 0) {
      if (surface === "Grass") {
        sandbagText = "$0 (grass — no sandbags)";
      } else if (surface === "Indoor gym" || surface === "Concrete or asphalt") {
        sandbags = inflatableCount * SANDBAG_FEE;
        sandbagText = formatMoney(sandbags) + " est. (" + inflatableCount + " unit" + (inflatableCount !== 1 ? "s" : "") + " × $25)";
      } else if (surface === "Artificial turf") {
        sandbagText = "May be required — manual review";
      } else if (surface === "Gravel") {
        sandbagText = "Manual review — setup may not be approved";
      } else if (surface === "Other") {
        sandbagText = "Manual review required";
      } else {
        sandbagText = "Enter surface above";
      }
    }

    if (deliveryEl) deliveryEl.textContent = deliveryText;
    if (sandbagEl) sandbagEl.textContent = sandbagText;
    if (totalEl) totalEl.textContent = formatMoney(subtotal + delivery + sandbags);
  }

  function triggerAddressLookup() {
    const addr = (addressInput?.value || "").trim();
    const city = (cityInput?.value || "").trim();
    if (addr.length > 3) estimateDeliveryFromAddress(addr + (city ? ", " + city : "") + ", NS");
  }

  let _addressDebounce;
  addressInput?.addEventListener("input", () => { clearTimeout(_addressDebounce); _addressDebounce = setTimeout(triggerAddressLookup, 800); });
  cityInput?.addEventListener("input",    () => { clearTimeout(_addressDebounce); _addressDebounce = setTimeout(triggerAddressLookup, 800); });
  surfaceSelect?.addEventListener("change", updateEstimate);

  // Form submission
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = eid("nk-submit-btn");
    const msgEl = eid("nk-form-msg");

    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";
    if (msgEl) { msgEl.hidden = true; msgEl.className = "nk-form-msg"; }

    const fd = new FormData(form);
    const surface = fd.get("setupSurface") || "";

    // Delivery from Worker lookup (deliveryState populated on address input)
    const km = deliveryState.distanceKm;
    let distFee  = 0;
    let staffFee = 0;
    if (!deliveryState.isManual && km !== null && km > FREE_KM) {
      distFee  = Math.round((km - FREE_KM) * 2 * RATE_PER_KM);
      const rtHr = (deliveryState.durationMinutes * 2) / 60;
      staffFee   = Math.ceil(rtHr * 4) / 4 * TRAVEL_RATE;
    }
    const delivery = distFee + staffFee;

    let sandbags = 0;
    if (!lawnsOnly && inflatableCount > 0 && (surface === "Indoor gym" || surface === "Concrete or asphalt")) {
      sandbags = inflatableCount * SANDBAG_FEE;
    }

    const payload = {
      access_key: W3F_KEY,
      subject: "New Nova Kingdom Rentals Quote Request",
      business: "Nova Kingdom Rentals",
      inquiryType: "Availability request — not a confirmed booking",
      name: fd.get("name"),
      email: fd.get("email"),
      phone: fd.get("phone"),
      eventDate: fd.get("eventDate"),
      startTime: fd.get("startTime"),
      endTime: fd.get("endTime"),
      eventAddress: fd.get("eventAddress"),
      city: fd.get("city"),
      province: fd.get("province"),
      postalCode: fd.get("postalCode"),
      setupSurface: surface,
      powerAccess: fd.get("powerAccess"),
      waterAccess: fd.get("waterAccess"),
      guests: fd.get("guests"),
      notes: fd.get("notes"),
      selectedItems: selectedSummary,
      subtotal: formatMoney(subtotal),
      deliveryLookupSource:    deliveryState.isManual ? "manual" : "api",
      deliveryDistanceKm:      km !== null ? String(km) : "",
      deliveryDurationOneWay:  deliveryState.durationMinutes !== null ? String(deliveryState.durationMinutes) : "",
      distanceFeeEstimate:     formatMoney(distFee),
      staffTravelFeeEstimate:  formatMoney(staffFee),
      combinedDeliveryEstimate: deliveryState.isManual ? "Quoted manually" : formatMoney(delivery),
      sandbagUnitCount:        String(lawnsOnly ? 0 : inflatableCount),
      sandbagEstimate:         sandbags > 0 ? formatMoney(sandbags) : (lawnsOnly ? "N/A (lawn games only)" : "Depends on surface"),
      estimatedTotal:          formatMoney(subtotal + delivery + sandbags),
      disclaimer: DISCLAIMER,
    };

    try {
      const res = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error("Submission failed");
      if (msgEl) {
        msgEl.hidden = false;
        msgEl.className = "nk-form-msg success";
        msgEl.textContent = "Quote request sent! We'll confirm availability, delivery cost, and next steps soon.";
      }
      submitBtn.textContent = "Sent!";
      form.reset();
    } catch {
      if (msgEl) {
        msgEl.hidden = false;
        msgEl.className = "nk-form-msg error";
        msgEl.textContent = "Something went wrong. Please call or text 902-990-0005.";
      }
      submitBtn.disabled = false;
      submitBtn.textContent = "Request Availability";
    }
  });

  return sec;
}

// ── Card enhancement ─────────────────────────────────────────────

function parsePrice(text) {
  return parseFloat(String(text).replace(/[^0-9.]/g, "")) || 0;
}

function addToQuoteHandler(id, name, price, isInflatable) {
  return () => {
    const cart = loadCart();
    const already = cart.some((i) => i.id === id);
    if (already) {
      saveCart(cart.filter((i) => i.id !== id));
    } else {
      cart.push({ id, name, price, isInflatable });
      saveCart(cart);
    }
    updateBar();
  };
}

function injectAddButton(container, id, name, priceStr, isInflatable, insertTarget) {
  if (container.querySelector(".nk-add-to-quote")) return;
  const price = parsePrice(priceStr);
  if (!price || !name) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "nk-add-to-quote";
  const inCart = loadCart().some((i) => i.id === id);
  btn.textContent = inCart ? "In Quote ✓" : "Add to Quote";
  if (inCart) btn.classList.add("in-cart");
  btn.dataset.nkQuoteId = id;
  btn.addEventListener("click", () => {
    addToQuoteHandler(id, name, price, isInflatable)();
    const nowInCart = loadCart().some((i) => i.id === id);
    btn.textContent = nowInCart ? "In Quote ✓" : "Add to Quote";
    btn.classList.toggle("in-cart", nowInCart);
  });

  if (insertTarget) {
    insertTarget.insertAdjacentElement("beforebegin", btn);
  } else {
    container.appendChild(btn);
  }
}

function enhanceProductCards() {
  document.querySelectorAll(".product-card:not(.lawn-feature-card):not([data-nk-enhanced])").forEach((card) => {
    card.dataset.nkEnhanced = "1";
    const name = card.querySelector("h3")?.textContent?.trim();
    const priceEl = card.querySelector(".product-body strong") || card.querySelector("strong");
    const slug = name
      ? "product-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-")
      : null;
    if (!name || !priceEl || !slug) return;
    const insertBefore = card.querySelector(".button") || card.querySelector("a");
    injectAddButton(card, slug, name, priceEl.textContent, true, insertBefore);
  });
}

function enhancePackageCards() {
  document.querySelectorAll(".package-card:not([data-nk-enhanced])").forEach((card) => {
    card.dataset.nkEnhanced = "1";
    const name = card.querySelector("h3")?.textContent?.trim();
    const priceEl = card.querySelector("strong");
    const id = name ? "pkg-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-") : null;
    if (!name || !priceEl || !id) return;
    const insertBefore = card.querySelector(".button") || card.querySelector("a") || card.querySelector("[data-package-detail-button]");
    injectAddButton(card, id, name, priceEl.textContent, true, insertBefore);
  });
}

function enhanceProductDetail() {
  const hero = document.querySelector(".product-detail-hero:not([data-nk-enhanced])");
  if (!hero) return;
  hero.dataset.nkEnhanced = "1";
  const name = hero.querySelector("h1")?.textContent?.trim();
  const priceEl = hero.querySelector(".detail-meta span");
  const id = name ? "product-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-") : null;
  if (!name || !priceEl || !id) return;
  const insertBefore = hero.querySelector(".button-row") || hero.querySelector(".button") || hero.querySelector("a");
  injectAddButton(hero, id, name, priceEl.textContent, true, insertBefore);
}

function refreshAddButtons() {
  const cart = loadCart();
  document.querySelectorAll(".nk-add-to-quote[data-nk-quote-id]").forEach((btn) => {
    const inCart = cart.some((i) => i.id === btn.dataset.nkQuoteId);
    btn.textContent = inCart ? "In Quote ✓" : "Add to Quote";
    btn.classList.toggle("in-cart", inCart);
  });
}

function enhanceAll() {
  enhanceProductCards();
  enhancePackageCards();
  enhanceProductDetail();
}

// ── Init ─────────────────────────────────────────────────────────

function init() {
  buildBar();
  buildPanel();
  updateBar();
  enhanceAll();

  const observer = new MutationObserver(() => {
    enhanceAll();
    if (!eid("nk-quote-overlay")?.hidden) renderPanel();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  window.addEventListener("popstate", () => setTimeout(enhanceAll, 100));
  ["pushState", "replaceState"].forEach((method) => {
    const orig = history[method];
    history[method] = function (...args) {
      const result = orig.apply(this, args);
      setTimeout(enhanceAll, 100);
      return result;
    };
  });
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
}
