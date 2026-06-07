#!/usr/bin/env python3
"""Generate static HTML entrypoints with route-specific SEO metadata.

This repository is a built Vite/React SPA. Apache falls back unknown routes to
/index.html, so crawlers that do not execute JavaScript otherwise see only the
homepage head on inner routes. This script keeps the SPA body/assets unchanged
and writes /<route>/index.html files whose initial HTML head matches the route.
"""
from __future__ import annotations

import html
import json
import re
import shutil
from urllib.parse import quote
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
BASE_URL = "https://novakingdomrentals.com"
GENERAL_IMAGE = "/images/packages/kingdom-deluxe-package.jpg"
RENTALS_IMAGE = "/images/crown-island-combo.jpeg"
BOOTH_IMAGE = "/images/360-video-booth.jpg"
LAWN_IMAGE = "/images/lawn-games/cornhole.png"
LOGO_IMAGE = "/images/nova-kingdom-rentals-logo.png"

BOOTH_SLUGS = {
    "360-video-booth-rental-nova-scotia",
    "photo-booth-rental-bridgewater-ns",
    "360-video-booth-rental-new-brunswick",
    "360-video-booth-rental-pei",
    "photo-booth-rental-halifax-ns",
    "photo-booth-rental-moncton-nb",
    "photo-booth-rental-charlottetown-pei",
    "photo-booth-rentals-maritimes",
    "event-photo-booth-rental-atlantic-canada",
    "360-video-booth-event-ideas",
}
GENERATED_MARKER = "<!-- Generated static route HTML: do not edit by hand. Run scripts/generate_static_route_html.py. -->"

# Bridgewater, Nova Scotia geo coordinates
GEO_LAT = 44.3737
GEO_LNG = -64.5207


def load_json(path: str) -> Any:
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


def absolute_url(path: str) -> str:
    if path.startswith("http://") or path.startswith("https://"):
        return path
    if not path.startswith("/"):
        path = f"/{path}"
    return f"{BASE_URL}{quote(path, safe='/')}"


def route_url(path: str) -> str:
    return f"{BASE_URL}{quote(path, safe='/')}"


def h(value: str) -> str:
    return html.escape(value, quote=True)


def money_value(value: str | int | float | None) -> str | None:
    if value is None:
        return None
    cleaned = re.sub(r"[^0-9.]", "", str(value))
    return cleaned or None


def website_schema(site_info: dict[str, Any]) -> dict[str, Any]:
    return {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "@id": f"{BASE_URL}/#website",
        "url": f"{BASE_URL}/",
        "name": site_info["businessName"],
        "description": "Bouncy castle and inflatable rentals from Bridgewater, Nova Scotia. Water slides, interactive games, lawn games, 360 Video Booth, and party packages.",
        "inLanguage": "en-CA",
        "publisher": {"@id": f"{BASE_URL}/#organization"},
        "potentialAction": {
            "@type": "SearchAction",
            "target": {
                "@type": "EntryPoint",
                "urlTemplate": f"{BASE_URL}/rentals?q={{search_term_string}}",
            },
            "query-input": "required name=search_term_string",
        },
    }


def business_schema(site_info: dict[str, Any], *, homepage: bool = False) -> dict[str, Any]:
    schema: dict[str, Any] = {
        "@context": "https://schema.org",
        "@type": ["LocalBusiness", "EntertainmentBusiness"],
        "@id": f"{BASE_URL}/#localbusiness",
        "name": site_info["businessName"],
        "legalName": site_info.get("legalOwner"),
        "url": f"{BASE_URL}/",
        "telephone": site_info.get("phone"),
        "email": site_info.get("email"),
        "image": absolute_url(RENTALS_IMAGE),
        "logo": {
            "@type": "ImageObject",
            "@id": f"{BASE_URL}/#logo",
            "url": absolute_url(LOGO_IMAGE),
            "contentUrl": absolute_url(LOGO_IMAGE),
            "caption": site_info["businessName"],
        },
        "priceRange": "$$",
        "currenciesAccepted": "CAD",
        "paymentAccepted": "Cash, e-Transfer, Deposit",
        "description": "Bridgewater-based inflatable and party rental business offering bouncy castle rentals, water slides, interactive games, lawn games, 360 Video Booth, and party packages across the South Shore and Nova Scotia, with selected larger Maritimes / Atlantic Canada bookings by quote.",
        "address": {
            "@type": "PostalAddress",
            "streetAddress": "Bridgewater",
            "addressLocality": "Bridgewater",
            "addressRegion": "Nova Scotia",
            "postalCode": "B4V",
            "addressCountry": "CA",
        },
        "geo": {
            "@type": "GeoCoordinates",
            "latitude": GEO_LAT,
            "longitude": GEO_LNG,
        },
        "areaServed": [
            {"@type": "City", "name": "Bridgewater", "containedInPlace": {"@type": "State", "name": "Nova Scotia"}},
            {"@type": "Place", "name": "South Shore Nova Scotia"},
            {"@type": "State", "name": "Nova Scotia"},
            {"@type": "Place", "name": "Maritimes"},
            {"@type": "Place", "name": "Atlantic Canada"},
        ],
        "knowsAbout": [
            "bouncy castle rentals",
            "inflatable rentals",
            "water slide rentals",
            "interactive game rentals",
            "lawn game rentals",
            "360 video booth rental",
            "party packages",
            "school event rentals",
            "community event rentals",
            "festival inflatable rentals",
        ],
        "hasOfferCatalog": {
            "@type": "OfferCatalog",
            "name": "Nova Kingdom Rentals — Event Rental Catalogue",
            "url": f"{BASE_URL}/rentals",
        },
    }
    if homepage:
        schema["sameAs"] = [link["href"] for link in site_info.get("socialLinks", [])]
    return schema


def organization_schema(site_info: dict[str, Any]) -> dict[str, Any]:
    return {
        "@context": "https://schema.org",
        "@type": "Organization",
        "@id": f"{BASE_URL}/#organization",
        "name": site_info["businessName"],
        "legalName": site_info.get("legalOwner"),
        "url": f"{BASE_URL}/",
        "logo": {
            "@type": "ImageObject",
            "@id": f"{BASE_URL}/#logo",
            "url": absolute_url(LOGO_IMAGE),
            "contentUrl": absolute_url(LOGO_IMAGE),
            "caption": site_info["businessName"],
        },
        "email": site_info.get("email"),
        "telephone": site_info.get("phone"),
        "address": {
            "@type": "PostalAddress",
            "addressLocality": "Bridgewater",
            "addressRegion": "Nova Scotia",
            "addressCountry": "CA",
        },
        "sameAs": [link["href"] for link in site_info.get("socialLinks", [])],
    }


def breadcrumb_schema(path: str, name: str) -> dict[str, Any]:
    items = [{"@type": "ListItem", "position": 1, "name": "Home", "item": f"{BASE_URL}/"}]
    if path != "/":
        items.append({"@type": "ListItem", "position": 2, "name": name, "item": route_url(path)})
    return {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": items}


def faq_schema(faq_items: list[dict[str, str]] | list[tuple[str, str]]) -> dict[str, Any] | None:
    entities = []
    for item in faq_items:
        if isinstance(item, dict):
            question, answer = item.get("question"), item.get("answer")
        else:
            question, answer = item
        if question and answer:
            entities.append(
                {
                    "@type": "Question",
                    "name": question,
                    "acceptedAnswer": {"@type": "Answer", "text": answer},
                }
            )
    if not entities:
        return None
    return {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": entities}


def howto_schema() -> dict[str, Any]:
    return {
        "@context": "https://schema.org",
        "@type": "HowTo",
        "name": "How to Book an Inflatable Rental from Nova Kingdom Rentals",
        "description": "Book a bouncy castle, inflatable, lawn game, 360 Video Booth, or party package rental from Nova Kingdom Rentals in Bridgewater, Nova Scotia.",
        "totalTime": "PT5M",
        "supply": [
            {"@type": "HowToSupply", "name": "Event date"},
            {"@type": "HowToSupply", "name": "Event address"},
            {"@type": "HowToSupply", "name": "Power access information"},
        ],
        "step": [
            {
                "@type": "HowToStep",
                "position": 1,
                "name": "Choose your rental or package",
                "text": "Browse the lineup at novakingdomrentals.com/rentals or novakingdomrentals.com/packages. Pick the inflatable, lawn games, 360 Video Booth, or package that fits your event type, crowd size, and space.",
                "url": f"{BASE_URL}/rentals",
            },
            {
                "@type": "HowToStep",
                "position": 2,
                "name": "Send your event details",
                "text": "Submit your event date, address, event type, product or package choice, number of guests, setup surface, and power or water access through the contact form at novakingdomrentals.com/contact.",
                "url": f"{BASE_URL}/contact",
            },
            {
                "@type": "HowToStep",
                "position": 3,
                "name": "Receive confirmation and pay deposit",
                "text": "Nova Kingdom Rentals will review your request, confirm availability, travel cost, and setup suitability, then send pricing and deposit details. Your booking is confirmed only after deposit is received.",
                "url": f"{BASE_URL}/contact",
            },
        ],
    }


def product_schema(product: dict[str, Any]) -> dict[str, Any]:
    availability = (
        "https://schema.org/InStock"
        if product.get("status") == "Available Now"
        else "https://schema.org/PreOrder"
    )
    offer: dict[str, Any] = {
        "@type": "Offer",
        "priceCurrency": "CAD",
        "availability": availability,
        "url": route_url(f"/rentals/{product['slug']}"),
        "seller": {"@id": f"{BASE_URL}/#organization"},
        "areaServed": [
            {"@type": "State", "name": "Nova Scotia"},
            {"@type": "Place", "name": "South Shore Nova Scotia"},
        ],
    }
    price = money_value(product.get("price"))
    if price:
        offer["price"] = price

    schema: dict[str, Any] = {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": product["name"],
        "image": {
            "@type": "ImageObject",
            "url": absolute_url(product["image"]),
            "contentUrl": absolute_url(product["image"]),
            "name": f"{product['name']} — Nova Kingdom Rentals",
        },
        "description": product.get("fullDescription") or product.get("shortDescription"),
        "brand": {
            "@type": "Brand",
            "name": "Nova Kingdom Rentals",
            "@id": f"{BASE_URL}/#organization",
        },
        "category": product.get("category"),
        "offers": offer,
        "isRelatedTo": {"@id": f"{BASE_URL}/#localbusiness"},
    }

    # Add dimensions if available
    if product.get("dimensions"):
        schema["depth"] = {"@type": "QuantitativeValue", "description": product["dimensions"]}

    return schema


def service_schema(page: dict[str, Any], site_info: dict[str, Any]) -> dict[str, Any]:
    """Service schema for SEO location/event pages."""
    return {
        "@context": "https://schema.org",
        "@type": "Service",
        "name": page["title"],
        "description": page["intro"],
        "provider": {"@id": f"{BASE_URL}/#localbusiness"},
        "serviceType": "Event Equipment Rental",
        "areaServed": {"@type": "Place", "name": page.get("serviceAreaText", "Nova Scotia")[:100]},
        "url": route_url(f"/{page['slug']}"),
        "hasOfferCatalog": {
            "@type": "OfferCatalog",
            "name": f"Nova Kingdom Rentals — {page['title']}",
            "url": route_url(f"/{page['slug']}"),
        },
    }


def item_list_schema(name: str, path: str, items: list[dict[str, str]]) -> dict[str, Any]:
    return {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "name": name,
        "url": route_url(path),
        "itemListElement": [
            {"@type": "ListItem", "position": index + 1, "name": item["name"], "url": route_url(item["url"])}
            for index, item in enumerate(items)
        ],
    }


def flatten_faqs(faq_data: dict[str, Any]) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    for group in faq_data.get("groups", []):
        pairs.extend((question, answer) for question, answer in group.get("items", []))
    return pairs


def route_metadata(
    *,
    site_info: dict[str, Any],
    products: list[dict[str, Any]],
    packages: list[dict[str, Any]],
    faqs: dict[str, Any],
    seo_pages: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    product_by_slug = {product["slug"]: product for product in products}
    product_by_id = {product["id"]: product for product in products}
    product_items = [{"name": p["name"], "url": f"/rentals/{p['slug']}"} for p in products]
    package_items = [{"name": p["name"], "url": "/packages"} for p in packages]
    all_faqs = flatten_faqs(faqs)

    routes: dict[str, dict[str, Any]] = {
        "/": {
            "title": "Bouncy Castle & Inflatable Rentals Bridgewater NS | Nova Kingdom Rentals",
            "description": "Premium bouncy castle and inflatable rentals from Bridgewater NS. Water slides, lawn games, 360 Video Booth, and packages. Setup included. South Shore and Nova Scotia.",
            "image": GENERAL_IMAGE,
            "schema": [
                website_schema(site_info),
                organization_schema(site_info),
                business_schema(site_info, homepage=True),
                item_list_schema("Nova Kingdom Rentals main rentals", "/", product_items),
                howto_schema(),
                faq_schema(all_faqs),
                breadcrumb_schema("/", "Home"),
            ],
        },
        "/rentals": {
            "title": "Inflatable Rentals & Bouncy Castles | Nova Kingdom Rentals NS",
            "description": "Browse bouncy castles, water slides, inflatable games, and add-ons from Nova Kingdom Rentals. Setup included. Available from Bridgewater across the South Shore and Nova Scotia.",
            "image": RENTALS_IMAGE,
            "schema": [
                item_list_schema("Nova Kingdom Rentals inflatable rentals", "/rentals", product_items),
                breadcrumb_schema("/rentals", "Inflatable Rentals"),
            ],
        },
        "/packages": {
            "title": "Party Rental Packages from $310 | Nova Kingdom Rentals NS",
            "description": "Inflatable rental packages for birthdays, schools, and community events in Nova Scotia. Water slides, interactive games, and lawn games bundled. Packages from $310.",
            "image": GENERAL_IMAGE,
            "schema": [
                item_list_schema("Nova Kingdom Rentals party rental packages", "/packages", package_items),
                breadcrumb_schema("/packages", "Party Rental Packages"),
            ],
        },
        "/lawn-games": {
            "title": "Lawn Game Rentals Bridgewater NS | 12 Games | Nova Kingdom Rentals",
            "description": "12 lawn games for rent across Nova Scotia. Cornhole, Giant Connect 4, Giant Jenga, Ladder Toss, and more. Packages from $175. Bridgewater-based, South Shore and NS.",
            "image": LAWN_IMAGE,
            "schema": [breadcrumb_schema("/lawn-games", "Lawn Game Rentals")],
        },
        "/about": {
            "title": "About Nova Kingdom Rentals | Bridgewater Inflatable Rentals NS",
            "description": "Nova Kingdom Rentals is a fully insured Bridgewater-based inflatable and party rental company. Serving families, schools, and community events across Nova Scotia.",
            "image": RENTALS_IMAGE,
            "schema": [organization_schema(site_info), breadcrumb_schema("/about", "About Nova Kingdom Rentals")],
        },
        "/service-areas": {
            "title": "Service Areas | Inflatable Rentals from Bridgewater NS | Nova Kingdom Rentals",
            "description": "Nova Kingdom Rentals is based in Bridgewater, serving the South Shore and Nova Scotia. Larger events and selected Maritimes / Atlantic Canada bookings available by quote.",
            "image": RENTALS_IMAGE,
            "schema": [
                business_schema(site_info),
                breadcrumb_schema("/service-areas", "Service Areas"),
            ],
        },
        "/faq": {
            "title": "Bouncy Castle Rental FAQ | Nova Kingdom Rentals Bridgewater NS",
            "description": "Answers to your questions about booking, delivery, setup, weather, supervision, and safety for inflatable and bouncy castle rentals from Nova Kingdom Rentals.",
            "image": GENERAL_IMAGE,
            "schema": [breadcrumb_schema("/faq", "FAQ"), faq_schema(all_faqs)],
        },
        "/contact": {
            "title": "Check Availability | Nova Kingdom Rentals Bridgewater NS",
            "description": "Send your event date and details to request availability for inflatable rentals and party packages from Nova Kingdom Rentals in Bridgewater, Nova Scotia.",
            "image": RENTALS_IMAGE,
            "schema": [breadcrumb_schema("/contact", "Contact"), business_schema(site_info)],
        },
    }

    for product in products:
        path = f"/rentals/{product['slug']}"
        routes[path] = {
            "title": product.get("metaTitle") or f"{product['name']} | Nova Kingdom Rentals",
            "description": product.get("metaDescription") or product.get("shortDescription") or product.get("fullDescription") or f"{product['name']} rental from Nova Kingdom Rentals.",
            "image": product["image"],
            "schema": [breadcrumb_schema(path, product["name"]), product_schema(product)],
        }

    for page in seo_pages:
        path = f"/{page['slug']}"
        first_product = None
        for product_id in page.get("featuredProductIds", []):
            first_product = product_by_id.get(product_id) or product_by_slug.get(product_id)
            if first_product:
                break
        schema = [breadcrumb_schema(path, page["h1"])]
        # Add service schema for location/event pages
        schema.append(service_schema(page, site_info))
        page_faq = faq_schema(page.get("faq", []))
        if page_faq:
            schema.append(page_faq)
        default_image = BOOTH_IMAGE if page["slug"] in BOOTH_SLUGS else RENTALS_IMAGE
        routes[path] = {
            "title": page["metaTitle"],
            "description": page["metaDescription"],
            "image": first_product.get("image") if first_product else default_image,
            "schema": schema,
        }

    return routes


def render_head(meta: dict[str, Any], path: str) -> str:
    canonical = route_url(path)
    image = absolute_url(meta["image"])
    title = meta["title"]
    description = meta["description"]
    schema_items = [item for item in meta.get("schema", []) if item]
    schema = {"@context": "https://schema.org", "@graph": schema_items}
    return f'''{GENERATED_MARKER}
    <meta name="description" content="{h(description)}" />
    <meta property="og:title" content="{h(title)}" />
    <meta property="og:description" content="{h(description)}" />
    <meta property="og:image" content="{h(image)}" />
    <meta property="og:url" content="{h(canonical)}" />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="{h(title)}" />
    <meta name="twitter:description" content="{h(description)}" />
    <meta name="twitter:image" content="{h(image)}" />
    <link rel="canonical" href="{h(canonical)}" />
    <link rel="alternate" type="text/plain" title="LLMs.txt" href="/llms.txt" />
    <title>{h(title)}</title>
    <script type="application/ld+json">
      {json.dumps(schema, ensure_ascii=False, indent=6)}
    </script>'''


def split_template(template: str) -> tuple[str, str]:
    if GENERATED_MARKER in template:
        head_start = template.index(GENERATED_MARKER)
    else:
        head_start = template.index('    <meta\n      name="description"')
    assets_start = template.index('    <script type="module" crossorigin src="/assets/index-')
    return template[:head_start], template[assets_start:]


def output_path_for_route(path: str) -> Path:
    if path == "/":
        return ROOT / "index.html"
    return ROOT / path.strip("/") / "index.html"


def remove_previous_generated_routes(routes: dict[str, dict[str, Any]]) -> None:
    for route in routes:
        if route == "/":
            continue
        route_dir = ROOT / route.strip("/")
        html_file = route_dir / "index.html"
        if html_file.exists() and GENERATED_MARKER in html_file.read_text(encoding="utf-8"):
            shutil.rmtree(route_dir)


def validate_images(routes: dict[str, dict[str, Any]]) -> None:
    missing = []
    for route, meta in routes.items():
        image = meta["image"]
        if not image.startswith("http") and not (ROOT / image.lstrip("/")).exists():
            missing.append((route, image))
    if missing:
        raise SystemExit(f"Missing OG images: {missing}")


def validate_sitemap_routes(routes: dict[str, dict[str, Any]]) -> None:
    ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    root = ET.parse(ROOT / "sitemap.xml").getroot()
    missing = []
    for loc in root.findall("s:url/s:loc", ns):
        path = loc.text.replace(BASE_URL, "") or "/"
        if path == "/llms.txt":
            continue
        if path not in routes:
            missing.append(path)
    if missing:
        raise SystemExit(f"Sitemap routes missing metadata: {missing}")


def main() -> None:
    site_info = load_json("data/siteInfo.json")
    products = load_json("data/products.json")
    packages = load_json("data/packages.json")
    faqs = load_json("data/faqs.json")
    seo_pages = load_json("data/seoPages.json")
    routes = route_metadata(site_info=site_info, products=products, packages=packages, faqs=faqs, seo_pages=seo_pages)

    validate_images(routes)
    validate_sitemap_routes(routes)

    template = (ROOT / "index.html").read_text(encoding="utf-8")
    prefix, suffix = split_template(template)

    remove_previous_generated_routes(routes)

    for path, meta in sorted(routes.items()):
        output_path = output_path_for_route(path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(f"{prefix}{render_head(meta, path)}\n{suffix}", encoding="utf-8")

    print(f"Generated {len(routes)} route HTML files with static SEO metadata.")


if __name__ == "__main__":
    main()
