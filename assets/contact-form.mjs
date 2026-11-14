// Nova Kingdom Rentals — new two-step contact form + "Get a Free Quote" strip.
//
// Safe-enhancement rules (same as rentals-categories.mjs):
//  * never moves, removes or edits React-rendered nodes;
//  * the old React form is only hidden by a CSS rule keyed off an attribute on
//    <html> (html[data-nkcontact]), which React does not manage;
//  * our own elements are inserted as siblings.
// Submits to the existing Web3Forms inbox; fires Meta Pixel "Lead" exactly once
// per successful submission (never on load / failed / invalid submit).

const W3F_KEY = "909ed8f7-78ca-494f-b960-1713b60bc012";
const CART_KEY = "nk_quote_v1";

const INTERESTS = ["Inflatables", "Water Slides", "Foam Party", "Photo / Video Booth", "Lawn Games", "Tables & Chairs", "Packages", "Not sure yet"];
const EVENT_TYPES = ["Birthday", "School function", "Community event", "Festival", "Fundraiser", "Corporate", "Church", "Grand opening", "Other"];
const SURFACES = ["Grass", "Indoor (gym, hall)", "Asphalt / concrete", "Not sure"];
const ATTENDANTS = ["Nova Kingdom attendant (extra cost)", "Our own adult volunteers", "Not sure"];
const CALL = ["Yes, please call", "Text or email is fine"];

const CSS = `
html[data-nkcontact] .contact-layout > form.booking-form{display:none!important}
#nk-cf{min-width:0}
#nk-cf .cf-card{background:#fff;border:1px solid #e3dcc4;border-radius:16px;padding:16px;margin-bottom:14px;color:#16203a}
#nk-cf h2{margin:0 0 4px;font-size:1.15rem;color:#16203a}
#nk-cf .cf-sub{margin:0 0 10px;color:#5b6475;font-size:.88rem}
#nk-cf .cf-step{display:inline-block;background:#f0d16a;color:#1a1300;font-weight:800;font-size:.7rem;border-radius:999px;padding:.2rem .55rem;margin-bottom:6px;letter-spacing:.04em}
#nk-cf .cf-step.opt{background:#eef0f5;color:#5b6475}
#nk-cf .cf-pick{display:flex;align-items:center;gap:10px;border:1px solid #e3dcc4;border-radius:12px;padding:8px;margin-bottom:8px}
#nk-cf .cf-pick img{width:56px;height:42px;object-fit:cover;border-radius:8px;background:#f3efe2;flex-shrink:0}
#nk-cf .cf-pick b{display:block;font-size:.92rem}#nk-cf .cf-pick small{color:#5b6475}
#nk-cf .cf-link{background:none;border:0;color:#2f62b5;font:inherit;font-weight:700;text-decoration:underline;cursor:pointer;padding:0}
#nk-cf label,#nk-cf .cf-q{display:block;font-weight:700;font-size:.88rem;margin:12px 0 5px;color:#16203a}
#nk-cf label i,#nk-cf .cf-q i{color:#c0392b;font-style:normal}
#nk-cf label em,#nk-cf .cf-q em{color:#5b6475;font-weight:500;font-style:normal}
#nk-cf input,#nk-cf select,#nk-cf textarea{width:100%;box-sizing:border-box;font:inherit;font-size:16px;border:1px solid #cfd3de;border-radius:10px;padding:.65rem .7rem;min-height:46px;background:#fff;color:#16203a}
#nk-cf textarea{min-height:84px}
#nk-cf input[aria-invalid=true]{border-color:#c0392b;background:#fff6f5}
#nk-cf .cf-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media(max-width:380px){#nk-cf .cf-row{grid-template-columns:1fr}}
#nk-cf .cf-chips{display:flex;flex-wrap:wrap;gap:8px}
#nk-cf .cf-chip{border:1px solid #cfd3de;border-radius:999px;padding:.5rem .85rem;font:inherit;font-weight:700;font-size:.88rem;background:#fff;color:#16203a;cursor:pointer;min-height:40px}
#nk-cf .cf-chip[aria-pressed=true]{background:#f0d16a;border-color:#e0bd45;color:#1a1300}
#nk-cf .cf-chip:focus-visible,#nk-cf .cf-more:focus-visible{outline:3px solid #caa63a;outline-offset:2px}
#nk-cf .cf-more{display:flex;width:100%;justify-content:space-between;align-items:center;font:inherit;font-weight:800;border:1px dashed #c9b97a;border-radius:12px;padding:13px 14px;background:#fffbea;color:#16203a;cursor:pointer;margin-bottom:14px}
#nk-cf .cf-send{display:block;width:100%;border:0;border-radius:12px;background:#f0d16a;color:#1a1300;font:inherit;font-weight:900;font-size:1.05rem;padding:15px;cursor:pointer}
#nk-cf .cf-send[disabled]{opacity:.6;cursor:wait}
#nk-cf .cf-note{color:#5b6475;font-size:.8rem;text-align:center;margin:8px 0 0}
#nk-cf .cf-msg{border-radius:10px;padding:.7rem .8rem;margin:0 0 10px;font-weight:700;font-size:.9rem}
#nk-cf .cf-msg.err{background:#fdecea;color:#9b2c22;border:1px solid #f3c1bb}
#nk-cf .cf-done{text-align:center;padding:26px 16px}
#nk-cf .cf-done h2{font-size:1.3rem}
.nk-quote-strip{max-width:1180px;margin:28px auto 20px;padding:0 16px}
.nk-quote-strip > div{background:#0b1020;color:#fff;border-radius:16px;padding:20px 16px;text-align:center;border:1px solid #232a44}
.nk-quote-strip h3{margin:0 0 4px;color:#fff;font-size:1.25rem}
.nk-quote-strip p{margin:0 0 12px;color:#c9cede;font-size:.92rem}
.nk-quote-strip a{display:inline-flex;align-items:center;min-height:44px;background:#f0d16a;color:#1a1300;font-weight:900;border-radius:999px;padding:.6rem 1.3rem;text-decoration:none;margin:4px}
.nk-quote-strip a.ghost{background:#fff;color:#0b1020}
`;

function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }
function path() { return window.location.pathname.replace(/\/+$/, "") || "/"; }
function loadCart() { try { const c = JSON.parse(sessionStorage.getItem(CART_KEY) || "[]"); return Array.isArray(c) ? c : []; } catch (e) { return []; } }
function money(n) { return typeof n === "number" ? "$" + n.toLocaleString("en-CA") : ""; }

let productImg = null;
function loadProductImages() {
  if (productImg) return Promise.resolve(productImg);
  return fetch("/data/products.json").then((r) => (r.ok ? r.json() : [])).then((list) => {
    productImg = {};
    (Array.isArray(list) ? list : []).forEach((p) => { productImg["product-" + p.slug] = p.image; productImg["product-" + p.id] = p.image; });
    return productImg;
  }).catch(() => (productImg = {}));
}

function chips(name, opts, multi) {
  return '<div class="cf-chips" data-group="' + name + '" data-multi="' + (multi ? 1 : 0) + '" role="group">' +
    opts.map((o) => '<button type="button" class="cf-chip" aria-pressed="false" data-val="' + esc(o) + '">' + esc(o) + "</button>").join("") + "</div>";
}

function formHtml() {
  return '<div class="cf-card" id="cf-picks-card" hidden><h2>Your picks</h2><p class="cf-sub">From your quote — <button type="button" class="cf-link" id="cf-edit">edit your quote</button></p><div id="cf-picks"></div></div>' +
  '<form id="cf-form" novalidate>' +
  '<div class="cf-card"><span class="cf-step">STEP 1 · REQUIRED</span><h2>Your event</h2>' +
  '<div id="cf-interest-wrap"><span class="cf-q">What are you interested in? <em>(tap all that apply)</em></span>' + chips("interestedIn", INTERESTS, true) + "</div>" +
  '<div class="cf-row"><div><label for="cf-first">First name <i>*</i></label><input id="cf-first" name="firstName" autocomplete="given-name" required></div>' +
  '<div><label for="cf-last">Last name <i>*</i></label><input id="cf-last" name="lastName" autocomplete="family-name" required></div></div>' +
  '<div class="cf-row"><div><label for="cf-phone">Phone <i>*</i></label><input id="cf-phone" name="phone" type="tel" autocomplete="tel" required></div>' +
  '<div><label for="cf-email">Email <i>*</i></label><input id="cf-email" name="email" type="email" autocomplete="email" required></div></div>' +
  '<label for="cf-date">Event date <i>*</i></label><input id="cf-date" name="eventDate" type="date" required>' +
  '<label for="cf-addr">Event address <i>*</i></label><input id="cf-addr" name="eventAddress" autocomplete="street-address" placeholder="Street, town" required>' +
  '<input type="checkbox" name="botcheck" tabindex="-1" autocomplete="off" style="display:none">' +
  "</div>" +
  '<button type="button" class="cf-more" id="cf-more" aria-expanded="false" aria-controls="cf-opt">＋ Add more details (optional) <span aria-hidden="true">▾</span></button>' +
  '<div class="cf-card" id="cf-opt" hidden><span class="cf-step opt">STEP 2 · OPTIONAL</span><h2>More details</h2><p class="cf-sub">Helps us quote faster — skip anything.</p>' +
  '<span class="cf-q">Type of event</span>' + chips("eventType", EVENT_TYPES, true) +
  '<div class="cf-row"><div><label for="cf-start">Start time</label><input id="cf-start" name="startTime" type="time"></div><div><label for="cf-end">End time</label><input id="cf-end" name="endTime" type="time"></div></div>' +
  '<label for="cf-guests">Estimated number of guests</label><input id="cf-guests" name="guests" inputmode="numeric" placeholder="e.g. 40 kids">' +
  '<span class="cf-q">Setup surface</span>' + chips("setupSurface", SURFACES, false) +
  '<div class="cf-row"><div><label for="cf-power">Power nearby?</label><select id="cf-power" name="powerAccess"><option value="">Choose</option><option>Yes</option><option>No</option><option>Not sure</option></select></div>' +
  '<div><label for="cf-water">Water hose nearby?</label><select id="cf-water" name="waterAccess"><option value="">Choose</option><option>Yes</option><option>No</option><option>Not sure</option></select></div></div>' +
  '<span class="cf-q">Attendants / supervisors</span>' + chips("attendants", ATTENDANTS, false) +
  '<label for="cf-org">School / organization <em>(if any)</em></label><input id="cf-org" name="organization" autocomplete="organization">' +
  '<label for="cf-budget">Approximate budget <em>(optional)</em></label><input id="cf-budget" name="budget" placeholder="e.g. $500–$800">' +
  '<span class="cf-q">Would you like a call from us?</span>' + chips("callPreference", CALL, false) +
  '<label for="cf-notes">Anything else?</label><textarea id="cf-notes" name="notes" placeholder="Theme, age of kids, questions…"></textarea>' +
  "</div>" +
  '<div class="cf-msg err" id="cf-err" role="alert" hidden></div>' +
  '<button type="submit" class="cf-send" id="cf-send">Send Request</button>' +
  '<p class="cf-note">Requests are not a confirmed booking. We confirm availability, delivery and setup with you first.</p>' +
  "</form>";
}

function chosen(form, group) {
  return [...form.querySelectorAll('[data-group="' + group + '"] .cf-chip[aria-pressed="true"]')].map((b) => b.getAttribute("data-val"));
}

function renderPicks(root) {
  const cart = loadCart();
  const card = root.querySelector("#cf-picks-card");
  const wrap = root.querySelector("#cf-interest-wrap");
  if (!cart.length) { card.hidden = true; wrap.hidden = false; return; }
  card.hidden = false; wrap.hidden = true;
  loadProductImages().then((imgs) => {
    root.querySelector("#cf-picks").innerHTML = cart.map((i) => {
      const img = imgs[i.id] || (i.image || "");
      return '<div class="cf-pick">' + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy">' : '<img alt="">') +
        "<div><b>" + esc(i.name) + "</b><small>" + esc(money(i.price)) + "</small></div></div>";
    }).join("");
  });
}

function wire(root) {
  const form = root.querySelector("#cf-form");
  root.addEventListener("click", (e) => {
    const chip = e.target.closest(".cf-chip");
    if (chip) {
      const grp = chip.parentElement;
      const on = chip.getAttribute("aria-pressed") !== "true";
      if (grp.getAttribute("data-multi") !== "1") grp.querySelectorAll(".cf-chip").forEach((c) => c.setAttribute("aria-pressed", "false"));
      chip.setAttribute("aria-pressed", on ? "true" : "false");
      return;
    }
    if (e.target.closest("#cf-more")) {
      const btn = root.querySelector("#cf-more"); const opt = root.querySelector("#cf-opt");
      opt.hidden = !opt.hidden; btn.setAttribute("aria-expanded", String(!opt.hidden));
      btn.firstChild.textContent = opt.hidden ? "＋ Add more details (optional) " : "－ Hide optional details ";
      return;
    }
    if (e.target.closest("#cf-edit")) { const b = document.getElementById("nk-bar-open"); if (b) b.click(); }
  });

  let sending = false;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (sending) return;
    const err = root.querySelector("#cf-err");
    const showErr = (t, field) => { err.hidden = false; err.textContent = t; if (field) { field.setAttribute("aria-invalid", "true"); field.focus(); } };
    err.hidden = true;
    form.querySelectorAll("[aria-invalid]").forEach((x) => x.removeAttribute("aria-invalid"));
    const v = (n) => (form.elements[n] ? String(form.elements[n].value || "").trim() : "");
    const checks = [["firstName", "Please enter your first name."], ["lastName", "Please enter your last name."], ["phone", "Please enter your phone number."], ["email", "Please enter your email."], ["eventDate", "Please choose your event date."], ["eventAddress", "Please enter the event address."]];
    for (const [n, msg] of checks) { if (!v(n)) return showErr(msg, form.elements[n]); }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v("email"))) return showErr("Please check your email address.", form.elements.email);
    if (form.elements.botcheck && form.elements.botcheck.checked) return;

    const cart = loadCart();
    const name = v("firstName") + " " + v("lastName");
    const payload = {
      access_key: W3F_KEY,
      botcheck: "",
      subject: "New Nova Kingdom Rentals Booking Inquiry",
      from_name: name || "Website Visitor",
      replyto: v("email"),
      business: "Nova Kingdom Rentals",
      formVersion: "Contact form v2 (two-step)",
      name: name, firstName: v("firstName"), lastName: v("lastName"),
      phone: v("phone"), email: v("email"),
      eventDate: v("eventDate"), eventAddress: v("eventAddress"),
      selectedItems: cart.length ? cart.map((i) => i.name + (typeof i.price === "number" ? " (" + money(i.price) + ")" : "")).join("; ") : "None (no quote cart items)",
      interestedIn: chosen(form, "interestedIn").join(", ") || "Not specified",
      eventType: chosen(form, "eventType").join(", ") || "Not specified",
      startTime: v("startTime") || "Not provided", endTime: v("endTime") || "Not provided",
      guests: v("guests") || "Not provided",
      setupSurface: chosen(form, "setupSurface")[0] || "Not specified",
      powerAccess: v("powerAccess") || "Not specified", waterAccess: v("waterAccess") || "Not specified",
      attendants: chosen(form, "attendants")[0] || "Not specified",
      organization: v("organization") || "None",
      budget: v("budget") || "Not provided",
      callPreference: chosen(form, "callPreference")[0] || "Not specified",
      notes: v("notes") || "None",
      pageUrl: window.location.href,
    };

    sending = true;
    const send = root.querySelector("#cf-send");
    send.disabled = true; send.textContent = "Sending…";
    try {
      const res = await fetch("https://api.web3forms.com/submit", {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.message || "Submission failed");
      if (typeof window !== "undefined" && window.fbq) window.fbq("track", "Lead");
      root.innerHTML = '<div class="cf-card cf-done" role="status"><h2>Thanks, ' + esc(v("firstName") || "we got it") + '! 🎉</h2>' +
        "<p>Your request was sent. We'll check availability and get back to you shortly with a full quote.</p>" +
        '<p>Need us sooner? Call or text <a href="tel:+19029900005">902-990-0005</a>.</p></div>';
      root.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (ex) {
      sending = false; send.disabled = false; send.textContent = "Send Request";
      showErr("Sorry — we couldn't send that just now. Please try again, or call/text 902-990-0005.");
    }
  });
}

function injectStyle() {
  if (document.getElementById("nk-cf-style")) return;
  const st = document.createElement("style"); st.id = "nk-cf-style"; st.textContent = CSS;
  document.head.appendChild(st);
}

function syncContact() {
  const onContact = path() === "/contact";
  const root = document.documentElement;
  const existing = document.getElementById("nk-cf");
  if (!onContact) {
    if (root.hasAttribute("data-nkcontact")) root.removeAttribute("data-nkcontact");
    if (existing) existing.remove();
    return;
  }
  if (existing) return;
  const oldForm = document.querySelector(".contact-layout > form.booking-form");
  if (!oldForm) return;
  const box = document.createElement("div");
  box.id = "nk-cf";
  box.innerHTML = formHtml();
  oldForm.insertAdjacentElement("beforebegin", box);
  root.setAttribute("data-nkcontact", "1");
  wire(box);
  renderPicks(box);
}

function syncStrip() {
  const show = path() !== "/contact";
  const strip = document.getElementById("nk-quote-strip");
  if (!show) { if (strip) strip.remove(); return; }
  if (strip) return;
  const footer = document.querySelector("#root footer.site-footer");
  if (!footer) return;
  const el = document.createElement("section");
  el.id = "nk-quote-strip"; el.className = "nk-quote-strip"; el.setAttribute("aria-label", "Get a free quote");
  el.innerHTML = "<div><h3>Planning an event?</h3><p>Tell us your date — we'll check availability and send a free quote.</p>" +
    '<a href="/contact">Get a Free Quote</a><a class="ghost" href="tel:+19029900005">Call 902-990-0005</a></div>';
  footer.insertAdjacentElement("beforebegin", el);
}

function sync() { try { syncContact(); } catch (e) {} try { syncStrip(); } catch (e) {} }

function boot() {
  injectStyle();
  sync();
  let busy = false;
  new MutationObserver(() => {
    if (busy) return; busy = true;
    requestAnimationFrame(() => { sync(); busy = false; });
  }).observe(document.body, { childList: true, subtree: true });
  window.addEventListener("popstate", () => setTimeout(sync, 80));
}

if (typeof window !== "undefined" && typeof document !== "undefined" && !window.NKContactInit) {
  window.NKContactInit = true;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
}
