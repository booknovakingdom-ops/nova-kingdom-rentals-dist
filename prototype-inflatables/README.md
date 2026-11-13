# Inflatable Catalog — Prototype (multi-page)

A **standalone prototype** of a category-first browsing experience for Nova
Kingdom Rentals, built as **real separate web pages** (a page per product, plus
section pages). It is **not** the live website and is **not** wired to
production: every page is `noindex, nofollow`, nothing is referenced from the
production sitemap/nav, and the quote cart is local-only (sends nothing).

- **Branch:** `inflatable-catalog-prototype` (do **not** merge to `main`)
- **Location:** `/prototype-inflatables/` (isolated folder)
- No production file was changed to build this.

## Pages
- `index.html` — Home
- `inflatables.html` — catalog with the six type filters
- `products/<slug>.html` — a real detail page for each of the 13 inflatables
- `packages.html` — six packages with swap-only customization
- `foam-party.html`, `photo-video-booths.html`, `event-essentials.html`,
  `other-rentals.html`, `contact.html` — simplified section pages
- Shared: `styles.css`, `cart.js` (cart + filtering + customize), `data.js`

## Run it locally
The pages reuse the live site's optimized images under `/images/...`, so serve
from the **repository root** (one level above this folder):

```bash
cd /home/user/nova-kingdom-rentals-dist
python3 -m http.server 8080
# open http://localhost:8080/prototype-inflatables/
```

## Editing / rebuilding
All content lives in **`data.json`** (single source of truth). After editing it,
regenerate every page:

```bash
cd prototype-inflatables
python3 build.py
```
`build.py` writes the HTML pages and `data.js` from `data.json`.

## Categories (6)
All Inflatables · Bounce & Slide Combos · Obstacle Courses · Slides & Water Fun ·
Interactive Games · Play & Climb. One canonical record per rental; products carry
multiple tags and are never duplicated.

| Product | Categories |
|---|---|
| Crown Dino Combo | Combos |
| Crown Island Combo | Combos, Slides & Water (Dry $349 / Wet $399) |
| Crown Ice Palace Combo | Combos |
| Crown Pirate Adventure | Combos — **Coming Soon** |
| Crown Play Palace | **Combos + Obstacle** (park-style: obstacles, bounce & slides) |
| Crown Quest | Obstacle |
| Crown Rush 42 | Obstacle, Slides & Water (Quest + Cascade combined) |
| Crown Dash | **Obstacle** (confirmed) |
| Crown Safari | **Obstacle** (confirmed) |
| Crown Cascade | Slides & Water |
| Crown Axe Challenge | Interactive Games |
| Crown Kick Darts (Football Darts) | Interactive Games — single canonical product |
| Crown Climber | Play & Climb |

Wet-use only on Crown Island, Crown Cascade, Crown Rush 42 (canonical
`wetUse:true`). Crown Kick Darts is the one darts product (no duplicate).
