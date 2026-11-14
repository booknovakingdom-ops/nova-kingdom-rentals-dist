// Nova Kingdom Rentals — homepage category tiles.
// Purely ADDITIVE: inserts one new section right after the homepage hero (same
// proven pattern as attraction-2027.mjs). It never moves, hides or edits any
// React-rendered node, so the app's own rendering is left untouched.

const TILES = [
  { t: "Inflatable Rentals",   href: "/rentals",            img: "/images/events/community-event-inflatables.jpg", c: "#e2443b" },
  { t: "Photo & Video Booths", href: "/photo-video-booths", img: "/images/events/360-booth-event-setup.jpg",       c: "#2f7fd6" },
  { t: "Foam Party",           href: "/foam-party",         img: "/images/kids-foam-party.jpg", fit: "contain",    c: "#11111a" },
  { t: "Lawn Games",           href: "/lawn-games",         img: "/images/lawn-games/cornhole.png",                c: "#3aa76d" },
  { t: "Event Essentials",     href: "/tables-and-chairs",  img: "/images/10x20-pole-tent.jpeg",                   c: "#8a63d2" },
  { t: "Party Packages",       href: "/packages",           img: "/images/packages/royal-all-star-package.jpg",    c: "#e86a2c" },
  { t: "Concession Rentals",   href: "/contact", soon: true, items: ["Popcorn", "Cotton Candy", "Snow Cones"],     c: "#1f8a9e" },
  { t: "Generator Rental",     href: "/rentals/generator",  img: "/images/generator-benchmark.jpg", fit: "contain", bg: "#fff", c: "#c9427e" },
];
const MORE = [
  ["About Us", "/about"], ["Service Areas", "/service-areas"], ["FAQ", "/faq"],
  ["Request an Item", "/request-a-rental"], ["Contact", "/contact"],
];

const CSS = `
.nkht{background:#050814;padding:1.6rem 14px 1.8rem}
.nkht-in{max-width:980px;margin:0 auto}
.nkht-eyebrow{color:#f0d16a;text-transform:uppercase;letter-spacing:.16em;font-size:.72rem;font-weight:800;text-align:center;margin:0 0 .3rem}
.nkht-title{color:#fff;text-align:center;font-size:clamp(1.4rem,5vw,2rem);margin:0 0 1rem;line-height:1.1}
.nkht-grid{display:grid;grid-template-columns:1fr;gap:18px}
@media(min-width:720px){.nkht-grid{grid-template-columns:1fr 1fr}}
.nkht-tile{display:block;border-radius:16px;overflow:hidden;background:#0b1020;border:1px solid #232a44;box-shadow:0 8px 22px rgba(0,0,0,.35);text-decoration:none;color:#e7e9f2}
.nkht-tile:hover{box-shadow:0 10px 28px rgba(0,0,0,.5);text-decoration:none}
.nkht-banner{padding:12px 10px;text-align:center}
.nkht-banner span{display:block;font-size:clamp(1.2rem,5.2vw,1.65rem);font-weight:900;letter-spacing:.02em;text-transform:uppercase;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.45);line-height:1}
.nkht-media{position:relative;aspect-ratio:16/10;background:#0a0f1e}
.nkht-media img{display:block;width:100%;height:100%;object-fit:cover}
.nkht-go{position:absolute;right:12px;bottom:12px;background:rgba(5,8,20,.82);color:#f0d16a;font-weight:800;font-size:.85rem;border-radius:999px;padding:.4rem .8rem;border:1px solid rgba(240,209,106,.5)}
.nkht-soon{padding:18px 16px 16px;background:linear-gradient(135deg,#131a30,#0a0f1e)}
.nkht-badge{display:inline-block;background:rgba(240,180,95,.16);color:#f0b45f;border:1px solid rgba(240,180,95,.5);font-weight:800;font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;border-radius:999px;padding:.25rem .6rem;margin-bottom:10px}
.nkht-soon ul{margin:0 0 12px;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:8px}
.nkht-soon li{background:rgba(255,255,255,.06);border:1px solid #232a44;border-radius:999px;padding:.4rem .8rem;font-weight:700;font-size:.9rem}
.nkht-soon .nkht-go{position:static;display:inline-block}
.nkht-more{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:1.2rem}
.nkht-more a{background:#0b1020;border:1px solid #232a44;border-radius:999px;padding:.6rem 1rem;font-weight:700;font-size:.92rem;color:#e7e9f2;text-decoration:none;min-height:44px;display:inline-flex;align-items:center}
.nkht-more a:hover{border-color:#f0d16a;color:#fff}
`;

function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }
function isHome() { return window.location.pathname === "/" || window.location.pathname === ""; }

function sectionHtml() {
  const tiles = TILES.map((x) => {
    if (x.soon) {
      return '<a class="nkht-tile" href="' + x.href + '"><div class="nkht-banner" style="background:' + x.c + '"><span>' + esc(x.t) + "</span></div>" +
        '<div class="nkht-soon"><span class="nkht-badge">Coming Soon</span><ul>' +
        x.items.map((i) => "<li>" + esc(i) + "</li>").join("") + '</ul><span class="nkht-go">Ask about it ›</span></div></a>';
    }
    return '<a class="nkht-tile" href="' + x.href + '"><div class="nkht-banner" style="background:' + x.c + '"><span>' + esc(x.t) + "</span></div>" +
      '<div class="nkht-media"' + (x.bg ? ' style="background:' + x.bg + '"' : "") + '><img src="' + x.img + '" alt="' + esc(x.t) + ' — Nova Kingdom Rentals" loading="lazy" style="object-fit:' + (x.fit || "cover") + '">' +
      '<span class="nkht-go">View ›</span></div></a>';
  }).join("");
  const more = MORE.map((m) => '<a href="' + m[1] + '">' + esc(m[0]) + "</a>").join("");
  return '<div class="nkht-in"><p class="nkht-eyebrow">Browse Rentals</p><h2 class="nkht-title">What are you looking for?</h2>' +
    '<div class="nkht-grid">' + tiles + '</div><nav class="nkht-more" aria-label="More pages">' + more + "</nav></div>";
}

function inject() {
  const existing = document.getElementById("nk-home-tiles");
  if (!isHome()) { if (existing) existing.remove(); return; }
  if (existing) return;
  const hero = document.querySelector(".home-hero-scroll") || document.querySelector(".home-hero");
  if (!hero) return;
  if (!document.getElementById("nk-home-tiles-style")) {
    const st = document.createElement("style");
    st.id = "nk-home-tiles-style"; st.textContent = CSS;
    document.head.appendChild(st);
  }
  const sec = document.createElement("section");
  sec.id = "nk-home-tiles";
  sec.className = "nkht";
  sec.setAttribute("aria-label", "Browse rentals by category");
  sec.innerHTML = sectionHtml();
  hero.insertAdjacentElement("afterend", sec);
}

function boot() {
  try {
    inject();
    let busy = false;
    const obs = new MutationObserver(() => {
      if (busy) return; busy = true;
      requestAnimationFrame(() => { try { inject(); } catch (e) {} busy = false; });
    });
    obs.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("popstate", () => setTimeout(() => { try { inject(); } catch (e) {} }, 80));
  } catch (err) {
    console.error("NK home tiles failed:", err);
  }
}

if (typeof window !== "undefined" && typeof document !== "undefined" && !window.NKHomeTilesInit) {
  window.NKHomeTilesInit = true;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
}
