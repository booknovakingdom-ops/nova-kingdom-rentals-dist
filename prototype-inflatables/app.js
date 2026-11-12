/* Nova Kingdom Rentals — Inflatable Catalog PROTOTYPE app.
   Vanilla JS, no framework. Local-only quote cart. Prototype, not production. */
(function () {
  "use strict";
  var D = window.NKR_DATA;
  var CART_KEY = "nkr_proto_cart_v1"; // prototype-scoped; never touches production cart
  var byId = {};
  D.products.forEach(function (p) { byId[p.id] = p; });
  byId[D.lawnGames.id] = D.lawnGames;

  var root = document.getElementById("view-root");
  var liveRegion = document.createElement("div");
  liveRegion.className = "visually-hidden";
  liveRegion.setAttribute("aria-live", "polite");
  document.body.appendChild(liveRegion);

  /* ---------- helpers ---------- */
  function money(n) { return "$" + Number(n).toLocaleString("en-CA"); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function el(html) { var t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; }
  function cardPrice(p) { return p.fromPrice ? ('<span class="price">From ' + money(p.price) + '</span>')
    : ('<span class="price">' + money(p.price) + '</span>'); }
  function detailUrl(p) { return D.detailBase + p.slug; }

  /* ---------- cart ---------- */
  function loadCart() { try { return JSON.parse(localStorage.getItem(CART_KEY) || "[]"); } catch (e) { return []; } }
  function saveCart(c) { try { localStorage.setItem(CART_KEY, JSON.stringify(c)); } catch (e) {} updateCartUi(); }
  function cartHas(id) { return loadCart().some(function (i) { return i.id === id; }); }
  function cartTotal(c) { return (c || loadCart()).reduce(function (s, i) { return s + i.unitPrice; }, 0); }

  function productCartLine(p, config) {
    var line = { id: p.id, kind: "product", name: p.name, image: p.image, slug: p.slug, unitPrice: p.price, sub: p.type };
    if (p.configs) {
      var cfg = p.configs.filter(function (c) { return c.id === config; })[0] || p.configs[0];
      line.config = cfg.id; line.unitPrice = cfg.price; line.sub = p.type + " · " + cfg.label;
    }
    return line;
  }
  function addProduct(id, config) {
    var p = byId[id]; if (!p || p.status === "coming-soon") return;
    var c = loadCart();
    var existing = c.filter(function (i) { return i.id === id; })[0];
    if (existing) { // update config if provided, else leave
      if (p.configs && config) { var nl = productCartLine(p, config); existing.config = nl.config; existing.unitPrice = nl.unitPrice; existing.sub = nl.sub; }
    } else { c.push(productCartLine(p, config)); }
    saveCart(c);
  }
  function removeItem(key) { saveCart(loadCart().filter(function (i) { return (i.key || i.id) !== key; })); }
  function toggleProduct(id, config) {
    if (cartHas(id)) { removeItem(id); } else { addProduct(id, config); }
  }
  function setConfig(id, config) { var p = byId[id]; if (!cartHas(id)) return; addProduct(id, config); }

  function addPackage(pkg, swaps) {
    var price = computePkgPrice(pkg, swaps);
    var items = resolvePkgItems(pkg, swaps).map(function (it) { return it.name; });
    var key = "pkg:" + pkg.id + (swaps && Object.keys(swaps).length ? ":" + Object.keys(swaps).map(function (k) { return k + ">" + swaps[k]; }).join(",") : "");
    var c = loadCart();
    c.push({ id: key, key: key, kind: "package", name: pkg.name, unitPrice: price, image: firstPkgImage(pkg, swaps), sub: items.join(", ") });
    saveCart(c);
    openCart();
  }

  function updateCartUi() {
    var c = loadCart();
    document.getElementById("cart-count").textContent = c.length;
    var wrap = document.getElementById("cart-items");
    if (!c.length) { wrap.innerHTML = '<p class="muted" style="padding:1.2rem 0">Your quote is empty. Add inflatables or a package to build an estimate.</p>'; }
    else {
      wrap.innerHTML = c.map(function (i) {
        var k = i.key || i.id;
        return '<div class="cart-item">' +
          (i.image ? '<img src="' + esc(i.image) + '" alt="" />' : '') +
          '<div class="ci-main"><div class="ci-name">' + esc(i.name) + '</div>' +
          '<div class="ci-sub">' + esc(i.sub || "") + '</div>' +
          '<button class="rm" data-rm="' + esc(k) + '">Remove</button></div>' +
          '<div class="ci-price">' + money(i.unitPrice) + '</div></div>';
      }).join("");
    }
    document.getElementById("cart-total").textContent = money(cartTotal(c));
    // reflect in any visible Add buttons
    document.querySelectorAll("[data-add]").forEach(function (b) {
      var inCart = cartHas(b.getAttribute("data-add"));
      b.setAttribute("aria-pressed", inCart ? "true" : "false");
      b.textContent = inCart ? "In Quote ✓" : "Add to Quote";
    });
  }

  /* ---------- package pricing ---------- */
  function stdPrice(id) { var x = byId[id]; return x ? x.price : 0; }
  function computePkgPrice(pkg, swaps) {
    var price = pkg.price;
    if (swaps) { Object.keys(swaps).forEach(function (orig) { price += stdPrice(swaps[orig]) - stdPrice(orig); }); }
    return price;
  }
  function resolvePkgItems(pkg, swaps) {
    return pkg.items.map(function (id) { var real = (swaps && swaps[id]) ? swaps[id] : id; return byId[real]; });
  }
  function firstPkgImage(pkg, swaps) { var it = resolvePkgItems(pkg, swaps)[0]; return it && it.image; }

  /* ---------- routing ---------- */
  function parseHash() {
    var h = (location.hash || "").replace(/^#/, "");
    var view = "home", type = "all";
    if (h) {
      var q = h.split("?");
      view = q[0] || "home";
      if (q[1]) { var m = /type=([a-z-]+)/.exec(q[1]); if (m) type = m[1]; }
    }
    var validViews = ["home", "inflatables", "packages", "foam", "booths", "essentials", "other", "contact"];
    if (validViews.indexOf(view) === -1) view = "home";
    if (!D.categories.some(function (c) { return c.id === type; })) type = "all";
    return { view: view, type: type };
  }
  var currentView = null;
  function go(view) { location.hash = view; }

  function onRoute() {
    var r = parseHash();
    // category change within inflatables: filter only, do not re-render (keeps images, cart, focus)
    if (r.view === "inflatables" && currentView === "inflatables") { applyFilter(r.type, false); return; }
    currentView = r.view;
    document.querySelectorAll("#nav button[data-view]").forEach(function (b) {
      b.setAttribute("aria-current", b.getAttribute("data-view") === r.view ? "page" : "false");
    });
    render(r);
    // move focus to main heading for a11y on view change (not on filter-only changes)
    var h = root.querySelector("h1"); if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
    window.scrollTo(0, 0);
  }

  /* ---------- views ---------- */
  function render(r) {
    switch (r.view) {
      case "inflatables": renderInflatables(r.type); break;
      case "packages": renderPackages(); break;
      case "foam": renderFoam(); break;
      case "booths": renderBooths(); break;
      case "essentials": renderEssentials(); break;
      case "other": renderOther(); break;
      case "contact": renderContact(); break;
      default: renderHome();
    }
    updateCartUi();
  }

  function renderHome() {
    root.innerHTML =
      '<section class="hero"><p class="eyebrow">Nova Kingdom Rentals</p>' +
      '<h1>Party rentals, made easy to browse</h1>' +
      '<p class="lede">A prototype of a cleaner, category-first way to find the right rental — built around Nova Kingdom Rentals’ real inventory. Start with inflatables.</p>' +
      '<div class="card-cta" style="max-width:420px"><button class="btn btn-primary" data-go="inflatables">Browse Inflatables</button>' +
      '<button class="btn btn-ghost" data-go="packages">See Packages</button></div></section>' +
      '<section class="section"><h2>Explore by category</h2><div class="other-grid">' +
      [["inflatables", "Inflatables", "Bounce & slide combos, obstacle courses, water fun, games and more."],
       ["packages", "Packages", "Bundle attractions and save."],
       ["foam", "Foam Party", "High-energy foam fun by guest count."],
       ["booths", "Photo & Video Booths", "360 Video Booth and Mirror Photo Booth."],
       ["essentials", "Event Essentials", "Chairs, tables and tents."],
       ["other", "Other Rentals", "Generator and lawn games."]]
        .map(function (c) { return '<button class="other-card" data-go="' + c[0] + '"><h3>' + esc(c[1]) + '</h3><p>' + esc(c[2]) + '</p></button>'; }).join("") +
      '</div></section>';
  }

  function categoryCount(type) {
    return D.products.filter(function (p) { return type === "all" || p.tags.indexOf(type) !== -1; }).length;
  }

  function renderInflatables(type) {
    var chips = D.categories.map(function (c) {
      return '<button class="chip" role="button" data-type="' + c.id + '" aria-pressed="false">' +
        esc(c.label) + ' <span class="chip-n">(' + categoryCount(c.id) + ')</span></button>';
    }).join("");

    var cards = D.products.map(function (p) {
      var soon = p.status === "coming-soon";
      var addBtn = soon
        ? '<button class="btn btn-ghost" data-check="' + p.id + '">Check Availability</button>'
        : '<button class="btn btn-primary" data-add="' + p.id + '" aria-pressed="false">Add to Quote</button>';
      return '<article class="card" data-tags="' + esc(p.tags.join(" ")) + '" data-pid="' + p.id + '">' +
        '<div class="card-media">' +
          '<img src="' + esc(p.image) + '" alt="' + esc(p.name) + ' inflatable rental" loading="lazy" />' +
          '<span class="badge ' + (soon ? "coming-soon" : "available") + '">' + (soon ? "Coming Soon" : "Available Now") + '</span>' +
          (p.wet ? '<span class="wetchip">Wet / Dry</span>' : '') +
        '</div>' +
        '<div class="card-body">' +
          '<span class="ptype">' + esc(p.type) + '</span>' +
          '<h3>' + esc(p.name) + '</h3>' +
          cardPrice(p) +
          (p.dims ? '<div class="dims">' + esc(p.dims) + '</div>' : '') +
          '<div class="bestfor"><b>Best for:</b> ' + esc(p.bestFor.join(" • ")) + '</div>' +
          '<div class="card-cta">' +
            '<button class="btn btn-ghost" data-details="' + p.id + '">View Details</button>' +
            addBtn +
          '</div>' +
        '</div></article>';
    }).join("");

    root.innerHTML =
      '<section class="hero"><p class="eyebrow">Nova Kingdom Rentals</p>' +
      '<h1>Inflatable Rentals &amp; Bouncy Castles</h1>' +
      '<p class="lede">Commercial-grade bouncy castles, combos, obstacle courses, water slides and games — delivered and set up across the South Shore and Nova Scotia. Pick a type below to narrow things down.</p></section>' +
      '<section class="section" aria-labelledby="browse-h">' +
        '<div class="filter-head"><h2 id="browse-h">Browse Inflatables by Type</h2>' +
        '<span class="result-count" id="result-count"></span></div>' +
        '<div class="filterbar"><div class="chips" role="group" aria-label="Filter inflatables by type">' + chips + '</div></div>' +
        '<div class="grid" id="grid">' + cards + '</div>' +
        '<div class="empty hidden" id="empty"><p>No rentals are currently listed in this category.</p>' +
          '<button class="btn btn-primary" data-type="all" style="max-width:240px;margin:0 auto">View All Inflatables</button></div>' +
      '</section>' +
      renderOtherRentalsSection() +
      '<div class="cta-band"><h2>Ready to build your quote?</h2>' +
      '<p class="muted">Add items as you browse, then review your estimate. Delivery extra · HST extra.</p>' +
      '<button class="btn btn-primary" id="cta-open-cart" style="max-width:260px;margin:.4rem auto 0">View Your Quote</button></div>';

    applyFilter(type, true);
  }

  function applyFilter(type, silent) {
    var grid = document.getElementById("grid"); if (!grid) return;
    var shown = 0;
    grid.querySelectorAll(".card").forEach(function (card) {
      var tags = (card.getAttribute("data-tags") || "").split(" ");
      var match = type === "all" || tags.indexOf(type) !== -1;
      card.classList.toggle("hidden", !match);
      if (match) shown++;
    });
    document.querySelectorAll(".chip").forEach(function (ch) {
      ch.setAttribute("aria-pressed", ch.getAttribute("data-type") === type ? "true" : "false");
    });
    var empty = document.getElementById("empty");
    if (empty) empty.classList.toggle("hidden", shown > 0);
    var rc = document.getElementById("result-count");
    var label = (D.categories.filter(function (c) { return c.id === type; })[0] || {}).label || "";
    if (rc) rc.textContent = "Showing " + shown + " inflatable" + (shown === 1 ? "" : "s") + (type !== "all" ? " · " + label : "");
    if (!silent) liveRegion.textContent = shown + " inflatables shown in " + label;
  }

  function renderOtherRentalsSection() {
    return '<section class="section" aria-labelledby="other-h"><h2 id="other-h">Explore Other Rentals</h2>' +
      '<p class="section-lead">Looking for something other than inflatables? These live in their own areas.</p>' +
      '<div class="other-grid">' + D.otherRentals.map(function (o) {
        return '<button class="other-card" data-go="' + o.view + '"><h3>' + esc(o.name) + '</h3><p>' + esc(o.desc) + '</p></button>';
      }).join("") + '</div></section>';
  }

  function renderPackages() {
    var cards = D.packages.map(function (pkg) {
      var items = pkg.items.map(function (id) { return byId[id] ? byId[id].name : id; });
      return '<div class="pkg"><h3>' + esc(pkg.name) + '</h3>' +
        '<div class="pkg-price">' + money(pkg.price) + '</div>' +
        '<ul>' + items.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join("") + '</ul>' +
        '<div class="pkg-cta">' +
          '<button class="btn btn-primary" data-add-pkg="' + pkg.id + '">Add to Quote</button>' +
          (pkg.customizable ? '<button class="btn btn-ghost" data-custom-pkg="' + pkg.id + '">Customize This Package</button>' : '<span class="muted" style="font-size:.8rem;align-self:center">Fixed package</span>') +
        '</div></div>';
    }).join("");
    root.innerHTML = '<section class="hero"><p class="eyebrow">Nova Kingdom Rentals</p><h1>Party Packages</h1>' +
      '<p class="lede">Bundle attractions and save. Customize eligible packages by swapping attractions — pricing adjusts by the difference in standalone value.</p></section>' +
      '<section class="section"><div class="pkg-grid">' + cards + '</div>' +
      '<p class="muted" style="font-size:.84rem;margin-top:1rem">Customization allows swaps only (no removals). Full Kingdom Takeover is a fixed package.</p></section>';
  }

  function renderFoam() {
    root.innerHTML = simpleHeader("Foam Party", "High-energy foam fun — priced by guest count, by the hour.") +
      '<section class="section"><div class="other-grid">' +
      card3("Up to 30 kids", "$349/hour") + card3("31–80 kids", "$599/hour") + card3("80+ kids", "From $800/hour") +
      '</div><p class="section-lead" style="margin-top:1rem">The Inflatable Foam Pit is part of the Foam Party offering. On the live site this lives at ' +
      '<a href="https://novakingdomrentals.com/foam-party" rel="noopener">/foam-party</a>.</p></section>';
  }
  function renderBooths() {
    root.innerHTML = simpleHeader("Photo & Video Booths", "Capture the moment.") +
      '<section class="section"><div class="other-grid">' +
      card3("360 Video Booth", "Slow-motion 360° video · Available now") +
      card3("Mirror Photo Booth", "Interactive mirror booth · Available now") +
      '</div><p class="section-lead" style="margin-top:1rem">Live site: <a href="https://novakingdomrentals.com/photo-video-booths" rel="noopener">/photo-video-booths</a>.</p></section>';
  }
  function renderEssentials() {
    root.innerHTML = simpleHeader("Event Essentials", "The practical bits for your event.") +
      '<section class="section"><div class="other-grid">' +
      card3("White Resin Folding Chairs", "$5 each · Available now") +
      card3("Tables", "Available by quote") +
      card3("Tents (10×10 / 10×20)", "Shade & cover for your setup") +
      '</div><p class="section-lead" style="margin-top:1rem">Live site: <a href="https://novakingdomrentals.com/tables-and-chairs" rel="noopener">/tables-and-chairs</a>.</p></section>';
  }
  function renderOther() {
    root.innerHTML = simpleHeader("Other Rentals", "A few more ways to round out your event.") +
      '<section class="section"><div class="other-grid">' +
      card3("Generator Rental", "$150 · includes 1 gas tank · Delivery extra") +
      card3("5 Lawn Games", "$100 add-on") +
      card3("Packages", "Bundle and save") +
      '</div></section>';
  }
  function renderContact() {
    var c = loadCart();
    var summary = c.length
      ? '<ul>' + c.map(function (i) { return '<li>' + esc(i.name) + (i.sub ? ' — <span class="muted">' + esc(i.sub) + '</span>' : '') + ' — <strong>' + money(i.unitPrice) + '</strong></li>'; }).join("") +
        '</ul><p><strong>Estimated rental: ' + money(cartTotal(c)) + '</strong> <span class="muted">(delivery extra · HST extra)</span></p>'
      : '<p class="muted">Your quote is empty — add some items first.</p>';
    root.innerHTML = simpleHeader("Contact / Request a Quote", "Tell us about your event and we’ll follow up.") +
      '<section class="section" style="max-width:640px">' +
      '<div class="proto-banner">Prototype only — this form does not send anything.</div>' +
      '<div style="background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:1rem;margin:.8rem 0">' +
      '<h2 style="font-size:1.1rem">Your quote</h2>' + summary + '</div>' +
      '<form id="proto-form">' +
      field("Name", '<input id="f-name" type="text" autocomplete="name" />') +
      field("Email", '<input id="f-email" type="email" autocomplete="email" />') +
      field("Event date", '<input id="f-date" type="date" />') +
      field("Message", '<textarea id="f-msg" rows="3"></textarea>') +
      '<button class="btn btn-primary" type="submit" style="max-width:260px">Preview Request (no send)</button>' +
      '<p id="form-result" class="muted" style="margin-top:.6rem"></p></form></section>';
    document.getElementById("proto-form").addEventListener("submit", function (e) {
      e.preventDefault();
      document.getElementById("form-result").textContent = "Prototype: this is where a real availability request would be sent. Nothing was submitted.";
    });
  }
  function simpleHeader(title, lead) { return '<section class="hero"><p class="eyebrow">Nova Kingdom Rentals</p><h1>' + esc(title) + '</h1><p class="lede">' + esc(lead) + '</p></section>'; }
  function card3(t, s) { return '<div class="other-card" style="cursor:default"><h3>' + esc(t) + '</h3><p>' + esc(s) + '</p></div>'; }
  function field(label, input) { return '<div class="form-field"><label>' + esc(label) + '</label>' + input + '</div>'; }

  /* ---------- detail modal ---------- */
  var modalBackdrop = document.getElementById("modal-backdrop");
  var modal = document.getElementById("modal");
  var lastFocused = null;
  var modalConfig = "dry";
  var modalProductId = null;

  function openDetails(id) {
    var p = byId[id]; if (!p) return;
    modalProductId = id;
    lastFocused = document.activeElement;
    document.getElementById("modal-img").src = p.image;
    document.getElementById("modal-img").alt = p.name + " inflatable rental";
    document.getElementById("modal-type").textContent = p.type;
    document.getElementById("modal-title").textContent = p.name + (p.altName ? " (" + p.altName + ")" : "");
    var soon = p.status === "coming-soon";
    var pills = [];
    pills.push('<span class="pill" style="color:' + (soon ? "var(--soon)" : "var(--ok)") + '">' + (soon ? "Coming Soon" : "Available Now") + '</span>');
    pills.push('<span class="pill">' + esc(p.wet ? "Wet or Dry use" : "Dry use") + '</span>');
    document.getElementById("modal-pills").innerHTML = pills.join("");
    document.getElementById("modal-blurb").textContent = p.blurb;

    // config (island)
    var cfgWrap = document.getElementById("modal-cfg-wrap");
    var cfgBox = document.getElementById("modal-cfg");
    if (p.configs) {
      modalConfig = (loadCart().filter(function (i) { return i.id === id; })[0] || {}).config || "dry";
      cfgBox.innerHTML = p.configs.map(function (c) {
        return '<button type="button" data-cfg="' + c.id + '" aria-pressed="' + (c.id === modalConfig) + '">' + esc(c.label) + ' — ' + money(c.price) + '</button>';
      }).join("");
      cfgWrap.classList.remove("hidden");
    } else { cfgWrap.classList.add("hidden"); cfgBox.innerHTML = ""; }

    // specs
    var specs = [];
    specs.push(["Price", p.configs ? ("From " + money(p.price)) : money(p.price)]);
    specs.push(["Category", p.type]);
    specs.push(["Availability", soon ? "Coming Soon" : "Available Now"]);
    if (p.dims) specs.push(["Dimensions", p.dims]);
    specs.push(["Wet / Dry", p.wet ? "Can be used wet or dry" : "Dry use only"]);
    if (p.capacity) specs.push(["Capacity", p.capacity]);
    specs.push(["Rental duration", D.policy.duration]);
    specs.push(["Setup", p.wet ? D.policy.setupWet : D.policy.setupDry]);
    specs.push(["Delivery", D.policy.delivery]);
    specs.push(["Best for", p.bestFor.join(" • ")]);
    specs.push(["Details page", '<a href="' + detailUrl(p) + '" target="_blank" rel="noopener">' + esc(detailUrl(p)) + '</a>']);
    document.getElementById("modal-specs").innerHTML = specs.map(function (s) {
      return '<dt>' + esc(s[0]) + '</dt><dd>' + (s[0] === "Details page" ? s[1] : esc(s[1])) + '</dd>';
    }).join("");

    var addBtn = document.getElementById("modal-add");
    if (soon) { addBtn.disabled = true; addBtn.textContent = "Coming Soon"; addBtn.setAttribute("aria-pressed", "false"); }
    else { addBtn.disabled = false; var inC = cartHas(id); addBtn.setAttribute("aria-pressed", inC ? "true" : "false"); addBtn.textContent = inC ? "In Quote ✓" : "Add to Quote"; }

    modalBackdrop.classList.add("open");
    document.getElementById("modal-close").focus();
    document.addEventListener("keydown", modalKeydown);
  }
  function closeModal() {
    modalBackdrop.classList.remove("open");
    document.removeEventListener("keydown", modalKeydown);
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }
  function modalKeydown(e) {
    if (e.key === "Escape") { closeModal(); return; }
    if (e.key === "Tab") trapFocus(e, modal);
  }

  /* ---------- cart drawer ---------- */
  var cartEl = document.getElementById("cart");
  var cartBackdrop = document.getElementById("cart-backdrop");
  var cartLastFocused = null;
  function openCart() {
    cartLastFocused = document.activeElement;
    cartBackdrop.classList.add("open");
    cartEl.classList.add("open");
    cartEl.setAttribute("aria-hidden", "false");
    document.getElementById("cart-close").focus();
    document.addEventListener("keydown", cartKeydown);
  }
  function closeCart() {
    cartBackdrop.classList.remove("open");
    cartEl.classList.remove("open");
    cartEl.setAttribute("aria-hidden", "true");
    document.removeEventListener("keydown", cartKeydown);
    if (cartLastFocused && cartLastFocused.focus) cartLastFocused.focus();
  }
  function cartKeydown(e) {
    if (e.key === "Escape") { closeCart(); return; }
    if (e.key === "Tab") trapFocus(e, cartEl);
  }
  function trapFocus(e, container) {
    var f = container.querySelectorAll('a[href],button:not([disabled]),input,textarea,select,[tabindex]:not([tabindex="-1"])');
    f = Array.prototype.filter.call(f, function (x) { return x.offsetParent !== null || x === document.activeElement; });
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* ---------- package customize (simple prompt-free inline swap) ---------- */
  function openCustomize(pkgId) {
    var pkg = D.packages.filter(function (p) { return p.id === pkgId; })[0]; if (!pkg) return;
    var swaps = {};
    var inflatableChoices = D.products.filter(function (p) { return p.status !== "coming-soon"; });
    function rowFor(origId) {
      var orig = byId[origId];
      var opts = '<option value="">Keep ' + esc(orig ? orig.name : origId) + '</option>' +
        inflatableChoices.filter(function (p) { return p.id !== origId; })
          .map(function (p) { return '<option value="' + p.id + '">Swap for ' + esc(p.name) + ' (' + money(p.price) + ')</option>'; }).join("");
      return '<div class="form-field"><label>' + esc(orig ? orig.name : origId) + ' <span class="muted">(' + money(stdPrice(origId)) + ')</span></label>' +
        '<select data-swap-orig="' + esc(origId) + '">' + opts + '</select></div>';
    }
    root.innerHTML = simpleHeader("Customize " + pkg.name, "Swap attractions only — pricing changes by the difference in standalone value. You can’t remove items to shrink the package.") +
      '<section class="section" style="max-width:640px"><div style="background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:1rem">' +
      '<p>Base package: <strong>' + money(pkg.price) + '</strong></p>' +
      pkg.items.filter(function (id) { return id !== "5-lawn-games"; }).map(rowFor).join("") +
      '<div class="total" style="display:flex;justify-content:space-between;font-weight:800;font-size:1.2rem;margin:.6rem 0"><span>New package price</span><span id="custom-price">' + money(pkg.price) + '</span></div>' +
      '<div class="pkg-cta"><button class="btn btn-primary" id="custom-add">Add Customized Package</button>' +
      '<button class="btn btn-ghost" data-go="packages">Cancel</button></div></div></section>';
    currentView = "custom";
    function recompute() {
      swaps = {};
      root.querySelectorAll("[data-swap-orig]").forEach(function (sel) { if (sel.value) swaps[sel.getAttribute("data-swap-orig")] = sel.value; });
      document.getElementById("custom-price").textContent = money(computePkgPrice(pkg, swaps));
    }
    root.querySelectorAll("[data-swap-orig]").forEach(function (sel) { sel.addEventListener("change", recompute); });
    document.getElementById("custom-add").addEventListener("click", function () { addPackage(pkg, swaps); });
  }

  /* ---------- global event delegation ---------- */
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-go],[data-type],[data-details],[data-add],[data-check],[data-add-pkg],[data-custom-pkg],[data-rm],[data-cfg],[data-view]");
    if (!t) return;
    if (t.hasAttribute("data-view")) { go(t.getAttribute("data-view")); return; }
    if (t.hasAttribute("data-go")) { go(t.getAttribute("data-go")); return; }
    if (t.hasAttribute("data-type")) { // filter chip
      var ty = t.getAttribute("data-type");
      location.hash = "inflatables" + (ty === "all" ? "" : "?type=" + ty);
      return;
    }
    if (t.hasAttribute("data-details")) { openDetails(t.getAttribute("data-details")); return; }
    if (t.hasAttribute("data-add")) { toggleProduct(t.getAttribute("data-add")); return; }
    if (t.hasAttribute("data-check")) { go("contact"); return; }
    if (t.hasAttribute("data-add-pkg")) { var pk = D.packages.filter(function (p) { return p.id === t.getAttribute("data-add-pkg"); })[0]; if (pk) addPackage(pk, null); return; }
    if (t.hasAttribute("data-custom-pkg")) { openCustomize(t.getAttribute("data-custom-pkg")); return; }
    if (t.hasAttribute("data-rm")) { removeItem(t.getAttribute("data-rm")); return; }
    if (t.hasAttribute("data-cfg")) { // modal config change
      modalConfig = t.getAttribute("data-cfg");
      document.querySelectorAll("#modal-cfg [data-cfg]").forEach(function (b) { b.setAttribute("aria-pressed", b === t ? "true" : "false"); });
      if (modalProductId && cartHas(modalProductId)) setConfig(modalProductId, modalConfig);
      return;
    }
  });

  document.getElementById("modal-close").addEventListener("click", closeModal);
  modalBackdrop.addEventListener("click", function (e) { if (e.target === modalBackdrop) closeModal(); });
  document.getElementById("modal-add").addEventListener("click", function () {
    if (!modalProductId) return; toggleProduct(modalProductId, modalConfig);
    var inC = cartHas(modalProductId);
    this.setAttribute("aria-pressed", inC ? "true" : "false"); this.textContent = inC ? "In Quote ✓" : "Add to Quote";
  });
  document.getElementById("modal-check").addEventListener("click", function () { closeModal(); go("contact"); });

  document.getElementById("cart-open").addEventListener("click", openCart);
  document.getElementById("cart-close").addEventListener("click", closeCart);
  cartBackdrop.addEventListener("click", closeCart);
  document.getElementById("cart-submit").addEventListener("click", function () { closeCart(); go("contact"); });
  document.addEventListener("click", function (e) { if (e.target && e.target.id === "cta-open-cart") openCart(); });

  window.addEventListener("hashchange", onRoute);
  onRoute();
})();
