// Nova Kingdom Rentals — "Help Choose Our Next Attraction for 2027"
// A homepage demand-gauging section injected below the hero. Potential 2027
// additions only — NOT confirmed inventory, no payment / confirmed booking.
// Submits to the existing Web3Forms enquiry system as a "2027 Attraction Enquiry".

const W3F_KEY = "909ed8f7-78ca-494f-b960-1713b60bc012";

const ATTRACTIONS = [
  { key: "obstacle-course",   name: "67-ft Obstacle Course", img: "/images/attractions-2027/67-ft-obstacle-course.jpg?v=2", gallery: ["/images/attractions-2027/67-ft-obstacle-course.jpg?v=2", "/images/attractions-2027/67-ft-obstacle-course-2.jpg?v=2", "/images/attractions-2027/67-ft-obstacle-course-3.jpg?v=2"], reg: 849,  adv: 699, save: 150, dims: "67.2 ft L × 12 ft W × 22 ft H" },
  { key: "jump-and-slide",    name: "Jump & Slide",          img: "/images/attractions-2027/jump-and-slide.jpg",        reg: 749,  adv: 599, save: 150, dims: "26.2 ft L × 19.7 ft W × 16.4 ft H" },
  { key: "meltdown-challenge",name: "Meltdown Challenge",    img: "/images/attractions-2027/meltdown-challenge.jpg?v=2", reg: 1249, adv: 999, save: 250, dims: "19.7 × 19.7 ft footprint" },
];

const DISCLAIMER = "These are potential additions for 2027 and are not yet confirmed. Final selections will depend on demand and advance bookings. Submitting this form does not confirm a reservation. We’ll confirm availability, your full quote and deposit terms—including what happens if the attraction does not go ahead—before arranging payment.";

const money = (n) => "$" + Number(n).toLocaleString("en-CA");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const isHome = () => { const p = window.location.pathname; return p === "/" || p === "" || p === "/index.html"; };

const selected = new Set();

function thumbsHtml(a) {
  if (!a.gallery || a.gallery.length < 2) return "";
  return '<span class="nk27-thumbs">' + a.gallery.map((src, i) =>
    '<span class="nk27-thumb' + (i === 0 ? ' active' : '') + '" role="button" tabindex="0" aria-label="View photo ' + (i + 1) + ' of ' + esc(a.name) + '" data-src="' + src + '">' +
      '<img src="' + src + '" alt="' + esc(a.name) + ' — view ' + (i + 1) + '" loading="lazy">' +
    '</span>'
  ).join("") + '</span>';
}

function cardHtml(a) {
  return (
    '<button type="button" class="nk27-card" data-key="' + a.key + '" aria-pressed="false">' +
      '<span class="nk27-card-check" aria-hidden="true">✓</span>' +
      '<span class="nk27-card-img"><img class="nk27-main-img" src="' + a.img + '" alt="' + esc(a.name) + ' — potential 2027 attraction" loading="lazy"></span>' +
      thumbsHtml(a) +
      '<span class="nk27-card-body">' +
        '<span class="nk27-card-name">' + esc(a.name) + '</span>' +
        '<span class="nk27-card-dims">' + esc(a.dims) + '</span>' +
        '<span class="nk27-card-pricing">' +
          '<span class="nk27-reg">' + money(a.reg) + '</span>' +
          '<span class="nk27-adv">' + money(a.adv) + '</span>' +
          '<span class="nk27-adv-label">advance booking</span>' +
        '</span>' +
        '<span class="nk27-save">Save ' + money(a.save) + '</span>' +
        '<span class="nk27-pick"><span class="pick-off">Tap to select</span><span class="pick-on">Selected</span></span>' +
      '</span>' +
    '</button>'
  );
}

function sectionHtml() {
  const eventTypes = ["Birthday Party", "School Event", "Church / Community Event", "Festival", "Corporate Event", "Fundraiser", "Other"];
  return (
    '<div class="nk27-inner">' +
      '<p class="nk27-eyebrow">Help Shape 2027</p>' +
      '<h2 class="nk27-title">Help Choose Our Next Attraction for 2027</h2>' +
      '<p class="nk27-intro">We’re considering adding one or two exciting new attractions for 2027! Choose your favourite below and request our advance booking offer for your next event.</p>' +
      '<div class="nk27-cards">' + ATTRACTIONS.map(cardHtml).join("") + '</div>' +
      '<p class="nk27-taxnote">Delivery, staffing and applicable taxes will be outlined in your personalised quote.</p>' +
      '<form class="nk27-form" novalidate>' +
        '<div class="nk27-field nk27-full">' +
          '<label>Selected attraction(s) *</label>' +
          '<div class="nk27-selected" id="nk27-selected-display" aria-live="polite">None selected yet — tap a card above to choose one or more.</div>' +
          '<input type="hidden" name="selectedAttractions" id="nk27-selected-input">' +
        '</div>' +
        '<div class="nk27-grid">' +
          '<div class="nk27-field"><label for="nk27-name">Name *</label><input id="nk27-name" name="name" type="text" required></div>' +
          '<div class="nk27-field"><label for="nk27-email">Email *</label><input id="nk27-email" name="email" type="email" required></div>' +
          '<div class="nk27-field"><label for="nk27-phone">Phone <span class="nk27-opt">(optional)</span></label><input id="nk27-phone" name="phone" type="tel"></div>' +
          '<div class="nk27-field"><label for="nk27-date">Event date</label>' +
            '<input id="nk27-date" name="eventDate" type="date">' +
            '<label class="nk27-check"><input type="checkbox" id="nk27-date-undecided"> Date undecided</label>' +
          '</div>' +
          '<div class="nk27-field"><label for="nk27-location">Event location *</label><input id="nk27-location" name="eventLocation" type="text" placeholder="Town / city, Nova Scotia" required></div>' +
          '<div class="nk27-field"><label for="nk27-duration">Rental duration requested *</label><input id="nk27-duration" name="rentalDuration" type="text" placeholder="e.g. 4 hours" required></div>' +
          '<div class="nk27-field"><label for="nk27-type">Event type *</label><select id="nk27-type" name="eventType" required>' +
            '<option value="">Select event type</option>' +
            eventTypes.map((t) => '<option>' + esc(t) + '</option>').join("") +
          '</select></div>' +
        '</div>' +
        '<div class="nk27-field nk27-full"><label for="nk27-details">Additional details <span class="nk27-opt">(optional)</span></label><textarea id="nk27-details" name="additionalDetails" rows="3" placeholder="Anything else that helps us plan your event."></textarea></div>' +
        '<fieldset class="nk27-field nk27-full nk27-deposit">' +
          '<legend>Would you be willing to pay a deposit to secure your preferred date and attraction once we confirm the addition? *</legend>' +
          '<label class="nk27-radio"><input type="radio" name="depositWillingness" value="Yes, I’m ready to discuss booking" required> Yes, I’m ready to discuss booking</label>' +
          '<label class="nk27-radio"><input type="radio" name="depositWillingness" value="I’m interested but need more details"> I’m interested but need more details</label>' +
          '<label class="nk27-radio"><input type="radio" name="depositWillingness" value="Just sharing my preference"> Just sharing my preference</label>' +
        '</fieldset>' +
        '<p class="nk27-disclaimer">' + esc(DISCLAIMER) + '</p>' +
        '<p class="nk27-msg" id="nk27-msg" hidden></p>' +
        '<button type="submit" class="nk27-submit" id="nk27-submit">Request Advance Booking</button>' +
      '</form>' +
      '<div class="nk27-success" id="nk27-success" hidden>' +
        '<h3>Thank you!</h3>' +
        '<p>We’ve received your selection and will contact you to discuss your event and advance booking options.</p>' +
      '</div>' +
    '</div>'
  );
}

function refreshSelected(root) {
  const display = root.querySelector("#nk27-selected-display");
  const input = root.querySelector("#nk27-selected-input");
  if (!display || !input) return;
  const chosen = ATTRACTIONS.filter((a) => selected.has(a.key));
  if (!chosen.length) {
    display.textContent = "None selected yet — tap a card above to choose one or more.";
    display.classList.remove("has-selection");
    input.value = "";
  } else {
    display.textContent = chosen.map((a) => a.name + " (advance " + money(a.adv) + ", reg " + money(a.reg) + ")").join("  •  ");
    display.classList.add("has-selection");
    input.value = chosen.map((a) => a.name + " — advance " + money(a.adv) + " / regular " + money(a.reg) + " (save " + money(a.save) + ")").join("; ");
  }
}

function wire(root) {
  // Card selection (multi-select)
  root.querySelectorAll(".nk27-card").forEach((card) => {
    card.addEventListener("click", () => {
      const key = card.dataset.key;
      if (selected.has(key)) { selected.delete(key); card.setAttribute("aria-pressed", "false"); card.classList.remove("selected"); }
      else                   { selected.add(key);  card.setAttribute("aria-pressed", "true");  card.classList.add("selected"); }
      refreshSelected(root);
    });

    // Photo gallery: thumbnails swap the main image without toggling selection
    const mainImg = card.querySelector(".nk27-main-img");
    const thumbs = card.querySelectorAll(".nk27-thumb");
    const showThumb = (t) => {
      if (!mainImg || !t) return;
      mainImg.src = t.dataset.src;
      thumbs.forEach((x) => x.classList.toggle("active", x === t));
    };
    thumbs.forEach((t) => {
      t.addEventListener("click", (e) => { e.stopPropagation(); showThumb(t); });
      t.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); showThumb(t); } });
    });
  });

  // Date undecided toggles date input
  const dateInput = root.querySelector("#nk27-date");
  const undecided = root.querySelector("#nk27-date-undecided");
  if (undecided && dateInput) {
    undecided.addEventListener("change", () => {
      dateInput.disabled = undecided.checked;
      if (undecided.checked) dateInput.value = "";
    });
  }

  const form = root.querySelector(".nk27-form");
  const msg = root.querySelector("#nk27-msg");
  const submitBtn = root.querySelector("#nk27-submit");
  const successBox = root.querySelector("#nk27-success");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const showErr = (t) => { if (msg) { msg.hidden = false; msg.className = "nk27-msg error"; msg.textContent = t; } };

    if (!selected.size) return showErr("Please select at least one attraction above.");
    const name = form.name.value.trim();
    const email = form.email.value.trim();
    const location = form.eventLocation.value.trim();
    const duration = form.rentalDuration.value.trim();
    const eventType = form.eventType.value;
    const deposit = (form.querySelector('input[name="depositWillingness"]:checked') || {}).value;
    if (!name)      return showErr("Please enter your name.");
    if (!email)     return showErr("Please enter your email.");
    if (!location)  return showErr("Please enter your event location.");
    if (!duration)  return showErr("Please enter the rental duration you’d like.");
    if (!eventType) return showErr("Please choose an event type.");
    if (!deposit)   return showErr("Please answer the deposit question.");

    const dateVal = undecided && undecided.checked ? "Date undecided" : (dateInput.value || "Not provided");
    const chosen = ATTRACTIONS.filter((a) => selected.has(a.key));

    if (msg) msg.hidden = true;
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Sending…"; }

    const payload = {
      access_key: W3F_KEY,
      botcheck: "",
      subject: "2027 Attraction Enquiry",
      from_name: name || "Website Visitor",
      replyto: email,
      business: "Nova Kingdom Rentals",
      enquiryType: "2027 Attraction Enquiry — potential future addition, not a confirmed booking",
      selectedAttractions: chosen.map((a) => a.name + " (advance " + money(a.adv) + " / regular " + money(a.reg) + ", save " + money(a.save) + ")").join("; "),
      name: name,
      email: email,
      phone: form.phone.value.trim() || "Not provided",
      eventDate: dateVal,
      eventLocation: location,
      rentalDuration: duration,
      eventType: eventType,
      additionalDetails: form.additionalDetails.value.trim() || "None",
      depositWillingness: deposit,
      disclaimerShown: DISCLAIMER,
    };
    // Per-attraction flags so demand can be tracked for each option.
    ATTRACTIONS.forEach((a) => { payload["interest_" + a.key.replace(/-/g, "_")] = selected.has(a.key) ? ("Yes — " + a.name) : "No"; });

    try {
      const res = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Submission failed");
      // Only show success after the submission has actually been delivered.
      if (form) form.hidden = true;
      if (successBox) successBox.hidden = false;
      successBox && successBox.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (err) {
      showErr("Sorry — we couldn’t send that just now. Please call or text 902-990-0005, or try again." + (err && err.message ? " (" + err.message + ")" : ""));
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Request Advance Booking"; }
    }
  });
}

function inject() {
  if (!isHome()) { cleanup(); return; }
  if (document.getElementById("nk-2027-attractions")) return;
  const hero = document.querySelector(".home-hero-scroll") || document.querySelector(".home-hero");
  if (!hero) return;
  const sec = document.createElement("section");
  sec.id = "nk-2027-attractions";
  sec.className = "nk27";
  sec.setAttribute("aria-label", "Help choose our next attraction for 2027");
  sec.innerHTML = sectionHtml();
  // Restore any prior selection visual state
  selected.forEach((k) => {
    const c = sec.querySelector('.nk27-card[data-key="' + k + '"]');
    if (c) { c.classList.add("selected"); c.setAttribute("aria-pressed", "true"); }
  });
  (hero.insertAdjacentElement ? hero : hero).insertAdjacentElement("afterend", sec);
  refreshSelected(sec);
  wire(sec);
}

function cleanup() {
  const sec = document.getElementById("nk-2027-attractions");
  if (sec && !isHome()) sec.remove();
}

function boot() {
  try {
    inject();
    let busy = false;
    const obs = new MutationObserver(() => {
      if (busy) return; busy = true;
      requestAnimationFrame(() => { inject(); busy = false; });
    });
    obs.observe(document.body, { childList: true, subtree: true });
    const sched = () => setTimeout(inject, 80);
    window.addEventListener("popstate", sched);
    if (!window.NK2027HistoryPatched) {
      window.NK2027HistoryPatched = true;
      ["pushState", "replaceState"].forEach((m) => {
        const orig = history[m];
        history[m] = function (...args) { const r = orig.apply(this, args); sched(); return r; };
      });
    }
  } catch (err) {
    console.error("NK 2027 attractions section failed:", err);
  }
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  if (window.NK2027Initialized) { /* already running */ }
  else {
    window.NK2027Initialized = true;
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
    else boot();
  }
}
