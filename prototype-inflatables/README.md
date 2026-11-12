# Inflatable Catalog — Prototype

A **standalone prototype** of a category-first inflatable browsing experience for
Nova Kingdom Rentals. It is **not** the live website and is **not** wired to
production. It ships with `noindex, nofollow` and is not referenced from the
production sitemap, navigation, or any production file.

- **Branch:** `inflatable-catalog-prototype` (do **not** merge to `main`)
- **Location:** `/prototype-inflatables/` (isolated folder)
- **Nothing in the live site was changed** to build this.

## What it demonstrates
- Six category filters: All Inflatables, Bounce & Slide Combos, Obstacle Courses,
  Slides & Water Fun, Interactive Games, Play & Climb.
- One canonical record per rental (same ID/name/image/detail URL as production);
  products appear under multiple filters via tags, never duplicated.
- Card → detail modal, a local-only quote cart that survives category switches,
  Crown Island dry/wet configuration, and package customization (swaps only).

## Run it locally
The prototype reuses the live site's optimized images under `/images/...`, so
serve from the **repository root** (one directory above this folder):

```bash
# from the repo root: /home/user/nova-kingdom-rentals-dist
python3 -m http.server 8080
# then open:
#   http://localhost:8080/prototype-inflatables/
```

Any static file server rooted at the repo root works. Opening `index.html`
directly off disk also loads, but product images resolve only when served from
the repo root (because they use `/images/...` paths).

## Data
All prototype inventory lives in `data.js` (`window.NKR_DATA`). Prices are the
"latest approved" prototype standalone prices supplied for this experiment and
may differ from current production display in a couple of cases (noted below).

## Notes / ambiguous classifications
- **Crown Dash, Crown Safari, Crown Play Palace** are kept in *All Inflatables*
  only — their canonical specs don't confirm a bounce-and-slide combo or a
  climb product, so they were not forced into a sub-category.
- **Crown Kick Darts** is the single canonical darts product (alias "Football
  Darts"); no duplicate was created.
- Wet-use is shown only for **Crown Island Combo, Crown Cascade, Crown Rush 42**
  (the canonical `wetUse:true` records).
- **Crown Pirate Adventure** is Coming Soon (not bookable; "Check Availability").

## Files
- `index.html` — shell (noindex), header/nav, cart drawer, detail modal, footer
- `styles.css` — NKR brand tokens, responsive grid, mobile chip row, focus states
- `data.js` — canonical prototype inventory, categories, packages
- `app.js` — routing, filtering, cart, detail modal, package customize, a11y
