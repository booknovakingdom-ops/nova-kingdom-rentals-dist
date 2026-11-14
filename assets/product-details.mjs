// Nova Kingdom Rentals — new product-page layout (quick facts, what's included,
// what you'll need, about, specs). Only for products that have a "pageDetails"
// entry in /data/products.json; every other product page is left exactly as is.
// Safe pattern: never moves or edits React nodes. It inserts one sibling section
// after the product hero; old duplicate sections are hidden with CSS that only
// applies while that section is present (main:has(> #nk-pd)).

const CSS = `
main:has(> #nk-pd) > section.page-section:not(.looking-else):not(:has(.product-card)),
main:has(> #nk-pd) > section.split-section{display:none!important}
#nk-pd{max-width:760px;margin:0 auto;padding:22px 16px 10px;color:#16203a}
#nk-pd h2{font-size:1.15rem;margin:22px 0 10px;color:#16203a}
#nk-pd h2:first-child{margin-top:0}
#nk-pd .pd-facts{list-style:none;margin:0;padding:0;display:grid;gap:10px}
#nk-pd .pd-facts>li{display:flex;gap:12px;align-items:flex-start;background:#fff;border:1px solid #e7dfc8;border-radius:14px;padding:12px 14px;font-size:.95rem;line-height:1.45}
#nk-pd .pd-ic{font-size:1.35rem;line-height:1;flex:0 0 28px;text-align:center}
#nk-pd .pd-facts b.pd-h{display:block;margin-bottom:2px}
#nk-pd .pd-rules{margin:6px 0 0;padding-left:18px;font-size:.9rem;line-height:1.55}
#nk-pd .pd-two{display:grid;gap:0 16px}
#nk-pd .pd-box{background:#f8f4ea;border-radius:14px;padding:14px 16px}
#nk-pd .pd-box ul{margin:0;padding-left:20px;line-height:1.6;font-size:.93rem}
#nk-pd .pd-about{font-size:1rem;line-height:1.6;background:#fff;border-left:4px solid #f0d16a;padding:12px 14px;border-radius:0 12px 12px 0;margin:0}
#nk-pd .pd-save{display:inline-block;background:#16203a;color:#f0d16a;font-weight:800;border-radius:999px;padding:4px 12px;font-size:.85rem;margin-top:8px}
#nk-pd table{width:100%;border-collapse:separate;border-spacing:0;font-size:.93rem;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e7dfc8}
#nk-pd td{padding:10px 12px;border-bottom:1px solid #efe8d4;vertical-align:top}
#nk-pd tr:last-child td{border-bottom:0}
#nk-pd td:first-child{font-weight:700;width:42%;background:#fbf8ef}
#nk-pd small{font-size:.8em;opacity:.8}
@media(min-width:700px){#nk-pd .pd-two{grid-template-columns:1fr 1fr}}
`;

const RULES = [
  "No food or drinks inside (cleaning fee)",
  "No face paint, glitter or confetti (cleaning fee)",
  "<b>No Silly String — $500 damage fee</b>",
  "No foam machines",
  "No shoes",
  "No sharp objects, jewelry or glasses",
];

let products = null, loading = false;

function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function slugNow() { const m = window.location.pathname.match(/^\/rentals\/([^/]+)\/?$/); return m ? m[1] : null; }
function li(a) { return a.map((x) => "<li>" + esc(x) + "</li>").join(""); }

function html(p) {
  const d = p.pageDetails;
  const fact = (ic, h, body) => '<li><span class="pd-ic" aria-hidden="true">' + ic + '</span><div><b class="pd-h">' + h + "</b>" + (body || "") + "</div></li>";
  const specs = [
    ["Price", esc(p.price) + (d.priceNote ? " <small>(" + esc(d.priceNote) + ")</small>" : "")],
    ["Item size", esc(d.itemSize)],
    ["Space needed", esc(d.spaceNeeded)],
    ["Outlets needed", esc(d.outlets)],
    ["Ages", esc(d.ages)],
    ["Capacity", esc(d.capacity)],
    ["Wet or dry", esc(d.wetDry)],
  ].filter((r) => r[1]);
  return '<h2>Quick facts</h2><ul class="pd-facts">' +
    fact("👧", "Capacity", esc(d.capacity) + ". Rules:<ul class=\"pd-rules\">" + RULES.map((r) => "<li>" + r + "</li>").join("") + "</ul>") +
    fact("🚚", "Delivery", "From Bridgewater, across Nova Scotia. Delivery quoted based on your address.") +
    fact("🛠️", "Setup &amp; takedown included", "We set it up, check it, and take it down.") +
    fact("🧽", "Cleaned &amp; sanitized", "Before every rental.") +
    fact("🛡️", "Fully insured") +
    fact("🌬️", "Weather", "Not used in wind 38 km/h or higher. Shut down right away for thunder or lightning.") +
    (p.duration ? fact("⏱️", "Rental time", esc(p.duration)) : "") +
    '</ul><div class="pd-two">' +
    "<div><h2>What's included</h2><div class=\"pd-box\"><ul>" + li(d.included) + "</ul></div></div>" +
    "<div><h2>What you'll need</h2><div class=\"pd-box\"><ul>" + li(d.need) + "</ul></div></div>" +
    "</div><h2>About " + esc(p.name) + '</h2><p class="pd-about">' + esc(d.about) +
    (d.save ? '<br><span class="pd-save">' + esc(d.save) + "</span>" : "") +
    "</p><h2>Specs</h2><table><tbody>" + specs.map((r) => "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td></tr>").join("") + "</tbody></table>";
}

function sync() {
  const slug = slugNow();
  const existing = document.getElementById("nk-pd");
  const p = slug && products ? products.find((x) => x.slug === slug && x.pageDetails) : null;
  const hero = document.querySelector("main > .product-detail-hero");
  if (!p || !hero) { if (existing) existing.remove(); return; }
  if (existing && existing.dataset.slug === slug && existing.previousElementSibling === hero) return;
  if (existing) existing.remove();
  if (!document.getElementById("nk-pd-style")) {
    const st = document.createElement("style"); st.id = "nk-pd-style"; st.textContent = CSS; document.head.appendChild(st);
  }
  const sec = document.createElement("section");
  sec.id = "nk-pd"; sec.dataset.slug = slug; sec.setAttribute("aria-label", p.name + " details");
  sec.innerHTML = html(p);
  hero.insertAdjacentElement("afterend", sec);
}

function load() {
  if (products || loading) return; loading = true;
  fetch("/data/products.json").then((r) => r.json()).then((j) => {
    products = Array.isArray(j) ? j : (j.products || []); sync();
  }).catch(() => { loading = false; });
}

function boot() {
  try {
    if (!window.CSS || !window.CSS.supports || !window.CSS.supports("selector(:has(*))")) return;
    load();
    let busy = false;
    new MutationObserver(() => {
      if (busy) return; busy = true;
      requestAnimationFrame(() => { try { if (slugNow()) load(); sync(); } catch (e) {} busy = false; });
    }).observe(document.body, { childList: true, subtree: true });
    window.addEventListener("popstate", () => setTimeout(() => { try { sync(); } catch (e) {} }, 80));
  } catch (err) { console.error("NK product details failed:", err); }
}

if (typeof window !== "undefined" && typeof document !== "undefined" && !window.NKProductDetailsInit) {
  window.NKProductDetailsInit = true;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
}
