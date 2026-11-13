/* NKR inflatable catalog PROTOTYPE — shared client script (multi-page).
   Cart persists in localStorage across real page navigations. Local only. */
(function () {
  "use strict";
  var D = window.NKR_DATA || {};
  var CART_KEY = "nkr_proto_cart_v1";
  var byId = {};
  (D.products || []).forEach(function (p) { byId[p.id] = p; });
  if (D.lawnGames) byId[D.lawnGames.id] = D.lawnGames;

  function money(n) { return "$" + Number(n).toLocaleString("en-CA"); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function qs(id) { return document.getElementById(id); }

  /* ---------- cart state ---------- */
  function loadCart() { try { return JSON.parse(localStorage.getItem(CART_KEY) || "[]"); } catch (e) { return []; } }
  function saveCart(c) { try { localStorage.setItem(CART_KEY, JSON.stringify(c)); } catch (e) {} renderCart(); }
  function cartHas(id) { return loadCart().some(function (i) { return i.id === id; }); }
  function cartTotal(c) { return (c || loadCart()).reduce(function (s, i) { return s + i.unitPrice; }, 0); }

  function productLine(p, config) {
    var line = { id: p.id, name: p.name, image: p.image, unitPrice: p.price, sub: p.type };
    if (p.configs) { var cfg = p.configs.filter(function (c) { return c.id === config; })[0] || p.configs[0];
      line.config = cfg.id; line.unitPrice = cfg.price; line.sub = p.type + " · " + cfg.label; }
    return line;
  }
  function addProduct(id, config) {
    var p = byId[id]; if (!p || p.status === "coming-soon") return;
    var c = loadCart(); var ex = c.filter(function (i) { return i.id === id; })[0];
    if (ex) { if (p.configs && config) { var nl = productLine(p, config); ex.config = nl.config; ex.unitPrice = nl.unitPrice; ex.sub = nl.sub; } }
    else c.push(productLine(p, config));
    saveCart(c);
  }
  function removeItem(key) { saveCart(loadCart().filter(function (i) { return (i.key || i.id) !== key; })); }
  function toggleProduct(id, config) { if (cartHas(id)) removeItem(id); else addProduct(id, config); }

  /* ---------- package pricing ---------- */
  function stdPrice(id) { var x = byId[id]; return x ? x.price : 0; }
  function pkgPrice(pkg, swaps) { var pr = pkg.price; if (swaps) Object.keys(swaps).forEach(function (o) { pr += stdPrice(swaps[o]) - stdPrice(o); }); return pr; }
  function pkgItems(pkg, swaps) { return pkg.items.map(function (id) { var r = (swaps && swaps[id]) ? swaps[id] : id; return byId[r]; }); }
  function addPackage(pkg, swaps) {
    var key = "pkg:" + pkg.id + (swaps && Object.keys(swaps).length ? ":" + Object.keys(swaps).map(function (k) { return k + ">" + swaps[k]; }).join(",") : "");
    var names = pkgItems(pkg, swaps).map(function (i) { return i ? i.name : ""; });
    var img = (pkgItems(pkg, swaps)[0] || {}).image;
    var c = loadCart(); c.push({ id: key, key: key, name: pkg.name, unitPrice: pkgPrice(pkg, swaps), image: img, sub: names.join(", ") });
    saveCart(c); openCart();
  }

  /* ---------- render cart drawer ---------- */
  function renderCart() {
    var c = loadCart();
    var cnt = qs("cart-count"); if (cnt) cnt.textContent = c.length;
    var wrap = qs("cart-items");
    if (wrap) {
      if (!c.length) wrap.innerHTML = '<p class="muted" style="padding:1.2rem 0">Your quote is empty. Add inflatables or a package to build an estimate.</p>';
      else wrap.innerHTML = c.map(function (i) {
        var k = i.key || i.id;
        return '<div class="cart-item">' + (i.image ? '<img src="' + esc(i.image) + '" alt="" />' : '') +
          '<div class="ci-main"><div class="ci-name">' + esc(i.name) + '</div><div class="ci-sub">' + esc(i.sub || "") + '</div>' +
          '<button class="rm" data-rm="' + esc(k) + '">Remove</button></div><div class="ci-price">' + money(i.unitPrice) + '</div></div>';
      }).join("");
    }
    var tot = qs("cart-total"); if (tot) tot.textContent = money(cartTotal(c));
    document.querySelectorAll("[data-add]").forEach(function (b) {
      if (b.disabled) return;
      var inC = cartHas(b.getAttribute("data-add"));
      b.setAttribute("aria-pressed", inC ? "true" : "false");
      b.textContent = inC ? "In Quote ✓" : "Add to Quote";
    });
    var cs = qs("contact-summary"); if (cs) renderContactSummary(cs, c);
  }
  function renderContactSummary(cs, c) {
    if (!c.length) { cs.innerHTML = '<p class="muted">Your quote is empty — add some items first.</p>'; return; }
    cs.innerHTML = '<ul>' + c.map(function (i) { return '<li>' + esc(i.name) + (i.sub ? ' — <span class="muted">' + esc(i.sub) + '</span>' : '') + ' — <strong>' + money(i.unitPrice) + '</strong></li>'; }).join("") +
      '</ul><p><strong>Estimated rental: ' + money(cartTotal(c)) + '</strong> <span class="muted">(delivery extra · HST extra)</span></p>';
  }

  /* ---------- cart drawer open/close ---------- */
  var cartEl = qs("cart"), cartBackdrop = qs("cart-backdrop"), cartLast = null;
  function openCart() { if (!cartEl) return; cartLast = document.activeElement; cartBackdrop.classList.add("open"); cartEl.classList.add("open"); cartEl.setAttribute("aria-hidden", "false"); qs("cart-close").focus(); document.addEventListener("keydown", cartKey); }
  function closeCart() { if (!cartEl) return; cartBackdrop.classList.remove("open"); cartEl.classList.remove("open"); cartEl.setAttribute("aria-hidden", "true"); document.removeEventListener("keydown", cartKey); if (cartLast && cartLast.focus) cartLast.focus(); }
  function cartKey(e) { if (e.key === "Escape") closeCart(); else if (e.key === "Tab") trap(e, cartEl); }
  function trap(e, box) {
    var f = Array.prototype.slice.call(box.querySelectorAll('a[href],button:not([disabled]),input,textarea,select,[tabindex]:not([tabindex="-1"])')).filter(function (x) { return x.offsetParent !== null; });
    if (!f.length) return; var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* ---------- catalog filtering (inflatables page) ---------- */
  function initCatalog() {
    var grid = qs("catalog-grid"); if (!grid) return;
    function curType() { var m = /[?&]type=([a-z-]+)/.exec(location.search); var t = m ? m[1] : "all";
      return (D.categories || []).some(function (c) { return c.id === t; }) ? t : "all"; }
    function apply(type, focusChip) {
      var shown = 0;
      grid.querySelectorAll(".card").forEach(function (card) {
        var tags = (card.getAttribute("data-tags") || "").split(" ");
        var match = type === "all" || tags.indexOf(type) !== -1;
        card.classList.toggle("hidden", !match); if (match) shown++;
      });
      document.querySelectorAll(".chip").forEach(function (ch) { ch.setAttribute("aria-pressed", ch.getAttribute("data-type") === type ? "true" : "false"); });
      var empty = qs("empty"); if (empty) empty.classList.toggle("hidden", shown > 0);
      var rc = qs("result-count"); var label = ((D.categories || []).filter(function (c) { return c.id === type; })[0] || {}).label || "";
      if (rc) rc.textContent = "Showing " + shown + " inflatable" + (shown === 1 ? "" : "s") + (type !== "all" ? " · " + label : "");
    }
    document.querySelectorAll(".chip").forEach(function (ch) {
      ch.addEventListener("click", function (e) {
        e.preventDefault(); var type = ch.getAttribute("data-type");
        var url = "inflatables.html" + (type === "all" ? "" : "?type=" + type);
        history.pushState({ type: type }, "", url); apply(type);
      });
    });
    window.addEventListener("popstate", function () { apply(curType()); });
    apply(curType());
  }

  /* ---------- detail page island config ---------- */
  function initDetail() {
    var group = document.querySelector("[data-config-group]"); if (!group) return;
    var pid = group.getAttribute("data-config-group");
    var addBtn = document.querySelector('[data-add="' + pid + '"]');
    var selected = (loadCart().filter(function (i) { return i.id === pid; })[0] || {}).config || "dry";
    function paint() { group.querySelectorAll("[data-cfg]").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-cfg") === selected ? "true" : "false"); }); }
    group.querySelectorAll("[data-cfg]").forEach(function (b) {
      b.addEventListener("click", function () { selected = b.getAttribute("data-cfg"); paint(); if (cartHas(pid)) addProduct(pid, selected); });
    });
    if (addBtn) addBtn.setAttribute("data-config-source", "1");
    group.__getConfig = function () { return selected; };
    window.__detailConfig = function () { return selected; };
    paint();
  }

  /* ---------- packages customize (inline) ---------- */
  function initPackages() {
    document.querySelectorAll("[data-custom-pkg]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var pid = btn.getAttribute("data-custom-pkg");
        var pkg = D.packages.filter(function (p) { return p.id === pid; })[0]; if (!pkg) return;
        var box = document.querySelector('.pkg-customize[data-pkg="' + pid + '"]'); if (!box) return;
        if (box.getAttribute("data-built")) { box.classList.toggle("hidden"); return; }
        var choices = D.products.filter(function (p) { return p.status !== "coming-soon"; });
        var rows = pkg.items.filter(function (id) { return id !== "5-lawn-games"; }).map(function (origId) {
          var orig = byId[origId];
          var opts = '<option value="">Keep ' + esc(orig ? orig.name : origId) + '</option>' +
            choices.filter(function (p) { return p.id !== origId; }).map(function (p) { return '<option value="' + p.id + '">Swap for ' + esc(p.name) + ' (' + money(p.price) + ')</option>'; }).join("");
          return '<div class="form-field"><label>' + esc(orig ? orig.name : origId) + ' <span class="muted">(' + money(stdPrice(origId)) + ')</span></label><select data-swap-orig="' + esc(origId) + '">' + opts + '</select></div>';
        }).join("");
        box.innerHTML = '<p class="muted" style="font-size:.84rem">Swaps only — pricing changes by the difference in standalone value.</p>' + rows +
          '<div class="total" style="display:flex;justify-content:space-between;font-weight:800;font-size:1.1rem;margin:.5rem 0"><span>New price</span><span class="custom-price">' + money(pkg.price) + '</span></div>' +
          '<button class="btn btn-primary custom-add" type="button">Add Customized Package</button>';
        box.setAttribute("data-built", "1"); box.classList.remove("hidden");
        function recompute() { var swaps = {}; box.querySelectorAll("[data-swap-orig]").forEach(function (s) { if (s.value) swaps[s.getAttribute("data-swap-orig")] = s.value; });
          box.querySelector(".custom-price").textContent = money(pkgPrice(pkg, swaps)); return swaps; }
        box.querySelectorAll("[data-swap-orig]").forEach(function (s) { s.addEventListener("change", recompute); });
        box.querySelector(".custom-add").addEventListener("click", function () { addPackage(pkg, recompute()); });
      });
    });
  }

  /* ---------- global click delegation ---------- */
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-add],[data-check],[data-rm],[data-add-pkg]");
    if (!t) return;
    if (t.hasAttribute("data-rm")) { removeItem(t.getAttribute("data-rm")); return; }
    if (t.hasAttribute("data-check")) { location.href = "/prototype-inflatables/contact.html"; return; }
    if (t.hasAttribute("data-add")) {
      var id = t.getAttribute("data-add");
      var cfg = (t.getAttribute("data-config-source") && window.__detailConfig) ? window.__detailConfig() : t.getAttribute("data-config") || undefined;
      toggleProduct(id, cfg); return;
    }
    if (t.hasAttribute("data-add-pkg")) { var pk = D.packages.filter(function (p) { return p.id === t.getAttribute("data-add-pkg"); })[0]; if (pk) addPackage(pk, null); return; }
  });

  /* ---------- contact form (no send) ---------- */
  function initContact() {
    var f = qs("proto-form"); if (!f) return;
    f.addEventListener("submit", function (e) { e.preventDefault(); qs("form-result").textContent = "Prototype: this is where a real availability request would be sent. Nothing was submitted."; });
  }

  /* ---------- boot ---------- */
  function boot() {
    var open = qs("cart-open"); if (open) open.addEventListener("click", openCart);
    var close = qs("cart-close"); if (close) close.addEventListener("click", closeCart);
    if (cartBackdrop) cartBackdrop.addEventListener("click", closeCart);
    var sub = qs("cart-submit"); if (sub) sub.addEventListener("click", function () { closeCart(); location.href = "/prototype-inflatables/contact.html"; });
    initCatalog(); initDetail(); initPackages(); initContact(); renderCart();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
