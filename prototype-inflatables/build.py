#!/usr/bin/env python3
"""Build the multi-page Nova Kingdom Rentals inflatable-catalog PROTOTYPE.

Reads data.json and writes real, separate HTML pages (home, catalog, one page
per product, packages, section pages, contact) plus data.js for the client.
Prototype only: every page is noindex,nofollow and nothing here is wired to
production. Run:  python3 build.py   (from this folder)
"""
import html
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = "/prototype-inflatables"  # absolute asset/nav root (served from repo root)

with open(os.path.join(HERE, "data.json"), encoding="utf-8") as f:
    D = json.load(f)

PROD = {p["id"]: p for p in D["products"]}


def e(s):
    return html.escape(str(s if s is not None else ""), quote=True)


def money(n):
    return "$" + format(int(n), ",d")


NAV = [
    ("Home", "index.html", "home"),
    ("Inflatables", "inflatables.html", "inflatables"),
    ("Packages", "packages.html", "packages"),
    ("Foam Party", "foam-party.html", "foam"),
    ("Photo & Video Booths", "photo-video-booths.html", "booths"),
    ("Event Essentials", "event-essentials.html", "essentials"),
    ("Other Rentals", "other-rentals.html", "other"),
    ("Contact", "contact.html", "contact"),
]


def header(active):
    items = "".join(
        '<a href="%s/%s"%s>%s</a>' % (BASE, href, ' aria-current="page"' if key == active else "", e(label))
        for label, href, key in NAV
    )
    return (
        '<header class="site-header"><div class="header-inner">'
        '<a class="brand" href="%s/index.html" aria-label="Nova Kingdom Rentals prototype home">'
        '<img src="/images/nova-kingdom-rentals-logo.png" alt="Nova Kingdom Rentals logo" />'
        '<b>Nova Kingdom Rentals</b><span class="proto-flag" title="Prototype, not the live site">Prototype</span></a>'
        '<button class="nav-cart" id="cart-open" aria-haspopup="dialog">Quote <span class="count" id="cart-count">0</span></button>'
        '<nav class="nav" aria-label="Primary">%s</nav>'
        '</div></header>' % (BASE, items)
    )


FOOTER = (
    '<footer class="site-footer"><div class="wrap">'
    '<p><strong>Nova Kingdom Rentals</strong> — Bridgewater, Nova Scotia · 902-990-0005 · booknovakingdom@gmail.com</p>'
    '<p class="muted">This is an internal <strong>prototype</strong> of a redesigned browsing experience. It is not the live website and is excluded from search engines. The live site remains at '
    '<a href="https://novakingdomrentals.com" rel="noopener">novakingdomrentals.com</a>.</p>'
    '</div></footer>'
)

CART_DRAWER = (
    '<div class="cart-backdrop" id="cart-backdrop"></div>'
    '<aside class="cart" id="cart" role="dialog" aria-modal="true" aria-label="Your quote" aria-hidden="true">'
    '<header><h2>Your Quote</h2>'
    '<button class="close" id="cart-close" aria-label="Close quote">×</button></header>'
    '<div class="proto-banner" style="margin:.8rem 1.1rem 0">Prototype quote — nothing is sent. For demonstration only.</div>'
    '<div class="cart-items" id="cart-items"></div>'
    '<footer><div class="total"><span>Estimated rental</span><span id="cart-total">$0</span></div>'
    '<p class="note">Estimate only — delivery extra, HST extra. Availability and final pricing are confirmed manually on the live site.</p>'
    '<button class="btn btn-primary" id="cart-submit">Go to Request a Quote</button></footer></aside>'
)


def page(title, desc, active, body):
    return (
        '<!doctype html>\n<html lang="en">\n<head>\n'
        '<meta charset="UTF-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1.0" />\n'
        '<meta name="robots" content="noindex, nofollow" />\n<meta name="googlebot" content="noindex, nofollow" />\n'
        '<meta name="theme-color" content="#050814" />\n'
        '<title>%s | Nova Kingdom Rentals (Prototype)</title>\n'
        '<meta name="description" content="%s" />\n'
        '<link rel="icon" href="/favicon.ico" sizes="any" />\n'
        '<link rel="stylesheet" href="%s/styles.css" />\n</head>\n<body>\n'
        '<a class="skip" href="#main">Skip to content</a>\n'
        '%s\n<main id="main" tabindex="-1"><div class="wrap">\n%s\n</div></main>\n'
        '%s\n%s\n'
        '<script src="%s/data.js"></script>\n<script src="%s/cart.js"></script>\n</body>\n</html>\n'
        % (e(title), e(desc), BASE, header(active), body, FOOTER, CART_DRAWER, BASE, BASE)
    )


def badge(p):
    soon = p["status"] == "coming-soon"
    return '<span class="badge %s">%s</span>' % ("coming-soon" if soon else "available",
                                                 "Coming Soon" if soon else "Available Now")


def price_html(p):
    if p.get("priceText"):
        return e(p["priceText"])
    return ('From ' + money(p["price"])) if p.get("fromPrice") else money(p["price"])


def add_button(p, big=False):
    if p["status"] == "coming-soon":
        return '<button class="btn btn-ghost" data-check="%s">Check Availability</button>' % e(p["id"])
    cfg = ' data-config="dry"' if p.get("configs") else ""
    return '<button class="btn btn-primary" data-add="%s"%s aria-pressed="false">Add to Quote</button>' % (e(p["id"]), cfg)


# ---------- catalog card ----------
def card(p):
    slug = p["slug"]
    media = (
        '<a class="card-media" href="%s/products/%s.html" aria-label="View %s details">'
        '<img src="%s" alt="%s inflatable rental" loading="lazy" />%s%s</a>'
        % (BASE, slug, e(p["name"]), e(p["image"]), e(p["name"]), badge(p),
           '<span class="wetchip">Wet / Dry</span>' if p.get("wet") else "")
    )
    body = (
        '<div class="card-body"><span class="ptype">%s</span>'
        '<h3><a href="%s/products/%s.html">%s</a></h3>'
        '<span class="price">%s</span>%s'
        '<div class="bestfor"><b>Best for:</b> %s</div>'
        '<div class="card-cta"><a class="btn btn-ghost" href="%s/products/%s.html">View Details</a>%s</div></div>'
        % (e(p["type"]), BASE, slug, e(p["name"]), price_html(p),
           ('<div class="dims">%s</div>' % e(p["dims"])) if p.get("dims") else "",
           e(" • ".join(p["bestFor"])), BASE, slug, add_button(p))
    )
    exclude = ' data-exclude-all="1"' if p.get("excludeFromAll") else ""
    return '<article class="card" data-tags="%s" data-pid="%s"%s>%s%s</article>' % (e(" ".join(p["tags"])), e(p["id"]), exclude, media, body)


# ---------- pages ----------
def build_home():
    cards = "".join(
        '<a class="other-card" href="%s/%s"><h3>%s</h3><p>%s</p></a>' % (BASE, href, e(t), e(dsc))
        for t, href, dsc in [
            ("Inflatables", "inflatables.html", "Bounce & slide combos, obstacle courses, water fun, games and climb."),
            ("Packages", "packages.html", "Bundle attractions and save."),
            ("Foam Party", "foam-party.html", "High-energy foam fun by guest count."),
            ("Photo & Video Booths", "photo-video-booths.html", "360 Video Booth and Mirror Photo Booth."),
            ("Event Essentials", "event-essentials.html", "Chairs, tables and tents."),
            ("Other Rentals", "other-rentals.html", "Generator and lawn games."),
        ]
    )
    body = (
        '<section class="hero"><p class="eyebrow">Nova Kingdom Rentals</p>'
        '<h1>Party rentals, made easy to browse</h1>'
        '<p class="lede">A prototype of a cleaner, category-first way to find the right rental — built around Nova Kingdom Rentals’ real inventory. Start with inflatables.</p>'
        '<div class="card-cta" style="max-width:420px"><a class="btn btn-primary" href="%s/inflatables.html">Browse Inflatables</a>'
        '<a class="btn btn-ghost" href="%s/packages.html">See Packages</a></div></section>'
        '<section class="section"><h2>Explore by category</h2><div class="other-grid">%s</div></section>'
        % (BASE, BASE, cards)
    )
    return page("Home", "Prototype home — category-first rental browsing for Nova Kingdom Rentals.", "home", body)


def cat_count(cid):
    if cid == "all":
        return sum(1 for p in D["products"] if not p.get("excludeFromAll"))
    return sum(1 for p in D["products"] if cid in p["tags"])


def build_inflatables():
    chips = "".join(
        '<a class="chip" role="button" data-type="%s" href="inflatables.html%s" aria-pressed="false">%s <span class="chip-n">(%d)</span></a>'
        % (c["id"], "" if c["id"] == "all" else ("?type=" + c["id"]), e(c["label"]), cat_count(c["id"]))
        for c in D["categories"]
    )
    cards = "".join(card(p) for p in D["products"])
    other = other_rentals_section()
    body = (
        '<section class="hero"><p class="eyebrow">Nova Kingdom Rentals</p>'
        '<h1>Inflatable Rentals &amp; Bouncy Castles</h1>'
        '<p class="lede">Commercial-grade bouncy castles, combos, obstacle courses, water slides and games — delivered and set up across the South Shore and Nova Scotia. Pick a type below to narrow things down.</p></section>'
        '<section class="section" aria-labelledby="browse-h">'
        '<div class="filter-head"><h2 id="browse-h">Browse Inflatables by Type</h2><span class="result-count" id="result-count"></span></div>'
        '<div class="filterbar"><div class="chips" role="group" aria-label="Filter inflatables by type">%s</div></div>'
        '<div class="grid" id="catalog-grid">%s</div>'
        '<div class="empty hidden" id="empty"><p>No rentals are currently listed in this category.</p>'
        '<a class="btn btn-primary" href="inflatables.html" style="max-width:240px;margin:0 auto">View All</a></div>'
        '</section>%s'
        '<div class="cta-band"><h2>Ready to build your quote?</h2>'
        '<p class="muted">Add items as you browse, then review your estimate. Delivery extra · HST extra.</p>'
        '<button class="btn btn-primary" id="cart-open-2" onclick="document.getElementById(\'cart-open\').click()" style="max-width:260px;margin:.4rem auto 0">View Your Quote</button></div>'
        % (chips, cards, other)
    )
    return page("Inflatable Rentals", "Browse inflatable rentals by type — combos, obstacle courses, water fun, games and climb.", "inflatables", body)


def other_rentals_section():
    links = [
        ("Packages", "packages.html", "Bundle attractions and save."),
        ("Foam Party", "foam-party.html", "$349–$800/hr by guest count, plus the Inflatable Foam Pit."),
        ("Photo & Video Booths", "photo-video-booths.html", "360 Video Booth and Mirror Photo Booth."),
        ("Event Essentials", "event-essentials.html", "White resin folding chairs, tables and tents."),
        ("Lawn Games", "other-rentals.html", "5 Lawn Games add-on — $100."),
        ("Generator Rentals", "other-rentals.html", "Power where there are no outlets — $150."),
    ]
    cards = "".join('<a class="other-card" href="%s/%s"><h3>%s</h3><p>%s</p></a>' % (BASE, href, e(t), e(dsc)) for t, href, dsc in links)
    return ('<section class="section" aria-labelledby="other-h"><h2 id="other-h">Explore Other Rentals</h2>'
            '<p class="section-lead">Looking for something other than inflatables? These live in their own areas.</p>'
            '<div class="other-grid">%s</div></section>' % cards)


def build_product(p):
    soon = p["status"] == "coming-soon"
    pills = ('<span class="pill" style="color:%s">%s</span>' % ("var(--soon)" if soon else "var(--ok)", "Coming Soon" if soon else "Available Now")
             + '<span class="pill">%s</span>' % ("Wet or Dry use" if p.get("wet") else "Dry use only"))
    cfg = ""
    if p.get("configs"):
        btns = "".join('<button type="button" data-cfg="%s" aria-pressed="%s">%s — %s</button>'
                       % (c["id"], "true" if i == 0 else "false", e(c["label"]), money(c["price"])) for i, c in enumerate(p["configs"]))
        cfg = ('<div data-config-group="%s"><p style="font-weight:700;margin:.4rem 0 .3rem">Choose a configuration:</p>'
               '<div class="cfg">%s</div></div>' % (e(p["id"]), btns))
    specs = [("Price", p.get("priceText") or (("From " + money(p["price"])) if p.get("configs") else money(p["price"]))),
             ("Category", p["type"]),
             ("Availability", "Coming Soon" if soon else "Available Now")]
    if p.get("dims"):
        specs.append(("Dimensions", p["dims"]))
    specs.append(("Wet / Dry", "Can be used wet or dry" if p.get("wet") else "Dry use only"))
    if p.get("capacity"):
        specs.append(("Capacity", p["capacity"]))
    specs += [("Rental duration", D["policy"]["duration"]),
              ("Setup", D["policy"]["setupWet"] if p.get("wet") else D["policy"]["setupDry"]),
              ("Delivery", D["policy"]["delivery"]),
              ("Best for", " • ".join(p["bestFor"]))]
    specs_html = "".join('<dt>%s</dt><dd>%s</dd>' % (e(k), e(v)) for k, v in specs)
    live = D["detailBase"] + p["slug"]
    specs_html += '<dt>Live details page</dt><dd><a href="%s" target="_blank" rel="noopener">%s</a></dd>' % (e(live), e(live))

    if soon:
        ctas = ('<button class="btn btn-primary" disabled>Coming Soon</button>'
                '<button class="btn btn-ghost" data-check="%s">Check Availability</button>' % e(p["id"]))
    else:
        ctas = ('<button class="btn btn-primary" data-add="%s" aria-pressed="false">Add to Quote</button>'
                '<a class="btn btn-ghost" href="%s/contact.html">Check Availability</a>' % (e(p["id"]), BASE))

    gallery_html = ""
    if p.get("gallery") and len(p["gallery"]) > 1:
        figs = []
        for g in p["gallery"]:
            src = g["src"] if isinstance(g, dict) else g
            cap = g.get("caption") if isinstance(g, dict) else ""
            figs.append('<figure><img src="%s" alt="%s" loading="lazy" />%s</figure>' % (
                e(src), e(cap or (p["name"] + " view")),
                ('<figcaption>%s</figcaption>' % e(cap)) if cap else ""))
        gallery_html = '<div class="detail-gallery">' + "".join(figs) + '</div>'
    body = (
        '<nav class="crumbs" aria-label="Breadcrumb" style="padding:1rem 0 .2rem;font-size:.86rem">'
        '<a href="%s/inflatables.html">← All inflatables</a></nav>'
        '<article class="detail"><div class="detail-media"><img src="%s" alt="%s inflatable rental" /></div>'
        '<div class="detail-info"><p class="ptype">%s</p><h1>%s</h1>'
        '<div class="row">%s</div>%s<p class="detail-blurb">%s</p>%s'
        '<div class="card-cta" style="max-width:420px">%s</div>'
        '<dl class="specs">%s</dl></div></article>'
        % (BASE, e(p["image"]), e(p["name"]), e(p["type"]), e(p["name"] + ((" (" + p["altName"] + ")") if p.get("altName") else "")),
           pills, cfg, e(p["blurb"]), gallery_html, ctas, specs_html)
    )
    return page(p["name"] + " Rental", p["blurb"][:150], "inflatables", body)


def build_packages():
    cards = []
    for pkg in D["packages"]:
        items = "".join('<li>%s</li>' % e(PROD[i]["name"] if i in PROD else i) for i in pkg["items"])
        cta = '<button class="btn btn-primary" data-add-pkg="%s">Add to Quote</button>' % e(pkg["id"])
        if pkg.get("customizable"):
            cta += '<button class="btn btn-ghost" data-custom-pkg="%s">Customize This Package</button>' % e(pkg["id"])
            custom = '<div class="pkg-customize hidden" data-pkg="%s"></div>' % e(pkg["id"])
        else:
            cta += '<span class="muted" style="font-size:.8rem;align-self:center">Fixed package</span>'
            custom = ""
        cards.append('<div class="pkg"><h3>%s</h3><div class="pkg-price">%s</div><ul>%s</ul>'
                     '<div class="pkg-cta">%s</div>%s</div>' % (e(pkg["name"]), money(pkg["price"]), items, cta, custom))
    body = ('<section class="hero"><p class="eyebrow">Nova Kingdom Rentals</p><h1>Party Packages</h1>'
            '<p class="lede">Bundle attractions and save. Customize eligible packages by swapping attractions — pricing adjusts by the difference in standalone value.</p></section>'
            '<section class="section"><div class="pkg-grid">%s</div>'
            '<p class="muted" style="font-size:.84rem;margin-top:1rem">Customization allows swaps only (no removals). Full Kingdom Takeover is a fixed package.</p></section>'
            % "".join(cards))
    return page("Packages", "Party rental packages — bundle and save, with swap-only customization.", "packages", body)


def build_section(key, active):
    s = D["sections"][key]
    cards = "".join('<div class="other-card" style="cursor:default"><h3>%s</h3><p>%s</p></div>' % (e(t), e(v)) for t, v in s["items"])
    body = ('<section class="hero"><p class="eyebrow">Nova Kingdom Rentals</p><h1>%s</h1><p class="lede">%s</p></section>'
            '<section class="section"><div class="other-grid">%s</div>'
            '<p class="section-lead" style="margin-top:1rem">On the live site this lives at <a href="%s" rel="noopener">%s</a>.</p></section>'
            % (e(s["title"]), e(s["lead"]), cards, e(s["liveUrl"]), e(s["liveUrl"])))
    return page(s["title"], s["lead"], active, body)


def build_contact():
    body = ('<section class="hero"><p class="eyebrow">Nova Kingdom Rentals</p><h1>Request a Quote</h1>'
            '<p class="lede">Tell us about your event and we’ll follow up.</p></section>'
            '<section class="section" style="max-width:640px">'
            '<div class="proto-banner">Prototype only — this form does not send anything.</div>'
            '<div style="background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:1rem;margin:.8rem 0">'
            '<h2 style="font-size:1.1rem">Your quote</h2><div id="contact-summary"></div></div>'
            '<form id="proto-form">'
            '<div class="form-field"><label for="f-name">Name</label><input id="f-name" type="text" autocomplete="name" /></div>'
            '<div class="form-field"><label for="f-email">Email</label><input id="f-email" type="email" autocomplete="email" /></div>'
            '<div class="form-field"><label for="f-date">Event date</label><input id="f-date" type="date" /></div>'
            '<div class="form-field"><label for="f-msg">Message</label><textarea id="f-msg" rows="3"></textarea></div>'
            '<button class="btn btn-primary" type="submit" style="max-width:260px">Preview Request (no send)</button>'
            '<p id="form-result" class="muted" style="margin-top:.6rem"></p></form></section>')
    return page("Request a Quote", "Prototype request-a-quote — local demonstration only.", "contact", body)


def write(rel, content):
    path = os.path.join(HERE, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(content)
    return rel


def main():
    written = []
    # client data mirror
    with open(os.path.join(HERE, "data.js"), "w", encoding="utf-8") as fh:
        fh.write("window.NKR_DATA = " + json.dumps(D, ensure_ascii=False) + ";\n")
    written.append("data.js")
    written.append(write("index.html", build_home()))
    written.append(write("inflatables.html", build_inflatables()))
    for p in D["products"]:
        written.append(write("products/%s.html" % p["slug"], build_product(p)))
    written.append(write("packages.html", build_packages()))
    written.append(write("foam-party.html", build_section("foam", "foam")))
    written.append(write("photo-video-booths.html", build_section("booths", "booths")))
    written.append(write("event-essentials.html", build_section("essentials", "essentials")))
    written.append(write("other-rentals.html", build_section("other", "other")))
    written.append(write("contact.html", build_contact()))
    print("Built %d files:" % len(written))
    for w in written:
        print("  " + w)


if __name__ == "__main__":
    main()
