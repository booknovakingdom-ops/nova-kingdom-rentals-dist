# Handoff: Bubble Blast Parties website (bubbleblastparties.ca)

Paste this whole file as the first message in a new Claude Code session opened in the NEW repo. It is self-contained.

## 1. Who and what
- Owner: Harkirat Singh. Business: Nova Kingdom Rentals (NKR), Bridgewater, Nova Scotia. Main site: https://novakingdomrentals.com
- New project: **Bubble Blast Parties**, a foam party brand that expands NKR's foam business. Domain: **bubbleblastparties.ca**, bought on Hostinger.
- It is a division of NKR. The footer and schema credit NKR as the parent organization.
- Public phone: 902-990-0005. Ask the owner which email, if any, to publish. Do not invent one and do not put the owner's personal or account email in the site without explicit approval.

## 2. Hosting state (confirmed from the owner's hPanel screenshot)
- `bubbleblastparties.ca` is already added as a website on Hostinger **Premium Web Hosting** (created 2026-07-29, disk use 0.14 GB of 20 GB, weekly backups on). The site is empty.
- Apache hosting, so `.htaccess` works. Deploy by uploading to `public_html` for this domain via hPanel File Manager, or by hPanel Git deploy pointed at the new repo (preferred, the owner must set it up).
- The owner still needs to turn on free SSL under hPanel > Security > SSL before the http-to-https redirect in `.htaccess` is useful.
- No credentials are available to Claude. Do not ask for passwords in chat.

## 3. Rules inherited from NKR (apply to all copy)
- Never quote a price unless it comes from the owner's source-of-truth. **No foam package pricing exists yet.** Use "request a quote" until the owner supplies it.
- Never confirm a booking without the deposit received.
- Do not add HST text unless the owner confirms the business is registered.
- Wind limit: 38 km/h (rental agreement).
- Silly string damage fee: $500 per unit.
- Any discount over 10% needs the owner's approval.
- Emails to customers are Gmail drafts only, never auto-sent.
- In NKR's source of truth the only foam rule is "Foam machines: NOT permitted" inside inflatables. Foam party terms (water and power needs, soap and surface rules, age limits, waiver) are unknown. Ask the owner, do not guess.
- Treat the owner's email address as private.

## 4. Decisions and open questions
1. **Separate brand vs main site.** NKR's site has about 82 foam-machine town pages (`foam-machine-rental-<town>-<prov>`) that already earn ranking. A new domain starts at zero. Plan: build the standalone brand site, then add links from NKR's foam pages to bubbleblastparties.ca so ranking is not split. Confirm with the owner.
2. **Packages and pricing:** prices, durations, inclusions, travel area, deposit amount, age range, venue requirements. Needed before any pricing section.
3. **Contact method:** phone only today. Options: a form posting to the owner's Google Sheet through an Apps Script web app (NKR's main repo has an Apps Script deploy workflow for a contact intake), or a published email the owner approves.
4. **Photos and video** of real foam parties. Avoid stock photos.
5. **Booking flow:** deposit method and calendar check use NKR's existing process (Google Calendar blocks dates).

## 5. What is already built (starter site)
Located in the NKR repo (`booknovakingdom-ops/nova-kingdom-rentals-dist`), branch `claude/loving-wozniak-47r9lt`, folder `bubbleblastparties.ca/`. Recreate these files at the root of the new repo (the files are inlined below so nothing depends on access to the old repo).

Design: single-page, plain HTML and CSS, no build step, system fonts, brand blue `#0aa5d8` with pink `#ff4f9a` accent, automatic dark mode, mobile friendly. Sections: hero, "Perfect for" cards, how it works, FAQ (venue needs, 38 km/h wind policy, who runs it), quote call-to-action, footer. Includes title, description, canonical, Open Graph, and LocalBusiness JSON-LD with NKR as parentOrganization.

### index.html
```html
<!doctype html>
<html lang="en-CA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bubble Blast Parties | Foam Party Rentals in Nova Scotia</title>
<meta name="description" content="Foam parties for birthdays, school events, graduations and community days across Nova Scotia. Foam machine, setup and cleanup handled by Nova Kingdom Rentals. Get a free quote.">
<link rel="canonical" href="https://bubbleblastparties.ca/">
<meta property="og:title" content="Bubble Blast Parties | Foam Party Rentals in Nova Scotia">
<meta property="og:description" content="Mountains of foam, zero cleanup stress. Book your foam party today.">
<meta property="og:url" content="https://bubbleblastparties.ca/">
<meta property="og:type" content="website">
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"LocalBusiness","name":"Bubble Blast Parties","parentOrganization":{"@type":"Organization","name":"Nova Kingdom Rentals","url":"https://novakingdomrentals.com"},"url":"https://bubbleblastparties.ca/","telephone":"+1-902-990-0005","address":{"@type":"PostalAddress","addressLocality":"Bridgewater","addressRegion":"NS","addressCountry":"CA"},"areaServed":"Nova Scotia","description":"Foam party rentals for birthdays, schools and community events."}
</script>
<style>
:root{--bg:#f4fbff;--ink:#0e2a3b;--muted:#46606f;--brand:#0aa5d8;--brand-d:#0780a8;--pop:#ff4f9a;--card:#fff;--line:#d5e7f0}
@media (prefers-color-scheme:dark){:root{--bg:#07202e;--ink:#eaf6fc;--muted:#a6c0cd;--card:#0c2e40;--line:#1b4a63}}
*{box-sizing:border-box}body{margin:0;font:16px/1.6 system-ui,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--ink)}
.wrap{max-width:1000px;margin:0 auto;padding:0 16px}
header{padding:14px 0;border-bottom:1px solid var(--line)}header .wrap{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.logo{font-weight:800;font-size:20px}.logo span{color:var(--pop)}
.btn{display:inline-block;background:var(--pop);color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px}
.btn.alt{background:transparent;color:var(--brand-d);border:2px solid var(--brand)}
.hero{padding:56px 0 40px;text-align:center;background:linear-gradient(180deg,#d9f3ff,transparent)}
@media (prefers-color-scheme:dark){.hero{background:linear-gradient(180deg,#0b3a52,transparent)}}
h1{font-size:clamp(32px,6vw,54px);line-height:1.1;margin:0 0 14px}h1 em{color:var(--pop);font-style:normal}
.hero p{max-width:620px;margin:0 auto 24px;color:var(--muted);font-size:18px}.hero .btn{margin:4px}
section{padding:40px 0}h2{font-size:28px;margin:0 0 20px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:20px}.card h3{margin:0 0 6px;font-size:18px}.card p{margin:0;color:var(--muted)}
ol{padding-left:20px}li{margin-bottom:8px}
details{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 16px;margin-bottom:10px}summary{cursor:pointer;font-weight:700}
.cta{background:var(--brand);color:#fff;text-align:center;border-radius:20px;padding:36px 20px}.cta .btn{background:#fff;color:var(--brand-d)}
footer{padding:30px 0;color:var(--muted);font-size:14px;text-align:center;border-top:1px solid var(--line)}footer a{color:var(--brand-d)}
</style>
</head>
<body>
<header><div class="wrap"><div class="logo">Bubble <span>Blast</span> Parties</div><a class="btn" href="tel:+19029900005">Call 902-990-0005</a></div></header>

<main>
<div class="hero"><div class="wrap">
<h1>Mountains of foam. <em>Zero</em> cleanup stress.</h1>
<p>Foam parties for birthdays, school events, graduations and community days across Nova Scotia. We bring the foam machine, set it up and take it away.</p>
<a class="btn" href="#quote">Get a free quote</a> <a class="btn alt" href="#how">How it works</a>
</div></div>

<section><div class="wrap"><h2>Perfect for</h2>
<div class="grid">
<div class="card"><h3>Birthday parties</h3><p>Kids and teens get a party they will talk about all summer.</p></div>
<div class="card"><h3>Schools &amp; daycares</h3><p>Field days, year-end celebrations and fundraisers.</p></div>
<div class="card"><h3>Graduations</h3><p>A big finish for grads and their friends.</p></div>
<div class="card"><h3>Community events</h3><p>Festivals, camps and church or club events.</p></div>
</div></div></section>

<section id="how"><div class="wrap"><h2>How it works</h2>
<ol>
<li><b>Tell us your date and location.</b> We check availability.</li>
<li><b>Get your quote.</b> No obligation.</li>
<li><b>Pay the deposit.</b> Your date is held once the deposit is received.</li>
<li><b>We set up and you party.</b> We take care of the rest.</li>
</ol></div></section>

<section><div class="wrap"><h2>Good to know</h2>
<details><summary>What do we need at the venue?</summary><p>A flat outdoor area and access to water and power. We will confirm the details when we quote.</p></details>
<details><summary>What is the weather policy?</summary><p>Rentals follow a 38 km/h wind limit under our rental agreement. If the weather is unsafe, we will work out a new date with you.</p></details>
<details><summary>Who runs Bubble Blast Parties?</summary><p>We are part of <a href="https://novakingdomrentals.com">Nova Kingdom Rentals</a>, a locally owned rental company in Bridgewater, NS.</p></details>
</div></section>

<section id="quote"><div class="wrap"><div class="cta">
<h2>Ready to book your foam party?</h2>
<p>Call or text your date, location and expected guest count and we will send a quote.</p>
<a class="btn" href="tel:+19029900005">Call 902-990-0005</a>
</div></div></section>
</main>

<footer><div class="wrap">Bubble Blast Parties, a division of <a href="https://novakingdomrentals.com">Nova Kingdom Rentals</a> · Bridgewater, Nova Scotia</div></footer>
</body>
</html>
```

### robots.txt
```
User-agent: *
Allow: /
Sitemap: https://bubbleblastparties.ca/sitemap.xml
```

### sitemap.xml
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://bubbleblastparties.ca/</loc></url></urlset>
```

### .htaccess
```
DirectoryIndex index.html
RewriteEngine On
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://%{HTTP_HOST}/$1 [R=301,L]
```

## 6. Work plan for the new session
1. Create the files above at the repo root, open `index.html` in a browser and check it at phone width (375px) and desktop, light and dark.
2. Ask the owner the questions in section 4, one batch. Do not proceed on pricing without answers.
3. Add a Packages section from the owner's numbers. Add the same numbers to NKR's `agents/core/nk-source-of-truth.md` (in the main repo) so every agent uses one source.
4. Add: gallery from real photos (compress, add alt text, set width/height), a contact form or approved email, a Google Review link (https://g.page/r/CZXOs7GUjxR5EBI/review), service-area text (start with Nova Scotia, add towns the owner confirms), and a Foam Party FAQ page for search.
5. Add per-town landing pages later, only after the owner confirms the travel area, and write each with unique content (not a find-and-replace of town names).
6. Hand the owner a deploy checklist: upload to `public_html` or connect hPanel Git deploy, enable SSL, submit `https://bubbleblastparties.ca/sitemap.xml` in Google Search Console, create the Google Business Profile if the owner wants a separate listing.
7. In the main NKR repo, add a link from the foam-machine pages and homepage to the new site (separate task, owner to approve).

## 7. Known risks
- Duplicate content if the new site's files also get published under the main domain. Keep the repos separate.
- Placing the old starter folder in the NKR repo may publish it at `novakingdomrentals.com/bubbleblastparties.ca/` if that repo is deployed whole. Remove that folder from the NKR repo once the new repo exists.
- Do not put customer details, the owner's email, or any secret into the public site or repo.
