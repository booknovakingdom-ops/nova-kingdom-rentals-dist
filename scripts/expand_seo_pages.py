#!/usr/bin/env python3
"""Generate expanded city/service SEO pages for Nova Kingdom Rentals.

Adds ~80 new pages covering every major Nova Scotia and New Brunswick city
across inflatables, 360 Photo Booth, Kids Foam Party, water slides, and lawn games.
Updates both data/seoPages.json and sitemap.xml.
"""
from __future__ import annotations
import json
import xml.etree.ElementTree as ET
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE_URL = "https://novakingdomrentals.com"
TODAY = date.today().isoformat()

# ---------------------------------------------------------------------------
# City definitions — (display_name, slug_suffix, province_abbr, province_full,
#                     distance_note, is_cape_breton, is_nb)
# ---------------------------------------------------------------------------
NS_LOCAL = [  # South Shore / within easy reach of Bridgewater
    ("Bridgewater", "bridgewater-ns", "NS", "Nova Scotia", "Based in Bridgewater.", False, False),
    ("Lunenburg", "lunenburg-ns", "NS", "Nova Scotia", "Approximately 15 km from Bridgewater.", False, False),
    ("Mahone Bay", "mahone-bay-ns", "NS", "Nova Scotia", "Approximately 20 km from Bridgewater.", False, False),
    ("Chester", "chester-ns", "NS", "Nova Scotia", "Approximately 30 km from Bridgewater.", False, False),
    ("Liverpool", "liverpool-ns", "NS", "Nova Scotia", "Approximately 65 km from Bridgewater.", False, False),
    ("Shelburne", "shelburne-ns", "NS", "Nova Scotia", "Approximately 115 km from Bridgewater. Travel quoted.", False, False),
    ("Yarmouth", "yarmouth-ns", "NS", "Nova Scotia", "Approximately 160 km from Bridgewater. Travel quoted.", False, False),
    ("Digby", "digby-ns", "NS", "Nova Scotia", "Approximately 95 km from Bridgewater. Travel quoted.", False, False),
    ("Windsor", "windsor-ns", "NS", "Nova Scotia", "Approximately 75 km from Bridgewater. Travel quoted.", False, False),
    ("Kentville", "kentville-ns", "NS", "Nova Scotia", "Approximately 90 km from Bridgewater. Travel quoted.", False, False),
    ("Wolfville", "wolfville-ns", "NS", "Nova Scotia", "Approximately 105 km from Bridgewater. Travel quoted.", False, False),
    ("Annapolis Royal", "annapolis-royal-ns", "NS", "Nova Scotia", "Approximately 110 km from Bridgewater. Travel quoted.", False, False),
    ("Middleton", "middleton-ns", "NS", "Nova Scotia", "Approximately 100 km from Bridgewater. Travel quoted.", False, False),
    ("Bridgetown", "bridgetown-ns", "NS", "Nova Scotia", "Approximately 105 km from Bridgewater. Travel quoted.", False, False),
    ("Halifax", "halifax-ns", "NS", "Nova Scotia", "Approximately 100 km from Bridgewater. Travel quoted.", False, False),
    ("Dartmouth", "dartmouth-ns", "NS", "Nova Scotia", "Approximately 105 km from Bridgewater. Travel quoted.", False, False),
    ("Bedford", "bedford-ns", "NS", "Nova Scotia", "Approximately 110 km from Bridgewater. Travel quoted.", False, False),
    ("Lower Sackville", "lower-sackville-ns", "NS", "Nova Scotia", "Approximately 115 km from Bridgewater. Travel quoted.", False, False),
    ("Cole Harbour", "cole-harbour-ns", "NS", "Nova Scotia", "Approximately 110 km from Bridgewater. Travel quoted.", False, False),
    ("Fall River", "fall-river-ns", "NS", "Nova Scotia", "Approximately 115 km from Bridgewater. Travel quoted.", False, False),
    ("Truro", "truro-ns", "NS", "Nova Scotia", "Approximately 150 km from Bridgewater. Travel quoted.", False, False),
    ("New Glasgow", "new-glasgow-ns", "NS", "Nova Scotia", "Approximately 175 km from Bridgewater. Travel quoted.", False, False),
    ("Stellarton", "stellarton-ns", "NS", "Nova Scotia", "Approximately 175 km from Bridgewater. Travel quoted.", False, False),
    ("Pictou", "pictou-ns", "NS", "Nova Scotia", "Approximately 185 km from Bridgewater. Travel quoted.", False, False),
    ("Antigonish", "antigonish-ns", "NS", "Nova Scotia", "Approximately 200 km from Bridgewater. Travel quoted.", False, False),
    ("Amherst", "amherst-ns", "NS", "Nova Scotia", "Approximately 220 km from Bridgewater. Travel quoted.", False, False),
    ("Port Hawkesbury", "port-hawkesbury-ns", "NS", "Nova Scotia", "Approximately 225 km from Bridgewater. Travel quoted by quote.", True, False),
    ("Baddeck", "baddeck-ns", "NS", "Nova Scotia", "Approximately 265 km from Bridgewater. Travel and availability by quote.", True, False),
    ("North Sydney", "north-sydney-ns", "NS", "Nova Scotia", "Approximately 285 km from Bridgewater. Travel and availability by quote.", True, False),
    ("Glace Bay", "glace-bay-ns", "NS", "Nova Scotia", "Approximately 300 km from Bridgewater. Travel and availability by quote.", True, False),
    ("New Waterford", "new-waterford-ns", "NS", "Nova Scotia", "Approximately 295 km from Bridgewater. Travel and availability by quote.", True, False),
    ("Inverness", "inverness-ns", "NS", "Nova Scotia", "Approximately 265 km from Bridgewater. Travel and availability by quote.", True, False),
]

NB_CITIES = [
    ("Sackville", "sackville-nb", "NB", "New Brunswick", "Approximately 230 km from Bridgewater. Selected bookings by quote.", False, True),
    ("Moncton", "moncton-nb", "NB", "New Brunswick", "Approximately 250 km from Bridgewater. Selected bookings by quote.", False, True),
    ("Amherst area", "amherst-area-nb", "NB", "New Brunswick", "NS/NB border region. Selected bookings by quote.", False, True),
    ("Fredericton", "fredericton-nb", "NB", "New Brunswick", "Approximately 320 km from Bridgewater. Selected bookings by quote.", False, True),
    ("Sussex", "sussex-nb", "NB", "New Brunswick", "Approximately 290 km from Bridgewater. Selected bookings by quote.", False, True),
    ("Saint John", "saint-john-nb", "NB", "New Brunswick", "Approximately 350 km from Bridgewater. Selected bookings by quote.", False, True),
]

ALL_CITIES = NS_LOCAL + NB_CITIES

# ---------------------------------------------------------------------------
# Page templates
# ---------------------------------------------------------------------------

def travel_note(city: str, dist_note: str, is_nb: bool, is_cb: bool) -> str:
    if is_nb:
        return f"Nova Kingdom Rentals is based in Bridgewater, Nova Scotia. {dist_note} Selected New Brunswick bookings are available for larger events and special occasions — contact us to confirm availability and travel cost."
    if is_cb:
        return f"Nova Kingdom Rentals is based in Bridgewater, Nova Scotia. {dist_note} Cape Breton bookings are available for larger events and special occasions — contact us to confirm availability and travel cost."
    return f"Nova Kingdom Rentals is based in Bridgewater, Nova Scotia. {dist_note} Travel fee applies after the first 15 km from Bridgewater ($0.72/km). Final travel cost confirmed with your quote."


def inflatable_page(city: str, slug_suffix: str, province: str, prov_full: str, dist_note: str, is_cb: bool, is_nb: bool) -> dict:
    slug_prefix = "bouncy-castle-rentals" if not is_nb else "inflatable-rentals"
    slug = f"{slug_prefix}-{slug_suffix}"
    area = "New Brunswick" if is_nb else prov_full
    qualifier = " (selected larger events by quote)" if (is_cb or is_nb) else ""
    return {
        "slug": slug,
        "regionType": "local",
        "title": f"Bouncy Castle & Inflatable Rentals in {city} {province}",
        "metaTitle": f"Bouncy Castle Rentals {city} {province} | Nova Kingdom Rentals",
        "metaDescription": f"Bouncy castle and inflatable rentals for birthdays, school events, and community celebrations in {city}, {prov_full}. Water slides, lawn games, interactive games. Setup included. Nova Kingdom Rentals.",
        "h1": f"Bouncy Castle & Inflatable Rentals in {city} {province}",
        "intro": f"Nova Kingdom Rentals brings bouncy castle rentals, inflatable rentals, water slides, interactive games, lawn games, and party packages to {city} and surrounding {area}{qualifier}. We are based in Bridgewater — setup and takedown included with every rental.",
        "serviceAreaText": travel_note(city, dist_note, is_nb, is_cb),
        "bestFor": ["Backyard birthdays", "School events", "Community events", "Summer parties"],
        "featuredProductIds": ["crown-island-combo", "crown-rush-42", "crown-axe-challenge"],
        "faq": [
            {
                "question": f"Do you deliver to {city}?",
                "answer": f"Nova Kingdom Rentals delivers to {city}, {prov_full}. {dist_note} Travel cost, setup suitability, and availability are confirmed before booking."
            },
            {
                "question": "How far in advance should I book?",
                "answer": "We recommend booking 1–3 weeks in advance for summer and weekend events. Send your date and details and we will confirm availability."
            },
            {
                "question": "What is included in the rental?",
                "answer": "Delivery, setup, and takedown are included. The blower stays powered during use. Travel fees apply depending on distance from Bridgewater."
            },
            {
                "question": "Are bookings instantly confirmed?",
                "answer": "No. Online requests are not instant confirmations. Booking is confirmed only after Nova Kingdom Rentals confirms availability, travel cost, setup suitability, and deposit details."
            },
        ],
        "ctaHeading": f"Check availability for your {city} event",
        "ctaText": f"Send your event date, address in {city}, and details. We'll confirm availability, travel cost, and deposit requirements.",
    }


def booth_page(city: str, slug_suffix: str, province: str, prov_full: str, dist_note: str, is_cb: bool, is_nb: bool) -> dict:
    slug = f"photo-booth-rental-{slug_suffix}"
    return {
        "slug": slug,
        "regionType": "local",
        "title": f"360 Photo Booth Rental in {city} {province}",
        "metaTitle": f"360 Photo Booth Rental {city} {province} | Nova Kingdom Rentals",
        "metaDescription": f"360 Photo Booth rental for weddings, graduations, birthdays, and corporate events in {city}, {prov_full}. Standalone from $250/hr or add-on from $175/hr. Nova Kingdom Rentals.",
        "h1": f"360 Photo Booth Rental in {city} {province}",
        "intro": f"Nova Kingdom Rentals provides 360 Photo Booth rentals for weddings, graduations, birthdays, school events, corporate events, and community celebrations in {city}, {prov_full}. Guests step onto the platform while the rotating camera arm captures 360° video with RGB lighting.",
        "serviceAreaText": travel_note(city, dist_note, is_nb, is_cb),
        "bestFor": ["Weddings", "Graduations", "Birthday Parties", "Corporate Events", "School Events"],
        "featuredProductIds": ["360-video-booth"],
        "faq": [
            {
                "question": f"Do you offer 360 Photo Booth rental in {city}?",
                "answer": f"Yes. Nova Kingdom Rentals provides 360 Photo Booth rentals in {city}, {prov_full}. {dist_note} Contact us to confirm availability and travel cost."
            },
            {
                "question": "What is the price for a 360 Photo Booth rental?",
                "answer": "Standalone: $250 for 1 hour, additional hours at $125/hr. Add-on with any inflatable or package: $175 for 1 hour, additional hours at $100/hr. Setup and takedown included."
            },
            {
                "question": "Is the 360 Photo Booth suitable for outdoor events?",
                "answer": "Indoor setup is preferred. Outdoor setup is available on flat, dry surfaces and weather permitting. Power access (standard household outlet) is required."
            },
            {
                "question": "How does the 360 Photo Booth work?",
                "answer": "Guests step onto the circular platform while the rotating camera arm captures a slow-motion 360° video enhanced with RGB ring lighting. Videos can be instantly shared digitally."
            },
        ],
        "ctaHeading": f"Book your 360 Photo Booth in {city}",
        "ctaText": f"Send your event date, location in {city}, and details. We'll confirm availability, travel cost, and next steps.",
    }


def foam_page(city: str, slug_suffix: str, province: str, prov_full: str, dist_note: str, is_cb: bool, is_nb: bool) -> dict:
    slug = f"kids-foam-party-{slug_suffix}"
    return {
        "slug": slug,
        "regionType": "local",
        "title": f"Kids Foam Party Rental in {city} {province}",
        "metaTitle": f"Kids Foam Party Rental {city} {province} | Nova Kingdom Rentals",
        "metaDescription": f"Kids Foam Party rental for birthdays, school fun days, daycares, summer camps, and family events in {city}, {prov_full}. Hourly pricing by guest count. From $200/hr add-on. Nova Kingdom Rentals.",
        "h1": f"Kids Foam Party Rental in {city} {province}",
        "intro": f"Nova Kingdom Rentals brings Kids Foam Party rentals to {city}, {prov_full}. Kid-safe, non-toxic foam blasted into a fun foam zone — perfect for birthdays, school fun days, daycare events, summer camps, church events, and family-friendly celebrations. Priced by guest count.",
        "serviceAreaText": travel_note(city, dist_note, is_nb, is_cb),
        "bestFor": ["Kids Birthday Parties", "School Fun Days", "Daycare Events", "Summer Camps", "Church Kids Events"],
        "featuredProductIds": ["kids-foam-party"],
        "faq": [
            {
                "question": f"Do you offer Kids Foam Party rentals in {city}?",
                "answer": f"Yes. Nova Kingdom Rentals provides Kids Foam Party rentals in {city}, {prov_full}. {dist_note} Contact us to confirm availability and travel cost."
            },
            {
                "question": "What does Kids Foam Party cost?",
                "answer": "Standalone: Up to 30 kids $349/hr, 31–80 kids $599/hr, 80+ kids from $800/hr. Add-on with any inflatable: Up to 30 kids $200/hr, 31–80 kids $350/hr, 80+ kids from $650/hr. Delivery additional."
            },
            {
                "question": "Is Kids Foam Party suitable for all ages?",
                "answer": "Kids Foam Party is designed for children ages 3–14. It is not available for adult events or events where alcohol is being served. Adult (19+) supervision required at all times."
            },
            {
                "question": "What is required for setup?",
                "answer": "Outdoor setup only on a flat grassy area. Water source and hose access required. Power access (standard household outlet) required. Safe drainage area required."
            },
        ],
        "ctaHeading": f"Book Kids Foam Party in {city}",
        "ctaText": f"Send your event date, address in {city}, number of kids, and event type. We'll confirm availability, travel cost, and hourly pricing tier.",
    }


def water_slide_page(city: str, slug_suffix: str, province: str, prov_full: str, dist_note: str, is_cb: bool, is_nb: bool) -> dict:
    slug = f"water-slide-rentals-{slug_suffix}"
    return {
        "slug": slug,
        "regionType": "local",
        "title": f"Water Slide Rentals in {city} {province}",
        "metaTitle": f"Water Slide Rentals {city} {province} | Nova Kingdom Rentals",
        "metaDescription": f"Inflatable water slide rentals for summer birthdays and outdoor events in {city}, {prov_full}. Crown Island Combo, Crown Rush 42, Crown Cascade. Setup included. Nova Kingdom Rentals.",
        "h1": f"Water Slide Rentals in {city} {province}",
        "intro": f"Nova Kingdom Rentals provides inflatable water slide rentals for summer birthdays, backyard parties, school events, and outdoor celebrations in {city}, {prov_full}. Wet-use inflatables include the Crown Island Combo, Crown Rush 42, and Crown Cascade.",
        "serviceAreaText": travel_note(city, dist_note, is_nb, is_cb),
        "bestFor": ["Summer birthdays", "Backyard parties", "School events", "Hot-weather outdoor events"],
        "featuredProductIds": ["crown-island-combo", "crown-rush-42", "crown-cascade"],
        "faq": [
            {
                "question": f"Do you rent water slides in {city}?",
                "answer": f"Yes. Nova Kingdom Rentals delivers water slide inflatables to {city}, {prov_full}. {dist_note} Contact us to confirm availability and travel cost."
            },
            {
                "question": "Do I need to supply water?",
                "answer": "Yes. You must provide a water source, hose access, and a safe drainage area. Water should be turned off at least 1 hour before scheduled pickup."
            },
            {
                "question": "What surface is needed for a water slide?",
                "answer": "A level, grassy area is preferred. The setup area must be clear, safe, accessible, and properly sized. Power access is required to run the blower."
            },
        ],
        "ctaHeading": f"Book a water slide in {city}",
        "ctaText": f"Send your event date, {city} address, yard size, and water/power access details so we can confirm availability and quote travel cost.",
    }


def lawn_games_page(city: str, slug_suffix: str, province: str, prov_full: str, dist_note: str, is_cb: bool, is_nb: bool) -> dict:
    slug = f"lawn-game-rentals-{slug_suffix}"
    return {
        "slug": slug,
        "regionType": "local",
        "title": f"Lawn Game Rentals in {city} {province}",
        "metaTitle": f"Lawn Game Rentals {city} {province} | Nova Kingdom Rentals",
        "metaDescription": f"Lawn game rentals for backyard parties, school events, and community events in {city}, {prov_full}. Cornhole, Giant Jenga, Giant Connect 4, Ladder Toss, and 9 more. From $175. Nova Kingdom Rentals.",
        "h1": f"Lawn Game Rentals in {city} {province}",
        "intro": f"Nova Kingdom Rentals provides lawn game rentals for backyard birthdays, school events, festivals, and community gatherings in {city}, {prov_full}. Choose from 12 games including Cornhole, Giant Jenga, Giant Connect 4, Ladder Toss, Bocce Ball, Spikeball, and more.",
        "serviceAreaText": travel_note(city, dist_note, is_nb, is_cb),
        "bestFor": ["Backyard parties", "School events", "Community events", "Festivals"],
        "featuredProductIds": ["crown-island-combo"],
        "faq": [
            {
                "question": f"Do you rent lawn games in {city}?",
                "answer": f"Yes. Nova Kingdom Rentals delivers lawn game packages to {city}, {prov_full}. {dist_note} Contact us to confirm availability and travel cost."
            },
            {
                "question": "How much do lawn game packages cost?",
                "answer": "5 Lawn Games: $175. 10 Lawn Games: $250. All 12 Lawn Games (includes Cornhole): $280. Cornhole add-on available with 5 or 10 game selections for +$25."
            },
            {
                "question": "Can I add lawn games to an inflatable rental?",
                "answer": "Yes. Lawn games can be added to any inflatable or package rental depending on availability. Ask about combination pricing when you submit your request."
            },
        ],
        "ctaHeading": f"Book lawn games in {city}",
        "ctaText": f"Send your event date, address in {city}, and the number of guests. We'll confirm availability, travel cost, and game selection.",
    }


def party_rentals_page(city: str, slug_suffix: str, province: str, prov_full: str, dist_note: str, is_cb: bool, is_nb: bool) -> dict:
    slug = f"party-rentals-{slug_suffix}"
    return {
        "slug": slug,
        "regionType": "local",
        "title": f"Party Rentals in {city} {province}",
        "metaTitle": f"Party Rentals {city} {province} | Nova Kingdom Rentals",
        "metaDescription": f"Party rentals for birthdays, school events, and community celebrations in {city}, {prov_full}. Inflatables, water slides, lawn games, 360 Photo Booth, foam party. Nova Kingdom Rentals.",
        "h1": f"Party Rentals in {city} {province}",
        "intro": f"Nova Kingdom Rentals brings party rentals to {city}, {prov_full} — inflatables, water slides, interactive games, lawn games, 360 Photo Booth, Kids Foam Party, and bundled packages. Everything you need for an unforgettable birthday, school event, or community celebration.",
        "serviceAreaText": travel_note(city, dist_note, is_nb, is_cb),
        "bestFor": ["Birthday parties", "School events", "Community events", "Summer parties"],
        "featuredProductIds": ["crown-island-combo", "crown-axe-challenge", "360-video-booth"],
        "faq": [
            {
                "question": f"What party rental options are available in {city}?",
                "answer": f"Nova Kingdom Rentals offers bouncy castles, water slides, interactive games (axe throw, football darts, carnival games), lawn games, 360 Photo Booth, Kids Foam Party, and bundled packages for events in {city}, {prov_full}."
            },
            {
                "question": "Do you offer packages?",
                "answer": "Yes. Bundled party packages start from $310 and combine inflatables, games, and activities with built-in savings. Visit our packages page to see all options."
            },
            {
                "question": "How do I book?",
                "answer": "Send your event date, address, event type, product or package choice, number of guests, and setup details through the contact form. We'll confirm availability, travel cost, and deposit requirements."
            },
        ],
        "ctaHeading": f"Plan your {city} party with Nova Kingdom Rentals",
        "ctaText": f"Send your event date and {city} address. We'll confirm availability, recommend the best rentals for your crowd, and quote travel cost.",
    }


# ---------------------------------------------------------------------------
# Build the new pages
# ---------------------------------------------------------------------------

existing_data = json.loads((ROOT / "data/seoPages.json").read_text(encoding="utf-8"))
existing_slugs = {p["slug"] for p in existing_data}

new_pages: list[dict] = []

# --- City-specific inflatable pages ---
# Cities that already have bouncy-castle or inflatable pages
ALREADY_INFLATABLE = {
    "bridgewater-ns", "lunenburg-ns", "mahone-bay-ns", "chester-ns",
    "liverpool-ns", "shelburne-ns", "yarmouth-ns", "digby-ns",
    "kentville-ns", "halifax-ns", "dartmouth-ns", "truro-ns", "sydney-ns",
}

for city, slug_suffix, prov, prov_full, dist, is_cb, is_nb in ALL_CITIES:
    # Inflatable page — skip if already exists
    inf_slug = f"{'bouncy-castle' if not is_nb else 'inflatable'}-rentals-{slug_suffix}"
    if inf_slug not in existing_slugs and slug_suffix not in ALREADY_INFLATABLE:
        new_pages.append(inflatable_page(city, slug_suffix, prov, prov_full, dist, is_cb, is_nb))

# --- 360 Photo Booth city pages ---
BOOTH_CITIES = [
    ("Truro", "truro-ns", "NS", "Nova Scotia", "Approximately 150 km from Bridgewater. Travel quoted.", False, False),
    ("Dartmouth", "dartmouth-ns", "NS", "Nova Scotia", "Approximately 105 km from Bridgewater. Travel quoted.", False, False),
    ("Sydney", "sydney-ns", "NS", "Nova Scotia", "Approximately 295 km from Bridgewater. Travel by quote.", True, False),
    ("Kentville", "kentville-ns", "NS", "Nova Scotia", "Approximately 90 km from Bridgewater. Travel quoted.", False, False),
    ("Antigonish", "antigonish-ns", "NS", "Nova Scotia", "Approximately 200 km from Bridgewater. Travel quoted.", False, False),
    ("New Glasgow", "new-glasgow-ns", "NS", "Nova Scotia", "Approximately 175 km from Bridgewater. Travel quoted.", False, False),
    ("Wolfville", "wolfville-ns", "NS", "Nova Scotia", "Approximately 105 km from Bridgewater. Travel quoted.", False, False),
    ("Amherst", "amherst-ns", "NS", "Nova Scotia", "Approximately 220 km from Bridgewater. Travel quoted.", False, False),
    ("Windsor", "windsor-ns", "NS", "Nova Scotia", "Approximately 75 km from Bridgewater. Travel quoted.", False, False),
    ("Fredericton", "fredericton-nb", "NB", "New Brunswick", "Approximately 320 km from Bridgewater. Selected bookings by quote.", False, True),
    ("Moncton", "moncton-nb", "NB", "New Brunswick", "Approximately 250 km from Bridgewater. Selected bookings by quote.", False, True),
    ("Lunenburg", "lunenburg-ns", "NS", "Nova Scotia", "Approximately 15 km from Bridgewater.", False, False),
]
for city, slug_suffix, prov, prov_full, dist, is_cb, is_nb in BOOTH_CITIES:
    slug = f"photo-booth-rental-{slug_suffix}"
    if slug not in existing_slugs:
        new_pages.append(booth_page(city, slug_suffix, prov, prov_full, dist, is_cb, is_nb))

# --- Kids Foam Party city pages ---
FOAM_CITIES = [
    ("Bridgewater", "bridgewater-ns", "NS", "Nova Scotia", "Based in Bridgewater.", False, False),
    ("Halifax", "halifax-ns", "NS", "Nova Scotia", "Approximately 100 km from Bridgewater. Travel quoted.", False, False),
    ("Dartmouth", "dartmouth-ns", "NS", "Nova Scotia", "Approximately 105 km from Bridgewater. Travel quoted.", False, False),
    ("Truro", "truro-ns", "NS", "Nova Scotia", "Approximately 150 km from Bridgewater. Travel quoted.", False, False),
    ("Kentville", "kentville-ns", "NS", "Nova Scotia", "Approximately 90 km from Bridgewater. Travel quoted.", False, False),
    ("Lunenburg", "lunenburg-ns", "NS", "Nova Scotia", "Approximately 15 km from Bridgewater.", False, False),
    ("New Glasgow", "new-glasgow-ns", "NS", "Nova Scotia", "Approximately 175 km from Bridgewater. Travel quoted.", False, False),
    ("Yarmouth", "yarmouth-ns", "NS", "Nova Scotia", "Approximately 160 km from Bridgewater. Travel quoted.", False, False),
    ("Wolfville", "wolfville-ns", "NS", "Nova Scotia", "Approximately 105 km from Bridgewater. Travel quoted.", False, False),
    ("Antigonish", "antigonish-ns", "NS", "Nova Scotia", "Approximately 200 km from Bridgewater. Travel quoted.", False, False),
    ("Windsor", "windsor-ns", "NS", "Nova Scotia", "Approximately 75 km from Bridgewater. Travel quoted.", False, False),
    ("Amherst", "amherst-ns", "NS", "Nova Scotia", "Approximately 220 km from Bridgewater. Travel quoted.", False, False),
    ("Moncton", "moncton-nb", "NB", "New Brunswick", "Approximately 250 km from Bridgewater. Selected bookings by quote.", False, True),
]
for city, slug_suffix, prov, prov_full, dist, is_cb, is_nb in FOAM_CITIES:
    slug = f"kids-foam-party-{slug_suffix}"
    if slug not in existing_slugs:
        new_pages.append(foam_page(city, slug_suffix, prov, prov_full, dist, is_cb, is_nb))

# --- Water slide city pages ---
WATER_CITIES = [
    ("Bridgewater", "bridgewater-ns", "NS", "Nova Scotia", "Based in Bridgewater.", False, False),
    ("Halifax", "halifax-ns", "NS", "Nova Scotia", "Approximately 100 km from Bridgewater. Travel quoted.", False, False),
    ("Dartmouth", "dartmouth-ns", "NS", "Nova Scotia", "Approximately 105 km from Bridgewater. Travel quoted.", False, False),
    ("Lunenburg", "lunenburg-ns", "NS", "Nova Scotia", "Approximately 15 km from Bridgewater.", False, False),
    ("Kentville", "kentville-ns", "NS", "Nova Scotia", "Approximately 90 km from Bridgewater. Travel quoted.", False, False),
    ("Truro", "truro-ns", "NS", "Nova Scotia", "Approximately 150 km from Bridgewater. Travel quoted.", False, False),
    ("New Glasgow", "new-glasgow-ns", "NS", "Nova Scotia", "Approximately 175 km from Bridgewater. Travel quoted.", False, False),
    ("Wolfville", "wolfville-ns", "NS", "Nova Scotia", "Approximately 105 km from Bridgewater. Travel quoted.", False, False),
]
for city, slug_suffix, prov, prov_full, dist, is_cb, is_nb in WATER_CITIES:
    slug = f"water-slide-rentals-{slug_suffix}"
    if slug not in existing_slugs:
        new_pages.append(water_slide_page(city, slug_suffix, prov, prov_full, dist, is_cb, is_nb))

# --- Lawn game city pages ---
LAWN_CITIES = [
    ("Bridgewater", "bridgewater-ns", "NS", "Nova Scotia", "Based in Bridgewater.", False, False),
    ("Halifax", "halifax-ns", "NS", "Nova Scotia", "Approximately 100 km from Bridgewater. Travel quoted.", False, False),
    ("Dartmouth", "dartmouth-ns", "NS", "Nova Scotia", "Approximately 105 km from Bridgewater. Travel quoted.", False, False),
    ("Lunenburg", "lunenburg-ns", "NS", "Nova Scotia", "Approximately 15 km from Bridgewater.", False, False),
    ("Truro", "truro-ns", "NS", "Nova Scotia", "Approximately 150 km from Bridgewater. Travel quoted.", False, False),
    ("Kentville", "kentville-ns", "NS", "Nova Scotia", "Approximately 90 km from Bridgewater. Travel quoted.", False, False),
    ("South Shore", "south-shore-ns", "NS", "Nova Scotia", "Serving the South Shore region from Bridgewater.", False, False),
]
for city, slug_suffix, prov, prov_full, dist, is_cb, is_nb in LAWN_CITIES:
    slug = f"lawn-game-rentals-{slug_suffix}"
    if slug not in existing_slugs:
        new_pages.append(lawn_games_page(city, slug_suffix, prov, prov_full, dist, is_cb, is_nb))

# --- Party rentals pages for new cities ---
PARTY_CITIES = [
    ("Wolfville", "wolfville-ns", "NS", "Nova Scotia", "Approximately 105 km from Bridgewater. Travel quoted.", False, False),
    ("Annapolis Royal", "annapolis-royal-ns", "NS", "Nova Scotia", "Approximately 110 km from Bridgewater. Travel quoted.", False, False),
    ("Middleton", "middleton-ns", "NS", "Nova Scotia", "Approximately 100 km from Bridgewater. Travel quoted.", False, False),
    ("Bridgetown", "bridgetown-ns", "NS", "Nova Scotia", "Approximately 105 km from Bridgewater. Travel quoted.", False, False),
    ("New Glasgow", "new-glasgow-ns", "NS", "Nova Scotia", "Approximately 175 km from Bridgewater. Travel quoted.", False, False),
    ("Antigonish", "antigonish-ns", "NS", "Nova Scotia", "Approximately 200 km from Bridgewater. Travel quoted.", False, False),
    ("Amherst", "amherst-ns", "NS", "Nova Scotia", "Approximately 220 km from Bridgewater. Travel quoted.", False, False),
    ("Bedford", "bedford-ns", "NS", "Nova Scotia", "Approximately 110 km from Bridgewater. Travel quoted.", False, False),
    ("Lower Sackville", "lower-sackville-ns", "NS", "Nova Scotia", "Approximately 115 km from Bridgewater. Travel quoted.", False, False),
    ("Cole Harbour", "cole-harbour-ns", "NS", "Nova Scotia", "Approximately 110 km from Bridgewater. Travel quoted.", False, False),
    ("Fall River", "fall-river-ns", "NS", "Nova Scotia", "Approximately 115 km from Bridgewater. Travel quoted.", False, False),
    ("Glace Bay", "glace-bay-ns", "NS", "Nova Scotia", "Approximately 300 km from Bridgewater. Travel by quote.", True, False),
    ("North Sydney", "north-sydney-ns", "NS", "Nova Scotia", "Approximately 285 km from Bridgewater. Travel by quote.", True, False),
    ("Port Hawkesbury", "port-hawkesbury-ns", "NS", "Nova Scotia", "Approximately 225 km from Bridgewater. Travel by quote.", True, False),
    ("Inverness", "inverness-ns", "NS", "Nova Scotia", "Approximately 265 km from Bridgewater. Travel by quote.", True, False),
    ("Baddeck", "baddeck-ns", "NS", "Nova Scotia", "Approximately 265 km from Bridgewater. Travel by quote.", True, False),
    ("Pictou", "pictou-ns", "NS", "Nova Scotia", "Approximately 185 km from Bridgewater. Travel quoted.", False, False),
    ("Stellarton", "stellarton-ns", "NS", "Nova Scotia", "Approximately 175 km from Bridgewater. Travel quoted.", False, False),
    ("Windsor", "windsor-ns", "NS", "Nova Scotia", "Approximately 75 km from Bridgewater. Travel quoted.", False, False),
    ("Moncton", "moncton-nb", "NB", "New Brunswick", "Approximately 250 km from Bridgewater. Selected bookings by quote.", False, True),
    ("Fredericton", "fredericton-nb", "NB", "New Brunswick", "Approximately 320 km from Bridgewater. Selected bookings by quote.", False, True),
    ("Sackville", "sackville-nb", "NB", "New Brunswick", "Approximately 230 km from Bridgewater. Selected bookings by quote.", False, True),
    ("Sussex", "sussex-nb", "NB", "New Brunswick", "Approximately 290 km from Bridgewater. Selected bookings by quote.", False, True),
    ("Saint John", "saint-john-nb", "NB", "New Brunswick", "Approximately 350 km from Bridgewater. Selected bookings by quote.", False, True),
]
for city, slug_suffix, prov, prov_full, dist, is_cb, is_nb in PARTY_CITIES:
    slug = f"party-rentals-{slug_suffix}"
    if slug not in existing_slugs:
        new_pages.append(party_rentals_page(city, slug_suffix, prov, prov_full, dist, is_cb, is_nb))

# Deduplicate by slug
seen: set[str] = set()
deduped: list[dict] = []
for p in new_pages:
    if p["slug"] not in seen and p["slug"] not in existing_slugs:
        seen.add(p["slug"])
        deduped.append(p)

print(f"Generating {len(deduped)} new SEO pages (existing: {len(existing_data)})")

# ---------------------------------------------------------------------------
# Write updated seoPages.json
# ---------------------------------------------------------------------------
combined = existing_data + deduped
(ROOT / "data/seoPages.json").write_text(
    json.dumps(combined, ensure_ascii=False, indent=2),
    encoding="utf-8",
)
print("Updated data/seoPages.json")

# ---------------------------------------------------------------------------
# Update sitemap.xml — add new slugs
# ---------------------------------------------------------------------------
sitemap_path = ROOT / "sitemap.xml"
sitemap_text = sitemap_path.read_text(encoding="utf-8")

NS = "http://www.sitemaps.org/schemas/sitemap/0.9"
ET.register_namespace("", NS)
tree = ET.parse(sitemap_path)
root = tree.getroot()

existing_locs = {url.find(f"{{{NS}}}loc").text for url in root.findall(f"{{{NS}}}url")}

added = 0
for page in deduped:
    full_url = f"{BASE_URL}/{page['slug']}"
    if full_url not in existing_locs:
        url_el = ET.SubElement(root, f"{{{NS}}}url")
        ET.SubElement(url_el, f"{{{NS}}}loc").text = full_url
        ET.SubElement(url_el, f"{{{NS}}}lastmod").text = TODAY
        ET.SubElement(url_el, f"{{{NS}}}changefreq").text = "monthly"
        ET.SubElement(url_el, f"{{{NS}}}priority").text = "0.7"
        added += 1

ET.indent(tree, space="  ")
tree.write(sitemap_path, encoding="unicode", xml_declaration=True)
# Fix declaration line to match original format
sitemap_content = sitemap_path.read_text(encoding="utf-8")
if not sitemap_content.startswith('<?xml version=\'1.0\''):
    pass  # ET already wrote it
sitemap_path.write_text(
    '<?xml version="1.0" encoding="UTF-8"?>\n' + sitemap_content.split('\n', 1)[1],
    encoding="utf-8",
)
print(f"Updated sitemap.xml (+{added} URLs, total: {len(existing_locs) + added})")
print(f"\nNew slugs added:")
for p in deduped:
    print(f"  /{p['slug']}")
