// Nova Kingdom Rentals — category buttons for /rentals (safe version).
//
// Design rule: this script NEVER moves, removes, re-parents or restyles any
// React-rendered element. Filtering is done purely by CSS rules that key off
// two attributes on <html> (which React does not manage):
//   data-nkpage="rentals"  -> we are on /rentals
//   data-nkcat="<id>"      -> selected category
// The only DOM it adds is its own <style> and its own section (buttons + lawn
// games), inserted as a sibling the same way attraction-2027.mjs always did.

const CATS = [
  { id: "all",      label: "All" },
  { id: "combos",   label: "Bounce & Slide Combos" },
  { id: "slides",   label: "Slides" },
  { id: "obstacle", label: "Obstacle Course" },
  { id: "water",    label: "Water Fun" },
  { id: "games",    label: "Inflatable Games" },
  { id: "lawn",     label: "Lawn Games" },
];
const TAGS = {
  "crown-dino-combo": ["combos"],
  "crown-island-combo": ["combos"],
  "crown-island-combo-with-pool": ["water"],
  "crown-ice-palace-combo": ["combos"],
  "crown-play-palace": ["combos"],
  "crown-pirate-adventure": ["combos", "slides"],
  "crown-cascade": ["slides", "water"],
  "crown-dash": ["obstacle"],
  "crown-quest": ["obstacle"],
  "crown-safari": ["obstacle"],
  "crown-rush-42": ["obstacle", "water"],
  "72-ft-obstacle-course": ["obstacle", "slides", "water"],
  "nova-surf-slide": ["slides", "water"],
  "nova-reef-runner": ["obstacle"],
  "crown-climber": ["games"],
  "crown-axe-challenge": ["games"],
  "crown-kick-darts": ["games"],
};

const P = 'html[data-nkpage="rentals"]';
const has = (slug) => 'a[href="/rentals/' + slug + '"]';
const SEC = ".lineup-section:not(#nk-cat-block)";
// Section fingerprints (by the product links they contain).
const WATER_SEC = SEC + ":has(.product-card " + has("crown-cascade") + "):not(:has(.product-card " + has("crown-quest") + "))";
const GEN_SEC = SEC + ":has(.product-card " + has("generator") + ")";
const MAIN_SEC = SEC + ":has(.product-card " + has("crown-quest") + ")";
const GAMES_SEC = SEC + ":has(.product-card " + has("crown-axe-challenge") + ")";

function buildCss() {
  let css =
    // always on /rentals: drop the duplicate Water Fun list, Generators, 360 booth, two fact boxes, old headings
    P + " " + WATER_SEC + "," + P + " " + GEN_SEC + "," + P + " #nk-photo-booth-section{display:none!important}" +
    P + " .local-fact-grid>article:nth-child(-n+2){display:none!important}" +
    P + " " + MAIN_SEC + " .section-heading," + P + " " + GAMES_SEC + " .section-heading{display:none!important}" +
    P + " " + MAIN_SEC + "{padding-bottom:0!important}" + P + " " + GAMES_SEC + "{padding-top:1.4rem!important}" +
    // the pool version is listed under Water only (and All)
    "";
  CATS.forEach((c) => {
    if (c.id === "all") return;
    const slugs = Object.keys(TAGS).filter((s) => TAGS[s].indexOf(c.id) !== -1);
    const pre = P + '[data-nkcat="' + c.id + '"] ';
    if (!slugs.length) { // lawn: hide every product section
      css += pre + SEC + ":has(.product-card){display:none!important}";
      return;
    }
    const list = slugs.map(has).join(",");
    css += pre + SEC + " .product-card:not(:has(" + list + ")){display:none!important}";
    css += pre + SEC + ":has(.product-card):not(:has(" + list + ")){display:none!important}";
  });
  css +=
    "#nk-cat-block{display:none}" + P + " #nk-cat-block{display:block}" +
    "#nk-cat-block .nk-lawn-grid{display:none}" + P + '[data-nkcat="lawn"] #nk-cat-block .nk-lawn-grid{display:grid}' +
    ".nk-cat-in{max-width:1180px;margin:0 auto;padding:0 16px}" +
    ".nk-cat-title{text-align:center;margin:0 0 1rem}" +
    ".nk-cat-title{font-size:clamp(1.15rem,4vw,1.6rem)!important;margin:0 0 .7rem!important}" +
    P + " #nk-cat-block{padding-top:16px!important;padding-bottom:4px!important}" +
    ".nk-cat-chips{display:flex!important;gap:7px;flex-wrap:wrap!important;justify-content:center;padding:0!important;margin:0!important;width:100%;box-sizing:border-box}" +
    ".nk-cat-in{padding-left:12px!important;padding-right:12px!important}" +
    "@media(max-width:620px){.nk-cat-chips{justify-content:flex-start}}" +
    ".nk-cat-chip{flex:0 0 auto;min-height:44px;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;font:inherit;font-weight:700;font-size:.84rem;cursor:pointer;border-radius:999px;margin:0!important;padding:.3rem .65rem .3rem .35rem;background:#fff;color:#16203a;border:1px solid #d9cf9f;box-shadow:0 1px 2px rgba(10,16,32,.06)}" +
    ".nk-cat-chip img{width:26px;height:26px;border-radius:50%;object-fit:cover;background:#f3efe2;flex-shrink:0}" +
    ".nk-cat-chip .n{background:#16203a;color:#fff;border-radius:999px;font-size:.72rem;min-width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;padding:0 6px}" +
    '.nk-cat-chip[aria-pressed="true"] .n{background:#1a1300;color:#f0d16a}' +
    ".nk-cat-chip .n:empty{display:none}" +
    // order (CSS only): hero, buttons, product lists, other sections, then the fact boxes
    P + " #nk-cat-block{order:1}" +
    P + " main:has(> #nk-cat-block){display:flex!important;flex-direction:column}" +
    P + " main:has(> #nk-cat-block) > *{order:5}" +
    P + " main:has(> #nk-cat-block) > :first-child{order:0}" +
    P + " main:has(> #nk-cat-block) > #nk-cat-block{order:1}" +
    P + " main:has(> #nk-cat-block) > .lineup-section:has(.product-card){order:2;padding-top:14px!important}" +
    P + " main:has(> #nk-cat-block) > :has(.local-fact-grid){order:9}" +
    ".nk-cat-chip:hover{border-color:#caa63a}" +
    '.nk-cat-chip[aria-pressed="true"]{background:#f0d16a;color:#1a1300;border-color:#e0bd45}' +
    ".nk-cat-chip:focus-visible{outline:3px solid #caa63a;outline-offset:2px}" +
    ".nk-lawn-grid{grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:1rem;margin-top:1.2rem}" +
    ".nk-lawn-card{background:#fff;border:1px solid #e6e0cc;border-radius:16px;overflow:hidden;display:flex;flex-direction:column;text-decoration:none;color:#16203a}" +
    ".nk-lawn-card img{width:100%;aspect-ratio:4/3;object-fit:cover;display:block;background:#f3efe2}" +
    ".nk-lawn-card div{padding:.8rem .9rem 1rem}.nk-lawn-card b{display:block;font-size:1.05rem}" +
    ".nk-lawn-card small{color:#5b6475;display:block;margin-top:.2rem}";
  return css;
}

function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }
function onRentals() { return /^\/rentals\/?$/.test(window.location.pathname); }
const root = document.documentElement;

function setCat(id) {
  root.setAttribute("data-nkcat", id);
  document.querySelectorAll("#nk-cat-block .nk-cat-chip").forEach((b) => {
    b.setAttribute("aria-pressed", b.getAttribute("data-type") === id ? "true" : "false");
  });
}

const IMGS = {
  all: "/images/events/community-event-inflatables.jpg", combos: "/images/crown-dino-combo.jpeg",
  slides: "/images/crown-cascade.jpeg", obstacle: "/images/crown-rush-42.jpeg",
  water: "/images/crown-island-combo-pool.jpg", games: "/images/crown-axe-challenge.jpeg",
  lawn: "/images/lawn-games/cornhole.png",
};
// Counts from the product cards actually on the page (so they always match what shows).
function counts() {
  const slugs = new Set([...document.querySelectorAll(SEC + " .product-card a[href^='/rentals/']")]
    .map((a) => a.getAttribute("href").split("/").filter(Boolean).pop()).filter((s) => TAGS[s]));
  const out = { all: slugs.size };
  slugs.forEach((s) => TAGS[s].forEach((t) => { out[t] = (out[t] || 0) + 1; }));
  return out;
}
function refreshCounts() {
  const c = counts();
  document.querySelectorAll("#nk-cat-block .nk-cat-chip").forEach((b) => {
    const id = b.getAttribute("data-type"); if (id === "lawn") return;
    const el = b.querySelector(".n"); const v = c[id] ? String(c[id]) : "";
    if (el && el.textContent !== v) el.textContent = v; // only write on change (no observer loop)
  });
}
function setLawnCount(n) { const el = document.querySelector('#nk-cat-block .nk-cat-chip[data-type="lawn"] .n'); if (el) el.textContent = n ? String(n) : ""; }

let lawnHtml = null;
let lawnCount = 0;
function loadLawn(block) {
  const grid = block.querySelector(".nk-lawn-grid");
  if (lawnHtml !== null) { grid.innerHTML = lawnHtml; setLawnCount(lawnCount); return; }
  fetch("/data/lawnGames.json").then((r) => (r.ok ? r.json() : [])).then((list) => {
    lawnHtml = (Array.isArray(list) ? list : []).map((g) =>
      '<a class="nk-lawn-card" href="/lawn-games"><img src="' + esc(encodeURI(g.image || "")) + '" alt="' + esc(g.name) + ' lawn game rental" loading="lazy">' +
      "<div><b>" + esc(g.name) + "</b>" + (g.bestFor ? "<small>Best for: " + esc(g.bestFor) + "</small>" : "") + "</div></a>").join("");
    lawnCount = Array.isArray(list) ? list.length : 0; setLawnCount(lawnCount);
    const live = document.querySelector("#nk-cat-block .nk-lawn-grid");
    if (live) live.innerHTML = lawnHtml;
  }).catch(() => { lawnHtml = null; });
}

function sync() {
  if (!onRentals()) {
    if (root.hasAttribute("data-nkpage")) { root.removeAttribute("data-nkpage"); root.removeAttribute("data-nkcat"); }
    const old = document.getElementById("nk-cat-block");
    if (old) old.remove();
    return;
  }
  if (document.getElementById("nk-cat-block")) { refreshCounts(); return; }
  // anchor: the main inflatables section (contains Crown Quest)
  const link = document.querySelector('.lineup-section .product-card a[href="/rentals/crown-quest"]');
  const mainSec = link && link.closest(".lineup-section");
  if (!mainSec) return;
  const block = document.createElement("section");
  block.id = "nk-cat-block";
  block.className = "page-section lineup-section";
  block.setAttribute("aria-label", "Browse inflatables by type");
  block.innerHTML = '<div class="nk-cat-in"><h2 class="nk-cat-title">Browse Inflatables by Type</h2>' +
    '<div class="nk-cat-chips" role="group" aria-label="Filter by type">' +
    CATS.map((c) => '<button type="button" class="nk-cat-chip" data-type="' + c.id + '" aria-pressed="' + (c.id === "all") + '">' +
      '<img src="' + IMGS[c.id] + '" alt="" loading="lazy">' + esc(c.label) + ' <span class="n">' + (counts()[c.id] || "") + "</span></button>").join("") +
    '</div><div class="nk-lawn-grid"></div></div>';
  block.addEventListener("click", (e) => {
    const b = e.target.closest(".nk-cat-chip");
    if (b) setCat(b.getAttribute("data-type"));
  });
  mainSec.insertAdjacentElement("beforebegin", block);
  root.setAttribute("data-nkpage", "rentals");
  setCat("all");
  loadLawn(block);
}

function boot() {
  // Without :has() support the CSS filters cannot work — leave the page exactly as it is.
  let ok = false;
  try { ok = window.CSS && CSS.supports && CSS.supports("selector(:has(a))"); } catch (e) {}
  if (!ok) return;
  const st = document.createElement("style");
  st.id = "nk-cat-style"; st.textContent = buildCss();
  document.head.appendChild(st);
  const safe = () => { try { sync(); } catch (e) {} };
  safe();
  let busy = false;
  new MutationObserver(() => {
    if (busy) return; busy = true;
    requestAnimationFrame(() => { safe(); busy = false; });
  }).observe(document.body, { childList: true, subtree: true });
  window.addEventListener("popstate", () => setTimeout(safe, 80));
}

if (typeof window !== "undefined" && typeof document !== "undefined" && !window.NKCatInit) {
  window.NKCatInit = true;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
}
