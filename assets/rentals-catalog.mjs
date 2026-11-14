/* Nova Kingdom Rentals — category-first catalogue for /rentals.
 * Progressive enhancement: runs only on /rentals, after the React grid and the
 * quote-cart enhancements have rendered. It reuses the REAL product cards (their
 * links and Add-to-Quote buttons stay intact), merges the inflatable + game
 * sections into one chip-filtered grid, injects the lawn-games cards, and hides
 * the Generators and 360 Booth sections. No product data, prices, cart, or SEO
 * are changed. If anything is missing it bails out and leaves the page as-is. */
(function () {
  "use strict";
  if (!/^\/rentals\/?$/.test(location.pathname)) return;

  var CATS = [
    { id: "all",      label: "All" },
    { id: "combos",   label: "Bounce & Slide Combos" },
    { id: "slides",   label: "Slides" },
    { id: "obstacle", label: "Obstacle Course" },
    { id: "water",    label: "Water" },
    { id: "climb",    label: "Climbing & Play" },
    { id: "games",    label: "Inflatable Games" },
    { id: "lawn",     label: "Lawn Games" }
  ];
  var TAGS = {
    "crown-dino-combo": ["combos"],
    "crown-climber": ["climb"],
    "crown-dash": ["obstacle"],
    "crown-island-combo": ["combos", "water"],
    "crown-quest": ["obstacle"],
    "crown-cascade": ["slides", "water"],
    "crown-ice-palace-combo": ["combos"],
    "crown-safari": ["obstacle"],
    "crown-pirate-adventure": ["combos", "slides"],
    "crown-rush-42": ["obstacle", "water"],
    "crown-play-palace": ["combos", "obstacle"],
    "72-ft-obstacle-course": ["obstacle", "slides", "water"],
    "nova-surf-slide": ["slides", "water"],
    "nova-reef-runner": ["obstacle"],
    "crown-axe-challenge": ["games"],
    "crown-kick-darts": ["games"]
  };

  function slugOf(card) {
    var a = card.querySelector('a[href^="/rentals/"]');
    return a ? a.getAttribute("href").split("/").filter(Boolean).pop() : null;
  }
  function headingText(sec) {
    var h = sec.querySelector("h2, h3");
    return h ? h.textContent.trim() : "";
  }

  var done = false;
  function tryBuild() {
    if (done) return;
    var sections = Array.prototype.slice.call(document.querySelectorAll(".lineup-section"));
    if (!sections.length) return;
    // Require the inflatable cards to be present and quote-cart to have added buttons.
    var allCards = document.querySelectorAll('.lineup-section .product-card a[href^="/rentals/"]');
    if (allCards.length < 10) return;

    // Find the key sections by heading.
    var secBy = {};
    sections.forEach(function (s) {
      var h = headingText(s).toLowerCase();
      if (h.indexOf("all inflatables") !== -1) secBy.all = s;
      else if (h.indexOf("water fun") !== -1) secBy.water = s;
      else if (h.indexOf("interactive") !== -1) secBy.games = s;
      else if (h.indexOf("generator") !== -1) secBy.generators = s;
    });
    if (!secBy.all) return; // not ready / unexpected layout — leave page alone
    done = true;

    // Collect unique real cards by slug across the inflatable + game sections.
    var seen = {}, cards = [];
    [secBy.all, secBy.water, secBy.games].forEach(function (sec) {
      if (!sec) return;
      sec.querySelectorAll(".product-card").forEach(function (card) {
        var slug = slugOf(card);
        if (!slug || seen[slug]) return;
        if (!TAGS[slug]) return; // only known inflatables/games
        seen[slug] = true;
        card.setAttribute("data-cat", TAGS[slug].join(" "));
        card.setAttribute("data-slug", slug);
        cards.push(card);
      });
    });
    if (!cards.length) { done = false; return; }

    injectStyles();

    // Build the new catalogue block and insert it before the "All Inflatables" section.
    var block = document.createElement("section");
    block.className = "page-section lineup-section nk-catalog";
    block.innerHTML =
      '<div class="section-heading"><p class="eyebrow">Inflatable Rentals</p>' +
      '<h2>Browse Inflatables by Type</h2></div>' +
      '<div class="nk-cat-controls"><div class="nk-cat-chips" role="group" aria-label="Filter inflatables by type"></div>' +
      '<p class="nk-cat-count" id="nk-cat-count" aria-live="polite"></p></div>' +
      '<div class="product-grid nk-cat-grid" id="nk-cat-grid"></div>';
    secBy.all.parentNode.insertBefore(block, secBy.all);

    var grid = block.querySelector("#nk-cat-grid");
    cards.forEach(function (c) { grid.appendChild(c); });

    // Lawn games cards (from canonical data) — tagged "lawn", excluded from "All".
    fetchLawn(grid);

    // Chips
    var chipWrap = block.querySelector(".nk-cat-chips");
    CATS.forEach(function (c) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "nk-cat-chip"; b.setAttribute("data-type", c.id);
      b.setAttribute("aria-pressed", c.id === "all" ? "true" : "false");
      b.textContent = c.label;
      b.addEventListener("click", function () { applyFilter(c.id); });
      chipWrap.appendChild(b);
    });

    // Hide the now-emptied / unwanted sections.
    [secBy.all, secBy.water, secBy.games, secBy.generators].forEach(hideSection);
    var booth = document.getElementById("nk-photo-booth-section");
    if (booth) booth.style.display = "none";

    applyFilter(readType());
    // keep filter on Back/Forward
    window.addEventListener("popstate", function () { applyFilter(readType()); });
  }

  function hideSection(sec) { if (sec) sec.style.display = "none"; }

  // Remove the two availability "fact" boxes per request (keep the other two).
  function hideFacts() {
    document.querySelectorAll(".local-fact-grid > article").forEach(function (art) {
      if (art.getAttribute("data-nk-fact-hidden")) return;
      var h = art.querySelector("h3, h4");
      var t = (h ? h.textContent : "").trim().toLowerCase();
      if (t.indexOf("what is available now") === 0 || t.indexOf("what rentals are available now") === 0) {
        art.style.display = "none";
        art.setAttribute("data-nk-fact-hidden", "1");
      }
    });
  }

  function readType() {
    var m = /[?&]type=([a-z-]+)/.exec(location.search);
    var t = m ? m[1] : "all";
    return CATS.some(function (c) { return c.id === t; }) ? t : "all";
  }

  function applyFilter(type) {
    var grid = document.getElementById("nk-cat-grid"); if (!grid) return;
    var shown = 0;
    grid.querySelectorAll(".product-card").forEach(function (card) {
      var cats = (card.getAttribute("data-cat") || "").split(" ");
      var isLawn = cats.indexOf("lawn") !== -1;
      var match = type === "all" ? !isLawn : cats.indexOf(type) !== -1;
      card.style.display = match ? "" : "none";
      if (match) shown++;
    });
    document.querySelectorAll(".nk-cat-chip").forEach(function (ch) {
      ch.setAttribute("aria-pressed", ch.getAttribute("data-type") === type ? "true" : "false");
    });
    var count = document.getElementById("nk-cat-count");
    var label = (CATS.filter(function (c) { return c.id === type; })[0] || {}).label || "";
    if (count) count.textContent = "Showing " + shown + " rental" + (shown === 1 ? "" : "s") + (type !== "all" ? " · " + label : "");
    var url = "/rentals" + (type === "all" ? "" : "?type=" + type);
    if (location.pathname + location.search !== url) history.replaceState({ type: type }, "", url);
  }

  function fetchLawn(grid) {
    fetch("/data/lawnGames.json").then(function (r) { return r.ok ? r.json() : []; }).then(function (list) {
      if (!Array.isArray(list)) return;
      list.forEach(function (g) {
        var card = document.createElement("article");
        card.className = "product-card nk-lawn-card";
        card.setAttribute("data-cat", "lawn");
        card.style.display = "none";
        card.innerHTML =
          '<a class="product-card-media" href="/lawn-games" aria-label="' + esc(g.name) + ' — view lawn games">' +
          '<img src="' + esc(g.image) + '" alt="' + esc(g.name) + ' lawn game rental" loading="lazy"></a>' +
          '<div class="product-card-body"><span class="nk-lawn-eyebrow">Lawn Game</span>' +
          '<h3>' + esc(g.name) + '</h3>' +
          (g.bestFor ? '<p class="nk-lawn-best">Best for: ' + esc(g.bestFor) + '</p>' : '') +
          '<a class="button button-dark nk-lawn-btn" href="/lawn-games">View Lawn Games</a></div>';
        grid.appendChild(card);
      });
    }).catch(function () {});
  }

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function injectStyles() {
    if (document.getElementById("nk-cat-style")) return;
    var css =
      ".nk-cat-controls{display:flex;flex-direction:column;gap:.6rem;margin:0 0 1.2rem}" +
      ".nk-cat-chips{display:flex;gap:.5rem;flex-wrap:wrap;overflow-x:auto;-webkit-overflow-scrolling:touch;padding:.15rem;scrollbar-width:thin}" +
      ".nk-cat-chip{flex:0 0 auto;min-height:44px;display:inline-flex;align-items:center;white-space:nowrap;" +
      "font:inherit;font-weight:700;font-size:.92rem;cursor:pointer;border-radius:999px;padding:.5rem 1.1rem;" +
      "background:#fff;color:#16203a;border:1px solid #d9cf9f;box-shadow:0 1px 2px rgba(10,16,32,.06);transition:background .12s,color .12s,border-color .12s}" +
      ".nk-cat-chip:hover{border-color:#caa63a;color:#0b1020}" +
      ".nk-cat-chip[aria-pressed=\"true\"]{background:#f0d16a;color:#1a1300;border-color:#e0bd45}" +
      ".nk-cat-count{margin:0;color:#5b6475;font-size:.9rem;font-weight:600}" +
      "@media(max-width:620px){.nk-cat-chips{flex-wrap:nowrap}}" +
      ".nk-lawn-card .nk-lawn-eyebrow{color:#f0d16a;font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em}" +
      ".nk-lawn-card h3{margin:.2rem 0}.nk-lawn-best{color:#aab0c4;font-size:.86rem;margin:.1rem 0 .6rem}" +
      ".nk-lawn-btn{margin-top:auto}";
    var st = document.createElement("style");
    st.id = "nk-cat-style"; st.textContent = css;
    document.head.appendChild(st);
  }

  // Poll for readiness (React render + quote-cart enhancement), then build once.
  var tries = 0;
  var timer = setInterval(function () {
    tries++;
    try { hideFacts(); tryBuild(); } catch (e) { /* leave page as-is on error */ }
    if (done || tries > 60) clearInterval(timer);
  }, 250);
  if (document.readyState !== "loading") setTimeout(function () { try { hideFacts(); tryBuild(); } catch (e) {} }, 300);
  else document.addEventListener("DOMContentLoaded", function () { setTimeout(function () { try { hideFacts(); tryBuild(); } catch (e) {} }, 300); });
})();
