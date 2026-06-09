#!/usr/bin/env python3
"""
Update SEO strategy for Valley/Windsor/Kentville demand areas.

Actions:
- Fix existing Valley pages (remove over-cautious language, improve content)
- Add new priority pages for Kentville, New Minas, Windsor, HRM sub-areas, South Shore micro
- Update serviceArea wording to reflect real Valley demand
- Update sitemap.xml
"""
from __future__ import annotations
import json, xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE_URL = "https://novakingdomrentals.com"

pages = json.load(open(ROOT / "data/seoPages.json", encoding="utf-8"))
existing_slugs = {p["slug"] for p in pages}

# ---------------------------------------------------------------------------
# Valley service area text — standard format, NO over-cautious language
# ---------------------------------------------------------------------------
def valley_sat(approx_km: int, city: str) -> str:
    return (
        f"Nova Kingdom Rentals is based in Bridgewater, Nova Scotia. "
        f"Approximately {approx_km} km from Bridgewater. "
        f"Travel quoted — $0.72/km after the first 15 km. "
        f"Nova Kingdom Rentals serves {city} and the Annapolis Valley for backyard birthdays, "
        f"school events, community celebrations, and larger occasions. "
        f"Final travel cost confirmed with your quote."
    )

def standard_sat(approx_km: int) -> str:
    return (
        f"Nova Kingdom Rentals is based in Bridgewater, Nova Scotia. "
        f"Approximately {approx_km} km from Bridgewater. "
        f"Travel quoted. Travel fee applies after the first 15 km from Bridgewater ($0.72/km). "
        f"Final travel cost confirmed with your quote."
    )

# ---------------------------------------------------------------------------
# Rich city context for improved intros
# ---------------------------------------------------------------------------
CITY_INTRO = {
    "Windsor NS": (
        "Windsor is the birthplace of hockey and home to the Hants County Exhibition — "
        "one of Nova Scotia's oldest agricultural fairs. It's a fast-growing community between HRM and the Annapolis Valley, "
        "with strong school, community, and backyard event culture year-round."
    ),
    "Wolfville NS": (
        "Wolfville is home to Acadia University, surrounded by Annapolis Valley vineyards and the Grand Pré UNESCO World Heritage Site. "
        "The community hosts a year-round calendar of school events, campus celebrations, summer festivals, and family gatherings."
    ),
    "Kentville NS": (
        "Kentville is the county seat of Kings County and the commercial hub of the Annapolis Valley. "
        "It serves a large surrounding population with active schools, community events, sports leagues, and family celebrations throughout the year."
    ),
    "New Minas NS": (
        "New Minas is the Valley's main commercial strip, adjacent to Kentville and Coldbrook, with high family traffic, "
        "strong school communities, and a busy backyard birthday and community event season from spring through fall."
    ),
    "Coldbrook NS": (
        "Coldbrook sits between New Minas and Berwick in the heart of the Annapolis Valley commercial corridor, "
        "serving a strong mix of family neighbourhoods, schools, and community events."
    ),
    "Berwick NS": (
        "Berwick is an apple-growing town in the Annapolis Valley known for its community spirit, active school programs, "
        "and seasonal events including the Berwick Apple Capital Festival."
    ),
    "Hantsport NS": (
        "Hantsport is a small community on the Avon River near Windsor, with a tight-knit neighbourhood culture "
        "and strong participation in community events and backyard celebrations."
    ),
    "Kingston NS": (
        "Kingston is home to CFB Greenwood and serves as a hub for the southern Annapolis Valley, "
        "with a large military and civilian family community, schools, and regular community events."
    ),
    "Greenwood NS": (
        "Greenwood is home to one of Canada's largest military airbases, CFB Greenwood, with a strong military family community, "
        "active schools, and a full calendar of community events and family celebrations."
    ),
    "Timberlea NS": (
        "Timberlea is a growing residential community in Halifax Regional Municipality, popular for family events, "
        "backyard birthdays, school fun days, and community park celebrations."
    ),
    "Hammonds Plains NS": (
        "Hammonds Plains is one of HRM's fastest-growing residential areas, with a booming family population, "
        "active schools, and strong demand for backyard party and school event rentals."
    ),
    "Tantallon NS": (
        "Tantallon (St. Margarets Bay area) is a scenic coastal community in western HRM, "
        "popular for summer backyard events, school celebrations, and community gatherings by the bay."
    ),
    "Hubbards NS": (
        "Hubbards is a coastal South Shore community where HRM meets Lunenburg County. "
        "With a large summer population and year-round residents, it's a popular spot for backyard parties, "
        "beach celebrations, and community events from May through September."
    ),
    "New Ross NS": (
        "New Ross is an inland Nova Scotia community about 35 km northwest of Bridgewater, "
        "serving rural families across the Ross Farm area with school events, backyard birthdays, and community celebrations."
    ),
}

FAQ_VALLEY = lambda city, km: [
    {
        "question": f"Does Nova Kingdom Rentals deliver to {city}?",
        "answer": (
            f"Yes — Nova Kingdom Rentals serves {city} and the surrounding Annapolis Valley area. "
            f"We are based in Bridgewater (approximately {km} km away). "
            f"A travel fee of $0.72/km applies after the first 15 km, and the exact travel cost is confirmed with your quote."
        )
    },
    {
        "question": "Is setup and takedown included?",
        "answer": "Yes. Setup and takedown are always included with your rental. We handle everything so you can focus on your event."
    },
    {
        "question": "How far in advance should I book?",
        "answer": (
            "Summer weekends and school fun days book quickly — we recommend booking 4–8 weeks in advance. "
            "For last-minute needs, check availability by contacting us directly."
        )
    },
    {
        "question": "What happens if it rains on event day?",
        "answer": (
            "Safety is our priority. We monitor weather and communicate with you in advance. "
            "Wet inflatables require a dry surface and no lightning. For borderline weather, we'll work with you to find the best solution."
        )
    },
]

FAQ_SCHOOL = lambda city, km: [
    {
        "question": f"Does Nova Kingdom Rentals do school events in {city}?",
        "answer": (
            f"Yes — school fun days and field day events are a specialty. "
            f"We bring inflatables, lawn games, water slides, and foam party options to schools across the Annapolis Valley including {city}. "
            f"Contact us for a school event quote including travel from Bridgewater ({km} km)."
        )
    },
    {
        "question": "What's included in a school fun day package?",
        "answer": (
            "School packages typically include one or more inflatables, lawn games, and optional add-ons like Kids Foam Party or 360 Photo Booth. "
            "We handle full setup and takedown, and all units meet safety and insurance standards. "
            "Contact us to build a custom school package."
        )
    },
    {
        "question": "Do you provide staffing for school events?",
        "answer": (
            "Nova Kingdom Rentals handles setup and takedown. School staff or designated adult supervisors are required "
            "to be present during inflatable use, as per our rental agreement. We confirm supervision requirements before booking."
        )
    },
    {
        "question": "How early should a school book for a spring or end-of-year fun day?",
        "answer": (
            "Spring and June fun days are our busiest period. Schools in the Valley should book 6–10 weeks in advance to secure their preferred date. "
            "Contact us early — availability fills fast for June."
        )
    },
]

FAQ_WATERSLIDE = lambda city, km: [
    {
        "question": f"Can you deliver water slide rentals to {city}?",
        "answer": (
            f"Yes — Nova Kingdom Rentals delivers inflatable water slides to {city} and surrounding Valley communities. "
            f"We are based in Bridgewater (approximately {km} km). Travel is quoted at $0.72/km after the first 15 km."
        )
    },
    {
        "question": "What water slides are available?",
        "answer": (
            "Available wet-use inflatables include the Crown Island Combo (splash pool combo, great for younger kids), "
            "the Crown Rush 42 (taller slide, better suited to older kids and teens), and the Crown Cascade. "
            "We confirm availability and suitability for your event when you request a quote."
        )
    },
    {
        "question": "What do I need to set up a water slide?",
        "answer": (
            "A level, grassy area with no overhead obstructions, access to a standard garden hose and water connection, "
            "and a nearby power outlet. We confirm setup requirements with you before booking."
        )
    },
    {
        "question": "How old do kids need to be to use a water slide?",
        "answer": (
            "Age and height suitability depends on the unit. The Crown Island Combo splash pool suits younger children. "
            "The Crown Rush 42 is better for older kids and teens. We confirm age and height guidance when you request your rental."
        )
    },
]

FEATURED_INFLATABLES = ["island", "axe", "climber"]
FEATURED_BOOTH = ["360-booth"]
FEATURED_WATER = ["island", "rush42", "cascade"]

# ---------------------------------------------------------------------------
# Fixes for existing Valley pages
# ---------------------------------------------------------------------------
VALLEY_FIXES = {
    "inflatable-rentals-kentville-ns": {
        "intro": (
            "Nova Kingdom Rentals brings inflatables, lawn games, water slides, 360 Photo Booth, Kids Foam Party, "
            "and bundled party packages to Kentville and the Annapolis Valley. "
            "We are based in Bridgewater — setup and takedown included with every rental. "
            + CITY_INTRO["Kentville NS"]
        ),
        "serviceAreaText": valley_sat(90, "Kentville"),
        "bestFor": ["Backyard birthdays", "School fun days", "Community events", "Corporate events", "Family parties"],
        "h1": "Inflatable & Party Rentals in Kentville NS | Annapolis Valley",
        "metaTitle": "Inflatable Rentals Kentville NS | Bouncy Castles & Party Rentals | Nova Kingdom",
        "metaDescription": (
            "Inflatable rentals, bouncy castles, water slides, lawn games, 360 Photo Booth, and Kids Foam Party "
            "delivered to Kentville and the Annapolis Valley. Bridgewater-based. Travel quoted. Setup included."
        ),
    },
    "party-rentals-digby-ns": {
        "intro": (
            "Nova Kingdom Rentals brings party rentals to Digby, Nova Scotia — inflatables, water slides, interactive games, "
            "lawn games, 360 Photo Booth, Kids Foam Party, and bundled packages. "
            "Digby is a Bay of Fundy harbour town and gateway to the Annapolis Valley, "
            "with a strong community event and family celebration culture through the warmer months."
        ),
        "serviceAreaText": (
            "Nova Kingdom Rentals is based in Bridgewater, Nova Scotia. Approximately 155 km from Bridgewater. "
            "Travel quoted — $0.72/km after the first 15 km. "
            "Digby bookings are available for larger events and community celebrations — travel cost confirmed with your quote."
        ),
    },
}

# ---------------------------------------------------------------------------
# New pages to add
# ---------------------------------------------------------------------------
def make_page(slug, title, meta_title, meta_desc, h1, intro, sat, best_for, featured, faq, cta_h, cta_t):
    return {
        "slug": slug,
        "regionType": "local",
        "title": title,
        "metaTitle": meta_title,
        "metaDescription": meta_desc,
        "h1": h1,
        "intro": intro,
        "serviceAreaText": sat,
        "bestFor": best_for,
        "featuredProductIds": featured,
        "faq": faq,
        "ctaHeading": cta_h,
        "ctaText": cta_t,
    }

NEW_PAGES = []

# --- KENTVILLE ---
if "bouncy-castle-rentals-kentville-ns" not in existing_slugs:
    NEW_PAGES.append(make_page(
        slug="bouncy-castle-rentals-kentville-ns",
        title="Bouncy Castle & Inflatable Rentals in Kentville NS",
        meta_title="Bouncy Castle Rentals Kentville NS | Nova Kingdom Rentals",
        meta_desc=(
            "Bouncy castle and inflatable rentals delivered to Kentville and the Annapolis Valley. "
            "Bridgewater-based. Setup included. Travel quoted. Book online or by phone."
        ),
        h1="Bouncy Castle & Inflatable Rentals in Kentville NS",
        intro=(
            "Nova Kingdom Rentals delivers bouncy castles, combo inflatables, water slides, "
            "lawn games, and full party packages to Kentville and the Annapolis Valley. "
            "Based in Bridgewater — setup and takedown always included. "
            + CITY_INTRO["Kentville NS"]
        ),
        sat=valley_sat(90, "Kentville"),
        best_for=["Backyard birthdays", "School fun days", "Community events", "Valley corporate events", "Family parties"],
        featured=FEATURED_INFLATABLES,
        faq=FAQ_VALLEY("Kentville", 90),
        cta_h="Book Bouncy Castle Rentals in Kentville",
        cta_t="Contact Nova Kingdom Rentals for a fast quote delivered to Kentville and the Annapolis Valley.",
    ))

if "bouncy-castle-rentals-new-minas-ns" not in existing_slugs:
    NEW_PAGES.append(make_page(
        slug="bouncy-castle-rentals-new-minas-ns",
        title="Bouncy Castle & Inflatable Rentals in New Minas NS",
        meta_title="Bouncy Castle Rentals New Minas NS | Nova Kingdom Rentals",
        meta_desc=(
            "Bouncy castle and inflatable rentals delivered to New Minas and surrounding Annapolis Valley communities. "
            "Bridgewater-based. Setup included. Travel quoted."
        ),
        h1="Bouncy Castle & Inflatable Rentals in New Minas NS",
        intro=(
            "Nova Kingdom Rentals delivers bouncy castles, combo inflatables, water slides, "
            "lawn games, and party packages to New Minas and the greater Kentville / Coldbrook area. "
            "Based in Bridgewater — setup and takedown always included. "
            + CITY_INTRO["New Minas NS"]
        ),
        sat=valley_sat(95, "New Minas"),
        best_for=["Backyard birthdays", "School fun days", "Community events", "Neighbourhood parties", "Summer parties"],
        featured=FEATURED_INFLATABLES,
        faq=FAQ_VALLEY("New Minas", 95),
        cta_h="Book Bouncy Castle Rentals in New Minas",
        cta_t="Contact Nova Kingdom Rentals for a fast quote for New Minas and the Annapolis Valley.",
    ))

if "bouncy-castle-rentals-berwick-ns" not in existing_slugs:
    NEW_PAGES.append(make_page(
        slug="bouncy-castle-rentals-berwick-ns",
        title="Bouncy Castle & Inflatable Rentals in Berwick NS",
        meta_title="Bouncy Castle Rentals Berwick NS | Nova Kingdom Rentals",
        meta_desc=(
            "Bouncy castle and inflatable rentals delivered to Berwick, Nova Scotia. "
            "Bridgewater-based. Setup included. Travel quoted. Book online."
        ),
        h1="Bouncy Castle & Inflatable Rentals in Berwick NS",
        intro=(
            "Nova Kingdom Rentals delivers bouncy castles, combo inflatables, water slides, and party packages "
            "to Berwick and surrounding Annapolis Valley communities. "
            "Based in Bridgewater — setup and takedown always included. "
            + CITY_INTRO["Berwick NS"]
        ),
        sat=valley_sat(115, "Berwick"),
        best_for=["Backyard birthdays", "School fun days", "Community events", "Apple Capital Festival events"],
        featured=FEATURED_INFLATABLES,
        faq=FAQ_VALLEY("Berwick", 115),
        cta_h="Book Bouncy Castle Rentals in Berwick",
        cta_t="Contact Nova Kingdom Rentals for a fast quote for Berwick and the Annapolis Valley.",
    ))

if "bouncy-castle-rentals-hantsport-ns" not in existing_slugs:
    NEW_PAGES.append(make_page(
        slug="bouncy-castle-rentals-hantsport-ns",
        title="Bouncy Castle & Inflatable Rentals in Hantsport NS",
        meta_title="Bouncy Castle Rentals Hantsport NS | Nova Kingdom Rentals",
        meta_desc=(
            "Bouncy castle and inflatable rentals delivered to Hantsport, Nova Scotia. "
            "Bridgewater-based. Setup included. Travel quoted."
        ),
        h1="Bouncy Castle & Inflatable Rentals in Hantsport NS",
        intro=(
            "Nova Kingdom Rentals delivers bouncy castles, combo inflatables, lawn games, and party packages "
            "to Hantsport and the Windsor / Avon River area. "
            "Based in Bridgewater — setup and takedown always included. "
            + CITY_INTRO["Hantsport NS"]
        ),
        sat=valley_sat(80, "Hantsport"),
        best_for=["Backyard birthdays", "Community events", "School fun days", "Summer parties"],
        featured=FEATURED_INFLATABLES,
        faq=FAQ_VALLEY("Hantsport", 80),
        cta_h="Book Bouncy Castle Rentals in Hantsport",
        cta_t="Contact Nova Kingdom Rentals for a fast quote for Hantsport and the Windsor/Valley area.",
    ))

if "bouncy-castle-rentals-coldbrook-ns" not in existing_slugs:
    NEW_PAGES.append(make_page(
        slug="bouncy-castle-rentals-coldbrook-ns",
        title="Bouncy Castle & Inflatable Rentals in Coldbrook NS",
        meta_title="Bouncy Castle Rentals Coldbrook NS | Nova Kingdom Rentals",
        meta_desc=(
            "Bouncy castle and inflatable rentals delivered to Coldbrook and the Kentville/New Minas corridor. "
            "Bridgewater-based. Setup included. Travel quoted."
        ),
        h1="Bouncy Castle & Inflatable Rentals in Coldbrook NS",
        intro=(
            "Nova Kingdom Rentals delivers bouncy castles, combo inflatables, water slides, and party packages "
            "to Coldbrook and the greater New Minas / Kentville area. "
            "Based in Bridgewater — setup and takedown always included. "
            + CITY_INTRO["Coldbrook NS"]
        ),
        sat=valley_sat(95, "Coldbrook"),
        best_for=["Backyard birthdays", "School fun days", "Community events", "Summer parties"],
        featured=FEATURED_INFLATABLES,
        faq=FAQ_VALLEY("Coldbrook", 95),
        cta_h="Book Bouncy Castle Rentals in Coldbrook",
        cta_t="Contact Nova Kingdom Rentals for a fast quote for Coldbrook and the Annapolis Valley.",
    ))

if "bouncy-castle-rentals-greenwood-ns" not in existing_slugs:
    NEW_PAGES.append(make_page(
        slug="bouncy-castle-rentals-greenwood-ns",
        title="Bouncy Castle & Inflatable Rentals in Greenwood NS",
        meta_title="Bouncy Castle Rentals Greenwood NS | Nova Kingdom Rentals",
        meta_desc=(
            "Bouncy castle and inflatable rentals delivered to Greenwood and Kingston, Nova Scotia. "
            "Bridgewater-based. Setup included. Travel quoted."
        ),
        h1="Bouncy Castle & Inflatable Rentals in Greenwood NS",
        intro=(
            "Nova Kingdom Rentals delivers bouncy castles, combo inflatables, water slides, and party packages "
            "to Greenwood, Kingston, and the southern Annapolis Valley. "
            "Based in Bridgewater — setup and takedown always included. "
            + CITY_INTRO["Greenwood NS"]
        ),
        sat=valley_sat(130, "Greenwood"),
        best_for=["Backyard birthdays", "School fun days", "Military family events", "Community events"],
        featured=FEATURED_INFLATABLES,
        faq=FAQ_VALLEY("Greenwood", 130),
        cta_h="Book Bouncy Castle Rentals in Greenwood",
        cta_t="Contact Nova Kingdom Rentals for a fast quote for Greenwood, Kingston, and the Valley.",
    ))

# --- INFLATABLE RENTALS (Valley) ---
if "inflatable-rentals-windsor-ns" not in existing_slugs:
    NEW_PAGES.append(make_page(
        slug="inflatable-rentals-windsor-ns",
        title="Inflatable Rentals Windsor NS | Bouncy Castles & Party Packages",
        meta_title="Inflatable Rentals Windsor NS | Nova Kingdom Rentals",
        meta_desc=(
            "Inflatable rentals, bouncy castles, water slides, lawn games, and party packages "
            "delivered to Windsor, NS. Bridgewater-based. Setup included. Travel quoted."
        ),
        h1="Inflatable Rentals in Windsor NS",
        intro=(
            "Nova Kingdom Rentals delivers inflatables, bouncy castles, water slides, lawn games, "
            "360 Photo Booth, Kids Foam Party, and full party packages to Windsor, Nova Scotia. "
            "Based in Bridgewater — setup and takedown always included. "
            + CITY_INTRO["Windsor NS"]
        ),
        sat=valley_sat(75, "Windsor"),
        best_for=["Backyard birthdays", "School fun days", "Community events", "Hants County events", "Summer parties"],
        featured=FEATURED_INFLATABLES,
        faq=FAQ_VALLEY("Windsor", 75),
        cta_h="Book Inflatable Rentals in Windsor NS",
        cta_t="Contact Nova Kingdom Rentals for a fast quote for Windsor and the surrounding Hants County area.",
    ))

if "inflatable-rentals-wolfville-ns" not in existing_slugs:
    NEW_PAGES.append(make_page(
        slug="inflatable-rentals-wolfville-ns",
        title="Inflatable Rentals Wolfville NS | Bouncy Castles & Party Packages",
        meta_title="Inflatable Rentals Wolfville NS | Nova Kingdom Rentals",
        meta_desc=(
            "Inflatable rentals, bouncy castles, water slides, lawn games, and party packages "
            "delivered to Wolfville, NS. Bridgewater-based. Setup included. Travel quoted."
        ),
        h1="Inflatable Rentals in Wolfville NS",
        intro=(
            "Nova Kingdom Rentals delivers inflatables, bouncy castles, water slides, lawn games, "
            "360 Photo Booth, Kids Foam Party, and full party packages to Wolfville, Nova Scotia. "
            "Based in Bridgewater — setup and takedown always included. "
            + CITY_INTRO["Wolfville NS"]
        ),
        sat=valley_sat(105, "Wolfville"),
        best_for=["Backyard birthdays", "School events", "Campus & university events", "Summer festivals", "Community gatherings"],
        featured=FEATURED_INFLATABLES,
        faq=FAQ_VALLEY("Wolfville", 105),
        cta_h="Book Inflatable Rentals in Wolfville NS",
        cta_t="Contact Nova Kingdom Rentals for a fast quote for Wolfville and the Annapolis Valley.",
    ))

if "inflatable-rentals-new-minas-ns" not in existing_slugs:
    NEW_PAGES.append(make_page(
        slug="inflatable-rentals-new-minas-ns",
        title="Inflatable Rentals New Minas NS | Bouncy Castles & Party Packages",
        meta_title="Inflatable Rentals New Minas NS | Nova Kingdom Rentals",
        meta_desc=(
            "Inflatable rentals, bouncy castles, water slides, and party packages delivered to New Minas, NS. "
            "Bridgewater-based. Setup included. Travel quoted."
        ),
        h1="Inflatable Rentals in New Minas NS",
        intro=(
            "Nova Kingdom Rentals delivers inflatables, bouncy castles, water slides, lawn games, "
            "360 Photo Booth, Kids Foam Party, and bundled party packages to New Minas and the Kentville corridor. "
            "Based in Bridgewater — setup and takedown always included. "
            + CITY_INTRO["New Minas NS"]
        ),
        sat=valley_sat(95, "New Minas"),
        best_for=["Backyard birthdays", "School fun days", "Community events", "Neighbourhood parties", "Summer parties"],
        featured=FEATURED_INFLATABLES,
        faq=FAQ_VALLEY("New Minas", 95),
        cta_h="Book Inflatable Rentals in New Minas NS",
        cta_t="Contact Nova Kingdom Rentals for a fast quote for New Minas and the Annapolis Valley.",
    ))

if "inflatable-rentals-annapolis-royal-ns" not in existing_slugs:
    NEW_PAGES.append(make_page(
        slug="inflatable-rentals-annapolis-royal-ns",
        title="Inflatable Rentals Annapolis Royal NS | Bouncy Castles & Party Packages",
        meta_title="Inflatable Rentals Annapolis Royal NS | Nova Kingdom Rentals",
        meta_desc=(
            "Inflatable rentals, bouncy castles, water slides, and party packages delivered to Annapolis Royal, NS. "
            "Bridgewater-based. Setup included. Travel quoted."
        ),
        h1="Inflatable Rentals in Annapolis Royal NS",
        intro=(
            "Nova Kingdom Rentals delivers inflatables, bouncy castles, water slides, lawn games, "
            "360 Photo Booth, and party packages to Annapolis Royal and surrounding communities. "
            "Based in Bridgewater — setup and takedown always included. "
            "Annapolis Royal is one of Nova Scotia's oldest communities, with festivals, heritage events, "
            "and family celebrations through the warmer months."
        ),
        sat=valley_sat(110, "Annapolis Royal"),
        best_for=["Backyard birthdays", "Heritage festival events", "School fun days", "Community celebrations"],
        featured=FEATURED_INFLATABLES,
        faq=FAQ_VALLEY("Annapolis Royal", 110),
        cta_h="Book Inflatable Rentals in Annapolis Royal NS",
        cta_t="Contact Nova Kingdom Rentals for a fast quote for Annapolis Royal and surrounding communities.",
    ))

# --- PARTY RENTALS (Valley) ---
if "party-rentals-kentville-ns" not in existing_slugs:
    NEW_PAGES.append(make_page(
        slug="party-rentals-kentville-ns",
        title="Party Rentals in Kentville NS | Inflatables, Lawn Games & More",
        meta_title="Party Rentals Kentville NS | Nova Kingdom Rentals",
        meta_desc=(
            "Party rentals for Kentville and the Annapolis Valley — inflatables, water slides, lawn games, "
            "360 Photo Booth, Kids Foam Party. Bridgewater-based. Setup included. Travel quoted."
        ),
        h1="Party Rentals in Kentville NS",
        intro=(
            "Nova Kingdom Rentals brings full party rental packages to Kentville — inflatables, water slides, "
            "interactive games, lawn games, 360 Photo Booth, Kids Foam Party, and bundled event packages. "
            "Based in Bridgewater — setup and takedown always included. "
            + CITY_INTRO["Kentville NS"]
        ),
        sat=valley_sat(90, "Kentville"),
        best_for=["Backyard birthdays", "School events", "Community events", "Corporate events", "Valley celebrations"],
        featured=FEATURED_INFLATABLES + FEATURED_BOOTH,
        faq=FAQ_VALLEY("Kentville", 90),
        cta_h="Book Party Rentals in Kentville NS",
        cta_t="Contact Nova Kingdom Rentals for a custom party package quote for Kentville and the Annapolis Valley.",
    ))

if "party-rentals-new-minas-ns" not in existing_slugs:
    NEW_PAGES.append(make_page(
        slug="party-rentals-new-minas-ns",
        title="Party Rentals in New Minas NS | Inflatables, Lawn Games & More",
        meta_title="Party Rentals New Minas NS | Nova Kingdom Rentals",
        meta_desc=(
            "Party rentals for New Minas and the Annapolis Valley — inflatables, water slides, lawn games, "
            "360 Photo Booth, Kids Foam Party. Bridgewater-based. Setup included. Travel quoted."
        ),
        h1="Party Rentals in New Minas NS",
        intro=(
            "Nova Kingdom Rentals brings full party rental packages to New Minas — inflatables, water slides, "
            "interactive games, lawn games, 360 Photo Booth, Kids Foam Party, and bundled event packages. "
            "Based in Bridgewater — setup and takedown always included. "
            + CITY_INTRO["New Minas NS"]
        ),
        sat=valley_sat(95, "New Minas"),
        best_for=["Backyard birthdays", "School events", "Community events", "Neighbourhood parties"],
        featured=FEATURED_INFLATABLES + FEATURED_BOOTH,
        faq=FAQ_VALLEY("New Minas", 95),
        cta_h="Book Party Rentals in New Minas NS",
        cta_t="Contact Nova Kingdom Rentals for a custom party package quote for New Minas and the Valley.",
    ))

# --- SCHOOL EVENT RENTALS (Valley) ---
for city, slug_city, km in [
    ("Kentville", "kentville-ns", 90),
    ("Windsor", "windsor-ns", 75),
    ("Wolfville", "wolfville-ns", 105),
    ("New Minas", "new-minas-ns", 95),
]:
    slug = f"school-event-rentals-{slug_city}"
    city_key = f"{city} NS"
    if slug not in existing_slugs:
        NEW_PAGES.append(make_page(
            slug=slug,
            title=f"School Event Rentals {city} NS | Fun Day Inflatables & Games",
            meta_title=f"School Event Rentals {city} NS | Nova Kingdom Rentals",
            meta_desc=(
                f"School fun day and field day inflatable rentals for {city} and the Annapolis Valley. "
                f"Bouncy castles, water slides, foam party, lawn games. Bridgewater-based. Travel quoted."
            ),
            h1=f"School Event Rentals in {city} NS",
            intro=(
                f"Nova Kingdom Rentals provides school fun day and field day rentals for schools in {city} "
                f"and across the Annapolis Valley — bouncy castles, combo inflatables, water slides, lawn games, "
                f"Kids Foam Party, and bundled school event packages. "
                f"Based in Bridgewater — setup and takedown always included. "
                + CITY_INTRO.get(city_key, "")
            ),
            sat=valley_sat(km, city),
            best_for=["School fun days", "Field days", "End-of-year celebrations", "Sports day events", "Community fundraisers"],
            featured=FEATURED_INFLATABLES,
            faq=FAQ_SCHOOL(city, km),
            cta_h=f"Book School Event Rentals in {city} NS",
            cta_t=f"Contact Nova Kingdom Rentals for a custom school event quote for {city} and the Annapolis Valley.",
        ))

# --- WATER SLIDE RENTALS (Valley) ---
for city, slug_city, km in [
    ("Windsor", "windsor-ns", 75),
    ("New Minas", "new-minas-ns", 95),
]:
    slug = f"water-slide-rentals-{slug_city}"
    city_key = f"{city} NS"
    if slug not in existing_slugs:
        NEW_PAGES.append(make_page(
            slug=slug,
            title=f"Water Slide Rentals {city} NS | Inflatable Slides for Summer Events",
            meta_title=f"Water Slide Rentals {city} NS | Nova Kingdom Rentals",
            meta_desc=(
                f"Inflatable water slide rentals delivered to {city}, Nova Scotia. "
                f"Crown Island Combo, Crown Rush 42, Crown Cascade. Bridgewater-based. Travel quoted."
            ),
            h1=f"Water Slide Rentals in {city} NS",
            intro=(
                f"Nova Kingdom Rentals delivers inflatable water slides to {city} for summer birthdays, "
                f"backyard parties, school fun days, and outdoor celebrations. "
                f"Choose from the Crown Island Combo, Crown Rush 42, and Crown Cascade. "
                f"Based in Bridgewater — setup and takedown always included. "
                + CITY_INTRO.get(city_key, "")
            ),
            sat=valley_sat(km, city),
            best_for=["Summer backyard parties", "School water days", "Community events", "Birthday parties", "Hot weather events"],
            featured=FEATURED_WATER,
            faq=FAQ_WATERSLIDE(city, km),
            cta_h=f"Book Water Slide Rentals in {city} NS",
            cta_t=f"Contact Nova Kingdom Rentals for a water slide rental quote for {city} and the Valley.",
        ))

# --- HRM SUB-AREAS ---
for city, slug_city, km, ctx in [
    ("Timberlea", "timberlea-ns", 85, CITY_INTRO["Timberlea NS"]),
    ("Hammonds Plains", "hammonds-plains-ns", 85, CITY_INTRO["Hammonds Plains NS"]),
    ("Tantallon", "tantallon-ns", 90, CITY_INTRO["Tantallon NS"]),
]:
    slug = f"bouncy-castle-rentals-{slug_city}"
    if slug not in existing_slugs:
        NEW_PAGES.append(make_page(
            slug=slug,
            title=f"Bouncy Castle & Inflatable Rentals in {city} NS",
            meta_title=f"Bouncy Castle Rentals {city} NS | Nova Kingdom Rentals",
            meta_desc=(
                f"Bouncy castle and inflatable rentals delivered to {city}, HRM. "
                f"Bridgewater-based. Setup included. Travel quoted."
            ),
            h1=f"Bouncy Castle & Inflatable Rentals in {city} NS",
            intro=(
                f"Nova Kingdom Rentals delivers bouncy castles, combo inflatables, water slides, "
                f"lawn games, and party packages to {city} and the surrounding HRM area. "
                f"Based in Bridgewater — setup and takedown always included. "
                + ctx
            ),
            sat=standard_sat(km),
            best_for=["Backyard birthdays", "School fun days", "Community events", "Summer parties"],
            featured=FEATURED_INFLATABLES,
            faq=[
                {
                    "question": f"Does Nova Kingdom Rentals deliver to {city}?",
                    "answer": (
                        f"Yes — we deliver to {city} and the surrounding HRM area. "
                        f"We are based in Bridgewater (approximately {km} km). "
                        f"Travel is quoted at $0.72/km after the first 15 km. Final cost confirmed with your quote."
                    )
                },
                {
                    "question": "Is setup and takedown included?",
                    "answer": "Yes. Setup and takedown are always included. We handle everything so you can focus on your event."
                },
                {
                    "question": "How far in advance should I book?",
                    "answer": "Summer weekends and school fun days book quickly — we recommend booking 4–8 weeks ahead. Contact us to check availability."
                },
                {
                    "question": "What happens if it rains?",
                    "answer": "We monitor weather and communicate with you in advance. Safety is our priority — we'll work with you to find the best solution for borderline weather."
                },
            ],
            cta_h=f"Book Bouncy Castle Rentals in {city} NS",
            cta_t=f"Contact Nova Kingdom Rentals for a fast quote for {city} and surrounding HRM communities.",
        ))

# --- SOUTH SHORE MICRO AREAS ---
if "inflatable-rentals-hubbards-ns" not in existing_slugs:
    NEW_PAGES.append(make_page(
        slug="inflatable-rentals-hubbards-ns",
        title="Inflatable Rentals Hubbards NS | South Shore Party Rentals",
        meta_title="Inflatable Rentals Hubbards NS | Nova Kingdom Rentals",
        meta_desc=(
            "Inflatable rentals, bouncy castles, lawn games, and party packages delivered to Hubbards, NS. "
            "Bridgewater-based. Setup included. Travel quoted."
        ),
        h1="Inflatable Rentals in Hubbards NS",
        intro=(
            "Nova Kingdom Rentals delivers inflatables, bouncy castles, water slides, lawn games, "
            "360 Photo Booth, and party packages to Hubbards and the St. Margarets Bay corridor. "
            "Based in Bridgewater — setup and takedown always included. "
            + CITY_INTRO["Hubbards NS"]
        ),
        sat=standard_sat(65),
        best_for=["Summer backyard parties", "Community events", "School events", "Birthday parties", "Seasonal celebrations"],
        featured=FEATURED_INFLATABLES,
        faq=[
            {
                "question": "Does Nova Kingdom Rentals deliver to Hubbards?",
                "answer": (
                    "Yes — Hubbards is about 65 km from Bridgewater along Highway 103. "
                    "Travel is quoted at $0.72/km after the first 15 km. Final cost confirmed with your quote."
                )
            },
            {
                "question": "Is setup and takedown included?",
                "answer": "Yes. Setup and takedown are always included with every rental."
            },
            {
                "question": "Do you rent water slides for summer events near Hubbards?",
                "answer": "Yes — water slide rentals (Crown Island Combo, Crown Rush 42, Crown Cascade) are available for summer events in Hubbards and the St. Margarets Bay area. A water source and level grassy area are required."
            },
            {
                "question": "How far in advance should I book for a summer event?",
                "answer": "Summer weekends fill quickly — booking 4–8 weeks in advance is recommended. Contact us to check availability."
            },
        ],
        cta_h="Book Inflatable Rentals in Hubbards NS",
        cta_t="Contact Nova Kingdom Rentals for a fast quote for Hubbards and the South Shore.",
    ))

if "inflatable-rentals-new-ross-ns" not in existing_slugs:
    NEW_PAGES.append(make_page(
        slug="inflatable-rentals-new-ross-ns",
        title="Inflatable Rentals New Ross NS | South Shore Party Rentals",
        meta_title="Inflatable Rentals New Ross NS | Nova Kingdom Rentals",
        meta_desc=(
            "Inflatable rentals, bouncy castles, and lawn games delivered to New Ross, NS. "
            "Bridgewater-based. Setup included. Travel quoted."
        ),
        h1="Inflatable Rentals in New Ross NS",
        intro=(
            "Nova Kingdom Rentals delivers inflatables, bouncy castles, lawn games, and party packages "
            "to New Ross and surrounding inland communities. "
            "Based in Bridgewater — setup and takedown always included. "
            + CITY_INTRO["New Ross NS"]
        ),
        sat=standard_sat(35),
        best_for=["Backyard birthdays", "School fun days", "Community events", "Rural family celebrations"],
        featured=FEATURED_INFLATABLES,
        faq=[
            {
                "question": "Does Nova Kingdom Rentals deliver to New Ross?",
                "answer": (
                    "Yes — New Ross is approximately 35 km from Bridgewater. "
                    "Travel is quoted at $0.72/km after the first 15 km. Final cost confirmed with your quote."
                )
            },
            {
                "question": "Is setup and takedown included?",
                "answer": "Yes. Setup and takedown are always included with every rental."
            },
            {
                "question": "What space do I need for a bouncy castle?",
                "answer": "Bouncy castles require a level, clear outdoor area (or large indoor space with sufficient ceiling height). We confirm setup suitability when you request a quote."
            },
            {
                "question": "How far in advance should I book?",
                "answer": "Summer weekends book quickly — we recommend booking 4–8 weeks ahead for peak season."
            },
        ],
        cta_h="Book Inflatable Rentals in New Ross NS",
        cta_t="Contact Nova Kingdom Rentals for a fast quote for New Ross and surrounding communities.",
    ))

# ---------------------------------------------------------------------------
# Apply fixes to existing pages
# ---------------------------------------------------------------------------
UPDATED = []
for i, p in enumerate(pages):
    slug = p["slug"]
    if slug in VALLEY_FIXES:
        fix = VALLEY_FIXES[slug]
        for key, val in fix.items():
            pages[i][key] = val
        UPDATED.append(slug)

print(f"Fixed {len(UPDATED)} existing pages: {', '.join(UPDATED)}")
print(f"Adding {len(NEW_PAGES)} new pages")

# Filter out any that already exist (safety check)
new_slugs = {p["slug"] for p in NEW_PAGES}
already = new_slugs & existing_slugs
if already:
    print(f"WARNING: Skipping {len(already)} already-existing slugs: {already}")
    NEW_PAGES = [p for p in NEW_PAGES if p["slug"] not in existing_slugs]

pages.extend(NEW_PAGES)
print(f"Total pages: {len(pages)}")

# Write back
(ROOT / "data/seoPages.json").write_text(
    json.dumps(pages, ensure_ascii=False, indent=2),
    encoding="utf-8"
)
print("Updated data/seoPages.json")

# ---------------------------------------------------------------------------
# Update sitemap.xml — add new slugs
# ---------------------------------------------------------------------------
sitemap_path = ROOT / "sitemap.xml"
NS = "http://www.sitemaps.org/schemas/sitemap/0.9"
ET.register_namespace("", NS)
tree = ET.parse(sitemap_path)
root_el = tree.getroot()

existing_locs = set()
for url_el in root_el.findall(f"{{{NS}}}url"):
    loc = url_el.find(f"{{{NS}}}loc")
    if loc is not None:
        existing_locs.add(loc.text)

added_to_sitemap = 0
for p in NEW_PAGES:
    url = f"{BASE_URL}/{p['slug']}"
    if url not in existing_locs:
        url_el = ET.SubElement(root_el, f"{{{NS}}}url")
        ET.SubElement(url_el, f"{{{NS}}}loc").text = url
        ET.SubElement(url_el, f"{{{NS}}}changefreq").text = "monthly"
        ET.SubElement(url_el, f"{{{NS}}}priority").text = "0.8"
        added_to_sitemap += 1

print(f"Added {added_to_sitemap} URLs to sitemap")

total_urls = len(root_el.findall(f"{{{NS}}}url"))
ET.indent(tree, space="  ")
tree.write(sitemap_path, encoding="unicode", xml_declaration=True)
content = sitemap_path.read_text(encoding="utf-8")
sitemap_path.write_text(
    '<?xml version="1.0" encoding="UTF-8"?>\n' + content.split('\n', 1)[1],
    encoding="utf-8"
)
print(f"Sitemap updated — {total_urls} total URLs")
